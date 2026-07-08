import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { guardCronOrStaff } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getAdapter } from "../_shared/channel-adapter.ts";

// ---- Lógica pura (espelha src/lib/centralAlerta.ts; mantida inline para o runtime Deno) ----
interface RegrasAlerta {
  ativo: boolean;
  minutosPendencia: number;
  minPendencias: number;
  cooldownMin: number;
  pioraMinutos: number;
}
interface EstadoFila { total_pendentes: number; idade_mais_antiga_min: number; }
interface FilaSnapshot extends EstadoFila { gerado_em: string; motivo_disparo?: string; }

function parseRegras(rows: Array<{ chave: string; valor: string; ativo: boolean }>): RegrasAlerta {
  const get = (c: string) => rows.find((r) => r.chave === c);
  const num = (c: string, d: number) => {
    const r = get(c); if (!r) return d;
    const n = parseInt(r.valor, 10); return Number.isFinite(n) ? n : d;
  };
  const a = get("central_alerta_ativo");
  return {
    ativo: a ? a.valor === "true" && a.ativo : true,
    minutosPendencia: num("central_alerta_minutos_pendencia", 10),
    minPendencias: num("central_alerta_min_pendencias", 2),
    cooldownMin: num("central_alerta_cooldown_min", 30),
    pioraMinutos: num("central_alerta_piora_minutos", 5),
  };
}

function avaliarGatilho(e: EstadoFila, r: RegrasAlerta): { disparar: boolean; motivo: string | null } {
  if (!r.ativo || e.total_pendentes <= 0) return { disparar: false, motivo: null };
  const t = e.idade_mais_antiga_min > r.minutosPendencia;
  const v = e.total_pendentes >= r.minPendencias;
  if (!t && !v) return { disparar: false, motivo: null };
  return { disparar: true, motivo: t && v ? "tempo+volume" : t ? "tempo" : "volume" };
}

function houvePiora(e: EstadoFila, s: FilaSnapshot | null, r: RegrasAlerta): boolean {
  if (!s) return true;
  if (e.total_pendentes > s.total_pendentes) return true;
  return e.idade_mais_antiga_min - s.idade_mais_antiga_min >= r.pioraMinutos;
}

function deveEnviar(e: EstadoFila, disparar: boolean, ultimoAlertaEm: string | null, snap: FilaSnapshot | null, r: RegrasAlerta, agora: Date): boolean {
  if (!disparar) return false;
  if (!ultimoAlertaEm) return true;
  const mins = (agora.getTime() - new Date(ultimoAlertaEm).getTime()) / 60000;
  if (mins >= r.cooldownMin) return true;
  return houvePiora(e, snap, r);
}

function montarMensagem(e: EstadoFila): string {
  const plural = e.total_pendentes === 1 ? "conversa" : "conversas";
  return `Central FER: há ${e.total_pendentes} ${plural} aguardando atendimento humano ` +
    `(mais antiga há ${e.idade_mais_antiga_min} min). Acesse a Central para assumir a fila.`;
}

function normalizePhone(p: string): string { return (p || "").replace(/\D/g, ""); }

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "authorization, x-client-info, apikey, content-type, x-cron-secret");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const guard = await guardCronOrStaff(req, ["admin"]);
  if (!guard.ok) return guard.response!;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // SAAS-05-E-EDGE-A2: fila_humana_pendente e comunicadores_elegiveis agora
    // possuem overloads tenant-aware (p_instituicao_id uuid). A central passa
    // a operar em loop por instituição — nenhum vazamento cross-tenant.
    // Regras `central_alerta_*` seguem restritas às globais nesta fase
    // (overrides por tenant ficam para recorte futuro).
    const { data: regrasRows } = await admin
      .from("regras_operacionais")
      .select("chave, valor, ativo, instituicao_id")
      .like("chave", "central_alerta_%")
      .is("instituicao_id", null);
    const regras = parseRegras(regrasRows || []);

    if (!regras.ativo) {
      return json({ ok: true, skipped: "alerta_desativado" });
    }

    // Enumerar instituições ativas. Se vazio, cai para modo legado single-tenant
    // (chamando as assinaturas sem parâmetro) apenas até o cutover SAAS-05-F.
    const { data: instituicoesRows } = await admin.from("instituicoes").select("id");
    const tenantsIds: (string | null)[] =
      (instituicoesRows || []).length > 0
        ? (instituicoesRows || []).map((r: any) => r.id)
        : [null];

    const adapter = getAdapter({
      ZAPI_INSTANCE_ID: Deno.env.get("ZAPI_INSTANCE_ID"),
      ZAPI_INSTANCE_TOKEN: Deno.env.get("ZAPI_INSTANCE_TOKEN"),
      ZAPI_BASE_URL: Deno.env.get("ZAPI_BASE_URL"),
      ZAPI_CLIENT_TOKEN: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    });

    const agora = new Date();
    let enviadosTotal = 0;
    let puladosTotal = 0;
    const errosTotal: string[] = [];
    const porTenant: Array<Record<string, unknown>> = [];

    for (const tenantId of tenantsIds) {
      // 1) Estado da fila humana — overload tenant-aware quando tenantId != null.
      const filaCall = tenantId
        ? admin.rpc("fila_humana_pendente", { p_instituicao_id: tenantId })
        : admin.rpc("fila_humana_pendente");
      const { data: filaRows, error: filaErr } = await filaCall;
      if (filaErr) {
        errosTotal.push(`${tenantId ?? "legacy"}:fila_humana_pendente:${filaErr.message}`);
        continue;
      }
      const filaRaw = Array.isArray(filaRows) ? filaRows[0] : filaRows;
      const estado: EstadoFila = {
        total_pendentes: Number(filaRaw?.total_pendentes ?? 0),
        idade_mais_antiga_min: Number(filaRaw?.idade_mais_antiga_min ?? 0),
      };

      const gatilho = avaliarGatilho(estado, regras);
      if (!gatilho.disparar) {
        porTenant.push({ tenant: tenantId, skipped: "sem_gatilho", estado });
        continue;
      }

      // 2) Comunicadores elegíveis — overload tenant-aware quando tenantId != null.
      const elegCall = tenantId
        ? admin.rpc("comunicadores_elegiveis", { p_instituicao_id: tenantId })
        : admin.rpc("comunicadores_elegiveis");
      const { data: elegiveis, error: elegErr } = await elegCall;
      if (elegErr) {
        errosTotal.push(`${tenantId ?? "legacy"}:comunicadores_elegiveis:${elegErr.message}`);
        continue;
      }

      const mensagem = montarMensagem(estado);
      let enviadosTenant = 0;
      let puladosTenant = 0;

      for (const c of (elegiveis || []) as Array<{ user_id: string; celular: string }>) {
        const telefone = normalizePhone(c.celular);
        if (!telefone) { puladosTenant++; continue; }

        const { data: cfg } = await admin
          .from("comunicador_alerta_config")
          .select("ultimo_alerta_em, ultimo_snapshot, recebe_alertas_central, ativo")
          .eq("user_id", c.user_id)
          .maybeSingle();

        if (!cfg || !cfg.recebe_alertas_central || !cfg.ativo) { puladosTenant++; continue; }

        const snapAnterior = (cfg.ultimo_snapshot as FilaSnapshot | null) ?? null;
        if (!deveEnviar(estado, gatilho.disparar, cfg.ultimo_alerta_em ?? null, snapAnterior, regras, agora)) {
          puladosTenant++;
          continue;
        }

        const snapNovo: FilaSnapshot = {
          total_pendentes: estado.total_pendentes,
          idade_mais_antiga_min: estado.idade_mais_antiga_min,
          gerado_em: agora.toISOString(),
          motivo_disparo: gatilho.motivo ?? undefined,
        };

        const res = await adapter.send(telefone, mensagem);

        if (res.ok) {
          await admin
            .from("comunicador_alerta_config")
            .update({ ultimo_alerta_em: agora.toISOString(), ultimo_snapshot: snapNovo })
            .eq("user_id", c.user_id);
          enviadosTenant++;
        } else {
          errosTotal.push(`${tenantId ?? "legacy"}:${c.user_id}:${res.error ?? "erro"}`);
        }

        // Auditoria com tenant resolvido (SAAS-05-E-EDGE-A2).
        await admin.from("audit_logs").insert({
          tabela: "comunicador_alerta_config",
          acao: "ALERTA_CENTRAL_ENVIADO",
          registro_id: c.user_id,
          dados_novos: {
            comunicador_user_id: c.user_id,
            telefone_destino_normalizado: telefone,
            gatilho_acionado: gatilho.motivo,
            total_pendentes: estado.total_pendentes,
            idade_mais_antiga_min: estado.idade_mais_antiga_min,
            snapshot_anterior: snapAnterior,
            snapshot_novo: snapNovo,
            consolidado: true,
            enviado: res.ok,
            erro: res.ok ? null : (res.error ?? "erro"),
            tenant_resolvido: tenantId,
            saas05_e_edge_a2: tenantId ? "tenant_aware" : "fallback_legacy",
          },
        });
      }

      enviadosTotal += enviadosTenant;
      puladosTotal += puladosTenant;
      porTenant.push({
        tenant: tenantId,
        estado,
        gatilho: gatilho.motivo,
        enviados: enviadosTenant,
        pulados: puladosTenant,
      });
    }

    return json({
      ok: true,
      tenants_avaliados: tenantsIds.length,
      enviados: enviadosTotal,
      pulados: puladosTotal,
      erros: errosTotal,
      por_tenant: porTenant,
    });
  } catch (e) {
    return json({ error: "internal", detail: String(e) }, 500);
  }
});
