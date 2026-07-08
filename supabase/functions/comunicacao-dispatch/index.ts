import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getAdapter } from "../_shared/channel-adapter.ts";
import { guardCronOrStaff } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

/**
 * Módulo 5B — Disparo institucional em lotes, com limites e proteção anti-spam.
 *
 * Fila própria e isolada das notificações operacionais (`notificacoes_fila`).
 * Regras aplicadas em cada execução:
 *  - processa apenas itens `pendente` de comunicações `aprovada` em envio
 *  - lote máximo por execução (escalonamento)
 *  - janela horária de envio (08:00–20:00 por padrão)
 *  - reconfirmação de consentimento no momento do envio (respeito absoluto ao opt-out)
 *  - pequeno intervalo entre mensagens (anti-spam / reputação)
 *  - auditoria e observabilidade via contadores na comunicação
 */

const LOTE_MAX_PADRAO = 25;
const LOTE_MAX_TETO = 100;
const MAX_RETRY = 4;
const INTERVALO_MS = 1200; // escalonamento entre mensagens
const JANELA_INICIO = "08:00";
const JANELA_FIM = "20:00";

function parseHoraMin(hora: string): number {
  const [h, m] = (hora || "0:0").split(":");
  return Number(h) * 60 + Number(m || 0);
}

function dentroJanela(date: Date, inicio: string, fim: string): boolean {
  const minutos = date.getHours() * 60 + date.getMinutes();
  return minutos >= parseHoraMin(inicio) && minutos < parseHoraMin(fim);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(
    req,
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  );
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Apenas cron interno (com segredo) ou administradores podem disparar.
  const guard = await guardCronOrStaff(req, ["admin"]);
  if (!guard.ok) return guard.response!;

  try {
    const body = await req.json().catch(() => ({}));
    const comunicacaoId: string | undefined = body?.comunicacao_id;
    const loteMax = Math.min(
      Math.max(Number(body?.lote_max) || LOTE_MAX_PADRAO, 1),
      LOTE_MAX_TETO,
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const adapter = getAdapter({
      ZAPI_INSTANCE_ID: Deno.env.get("ZAPI_INSTANCE_ID"),
      ZAPI_INSTANCE_TOKEN: Deno.env.get("ZAPI_INSTANCE_TOKEN"),
      ZAPI_BASE_URL: Deno.env.get("ZAPI_BASE_URL"),
      ZAPI_CLIENT_TOKEN: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    });

    const agora = new Date();
    if (!dentroJanela(agora, JANELA_INICIO, JANELA_FIM)) {
      return new Response(
        JSON.stringify({ ignorado: true, motivo: "fora_da_janela" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SAAS-05-E-EDGE-B: cada comunicacao já é ancorada em instituicao_id.
    // Selecionamos o tenant a partir da comunicação e validamos, na iteração
    // dos envios, que o assistido pertence ao mesmo tenant (fail-closed).
    let comQuery = admin
      .from("comunicacoes_institucionais")
      .select("id, mensagem, status, envio_status, instituicao_id")
      .eq("status", "aprovada")
      .in("envio_status", ["preparado", "em_andamento"]);
    if (comunicacaoId) comQuery = admin
      .from("comunicacoes_institucionais")
      .select("id, mensagem, status, envio_status, instituicao_id")
      .eq("id", comunicacaoId)
      .eq("status", "aprovada")
      .in("envio_status", ["preparado", "em_andamento"]);

    const { data: comunicacoes, error: comErr } = await comQuery;
    if (comErr) throw comErr;

    const result = {
      lote_max: loteMax,
      processados: 0,
      enviados: 0,
      bloqueados: 0,
      falhas: 0,
      concluidas: [] as string[],
    };

    let restante = loteMax;

    for (const com of comunicacoes || []) {
      if (restante <= 0) break;

      // Marca início do envio.
      if (com.envio_status === "preparado") {
        await admin
          .from("comunicacoes_institucionais")
          .update({ envio_status: "em_andamento", envio_iniciado_at: new Date().toISOString() })
          .eq("id", com.id);
      }

      const { data: pendentes, error: pendErr } = await admin
        .from("comunicacoes_institucionais_envios")
        .select("*")
        .eq("comunicacao_id", com.id)
        .eq("status", "pendente")
        .lt("retry_count", MAX_RETRY)
        .order("created_at", { ascending: true })
        .limit(restante);
      if (pendErr) throw pendErr;

      for (const env of pendentes || []) {
        if (restante <= 0) break;
        restante--;
        result.processados++;

        // SAAS-05-E-EDGE-B: fail-closed em ambiguidade cross-tenant.
        // Quando a comunicacao carrega instituicao_id, o assistido destinatário
        // precisa pertencer ao MESMO tenant. Envios legados (comunicacao ou
        // assistido sem instituicao_id) seguem no fluxo pré-cutover.
        const tenantComunicacao = (com.instituicao_id as string | null) ?? null;
        let tenantResolvido: string | null = tenantComunicacao;
        let origemTenant = tenantComunicacao ? "comunicacao" : "pre_cutover";
        if (tenantComunicacao) {
          const { data: aTenant } = await admin
            .from("assistidos")
            .select("instituicao_id")
            .eq("id", env.assistido_id)
            .maybeSingle();
          const tenantAssistido = (aTenant?.instituicao_id as string | null) ?? null;
          if (tenantAssistido && tenantAssistido !== tenantComunicacao) {
            await admin
              .from("comunicacoes_institucionais_envios")
              .update({ status: "bloqueado", motivo: "tenant_mismatch" })
              .eq("id", env.id);
            await admin.from("audit_logs").insert({
              tabela: "comunicacoes_institucionais_envios",
              acao: "SAAS05_E_EDGE_B_TENANT_MISMATCH",
              registro_id: env.id,
              dados_novos: {
                tenant_comunicacao: tenantComunicacao,
                tenant_assistido: tenantAssistido,
                marcador: "saas05_e_edge_b",
              },
            });
            result.bloqueados++;
            continue;
          }
          tenantResolvido = tenantComunicacao;
          origemTenant = tenantAssistido ? "match_comunicacao_assistido" : "comunicacao";
        }

        // 1) Reconfirma consentimento e preferência de comunicação geral no
        //    momento do envio. Comunicações institucionais são SEMPRE "geral",
        //    portanto respeitam tanto o opt-out de canal quanto a flag geral.
        const { data: pref } = await admin
          .from("notificacoes_preferencias")
          .select("whatsapp_ativo, consentimento_status, comunicacao_geral_ativa")
          .eq("assistido_id", env.assistido_id)
          .maybeSingle();

        // Modelo OPT-OUT: as comunicações da casa nascem ATIVAS por padrão.
        // Só bloqueia quando há opt-out EXPLÍCITO de canal (whatsapp_ativo=false)
        // ou consentimento revogado. Estados ausente/`pendente` => permitido.
        const canalBloqueado =
          pref && (pref.whatsapp_ativo === false || pref.consentimento_status === "revogado");

        if (canalBloqueado) {
          await admin
            .from("comunicacoes_institucionais_envios")
            .update({ status: "bloqueado", motivo: "consentimento_revogado" })
            .eq("id", env.id);
          result.bloqueados++;
          continue;
        }

        // Preferência de comunicações gerais/da casa (default true quando ausente).
        const aceitaGeral = !pref || pref.comunicacao_geral_ativa !== false;
        if (!aceitaGeral) {
          await admin
            .from("comunicacoes_institucionais_envios")
            .update({ status: "bloqueado", motivo: "comunicacao_geral_desativada" })
            .eq("id", env.id);
          result.bloqueados++;
          continue;
        }

        // 2) Telefone obrigatório.
        if (!env.telefone_normalizado) {
          await admin
            .from("comunicacoes_institucionais_envios")
            .update({ status: "bloqueado", motivo: "sem_telefone" })
            .eq("id", env.id);
          result.bloqueados++;
          continue;
        }

        // 3) Envio pelo adaptador de canal.
        const send = await adapter.send(env.telefone_normalizado, com.mensagem);
        if (send.ok) {
          await admin
            .from("comunicacoes_institucionais_envios")
            .update({
              status: "enviado",
              sent_at: new Date().toISOString(),
              external_message_id: send.externalMessageId || null,
              erro: null,
            })
            .eq("id", env.id);
          result.enviados++;
        } else {
          const nextRetry = (env.retry_count || 0) + 1;
          await admin
            .from("comunicacoes_institucionais_envios")
            .update({
              status: nextRetry >= MAX_RETRY ? "falha" : "pendente",
              retry_count: nextRetry,
              scheduled_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
              erro: send.error || "erro_envio",
            })
            .eq("id", env.id);
          result.falhas++;
        }

        await sleep(INTERVALO_MS);
      }

      // Atualiza contadores e fecha o envio se não restarem pendências.
      const { data: contagem } = await admin
        .from("comunicacoes_institucionais_envios")
        .select("status")
        .eq("comunicacao_id", com.id);
      const enviados = (contagem || []).filter((r) => r.status === "enviado").length;
      const falhas = (contagem || []).filter((r) => r.status === "falha").length;
      const bloqueados = (contagem || []).filter((r) => r.status === "bloqueado").length;
      const pend = (contagem || []).filter((r) => r.status === "pendente").length;

      await admin
        .from("comunicacoes_institucionais")
        .update({
          total_enviados: enviados,
          total_falhas: falhas,
          total_bloqueados: bloqueados,
          ...(pend === 0
            ? { envio_status: "concluido", envio_concluido_at: new Date().toISOString() }
            : {}),
        })
        .eq("id", com.id);

      if (pend === 0) {
        result.concluidas.push(com.id);
        await admin.from("audit_logs").insert({
          tabela: "comunicacoes_institucionais",
          acao: "ENVIO_CONCLUIDO",
          registro_id: com.id,
          dados_novos: {
            enviados,
            falhas,
            bloqueados,
            // SAAS-05-E-EDGE-B: tenant_resolvido a partir da comunicação.
            tenant_resolvido: (com.instituicao_id as string | null) ?? null,
            marcador: "saas05_e_edge_b",
          },
        });
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
