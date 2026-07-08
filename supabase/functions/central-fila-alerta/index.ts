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

    // SAAS-05-E-EDGE-A: as RPCs `fila_humana_pendente` e `comunicadores_elegiveis`
    // permanecem legadas (single-tenant) neste recorte. A tenantização delas está
    // enfileirada para SAAS-05-E-EDGE-B/C. Enquanto isso, a fila e comunicadores
    // são globais — comportamento equivalente ao pré-SAAS-05. O carimbo do tenant
    // resolvido é registrado na auditoria de cada envio (campo `tenant_resolvido`).
    // Regras operacionais: consideramos apenas linhas globais nesta fase para
    // evitar aplicar override de tenant sem RPC tenant-aware disponível.
    const { data: regrasRows } = await admin
      .from("regras_operacionais")
      .select("chave, valor, ativo, instituicao_id")
      .like("chave", "central_alerta_%")
      .is("instituicao_id", null);
    const regras = parseRegras(regrasRows || []);

    if (!regras.ativo) {
      return json({ ok: true, skipped: "alerta_desativado" });
    }

    // 2) Estado oficial da fila humana (whatsapp_handoffs) — RPC legada,
    // ver comentário SAAS-05-E-EDGE-A acima. Não passa p_instituicao_id.
    const { data: filaRows, error: filaErr } = await admin.rpc("fila_humana_pendente");
    if (filaErr) return json({ error: "fila_humana_pendente", detail: filaErr.message }, 500);
    const filaRaw = Array.isArray(filaRows) ? filaRows[0] : filaRows;
    const estado: EstadoFila = {
      total_pendentes: Number(filaRaw?.total_pendentes ?? 0),
      idade_mais_antiga_min: Number(filaRaw?.idade_mais_antiga_min ?? 0),
    };

    // 3) Validar gatilho global
    const gatilho = avaliarGatilho(estado, regras);
    if (!gatilho.disparar) {
      return json({ ok: true, skipped: "sem_gatilho", estado });
    }

    // 4) Comunicadores elegíveis — RPC legada (ver comentário SAAS-05-E-EDGE-A acima).
    const { data: elegiveis, error: elegErr } = await admin.rpc("comunicadores_elegiveis");
    if (elegErr) return json({ error: "comunicadores_elegiveis", detail: elegErr.message }, 500);

    const adapter = getAdapter({
      ZAPI_INSTANCE_ID: Deno.env.get("ZAPI_INSTANCE_ID"),
      ZAPI_INSTANCE_TOKEN: Deno.env.get("ZAPI_INSTANCE_TOKEN"),
      ZAPI_BASE_URL: Deno.env.get("ZAPI_BASE_URL"),
      ZAPI_CLIENT_TOKEN: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    });

    const agora = new Date();
    const mensagem = montarMensagem(estado);
    let enviados = 0;
    let pulados = 0;
    const erros: string[] = [];

    for (const c of (elegiveis || []) as Array<{ user_id: string; celular: string }>) {
      const telefone = normalizePhone(c.celular);
      if (!telefone) { pulados++; continue; }

      // Reler estado individual (cooldown/snapshot) imediatamente antes do envio (idempotência)
      const { data: cfg } = await admin
        .from("comunicador_alerta_config")
        .select("ultimo_alerta_em, ultimo_snapshot, recebe_alertas_central, ativo")
        .eq("user_id", c.user_id)
        .maybeSingle();

      if (!cfg || !cfg.recebe_alertas_central || !cfg.ativo) { pulados++; continue; }

      const snapAnterior = (cfg.ultimo_snapshot as FilaSnapshot | null) ?? null;
      if (!deveEnviar(estado, gatilho.disparar, cfg.ultimo_alerta_em ?? null, snapAnterior, regras, agora)) {
        pulados++;
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
        // Atualiza estado de cooldown/snapshot apenas em envio bem-sucedido.
        await admin
          .from("comunicador_alerta_config")
          .update({ ultimo_alerta_em: agora.toISOString(), ultimo_snapshot: snapNovo })
          .eq("user_id", c.user_id);
        enviados++;
      } else {
        erros.push(`${c.user_id}:${res.error ?? "erro"}`);
      }

      // Auditoria do disparo (sucesso ou falha)
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
        },
      });
    }

    return json({ ok: true, estado, gatilho: gatilho.motivo, enviados, pulados, erros });
  } catch (e) {
    return json({ error: "internal", detail: String(e) }, 500);
  }
});
