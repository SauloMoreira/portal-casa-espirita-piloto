import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getAdapter } from "../_shared/channel-adapter.ts";
import { guardCronOrStaff } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";


const LIMITE_DIARIO_PADRAO = 3;
const MAX_RETRY = 4;

function parseHoraMin(hora: string): number {
  const [h, m] = (hora || "0:0").split(":");
  return Number(h) * 60 + Number(m || 0);
}

function dentroJanela(date: Date, inicio: string, fim: string): boolean {
  const minutos = date.getHours() * 60 + date.getMinutes();
  return minutos >= parseHoraMin(inicio) && minutos < parseHoraMin(fim);
}

function renderTemplate(corpo: string, payload: Record<string, unknown>): string {
  return corpo
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
      const raw = payload[key];
      if (raw === undefined || raw === null || raw === "") return "";
      const value = String(raw);
      if (key === "data" && /\d{4}-\d{2}-\d{2}/.test(value)) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) {
          const hasTime = value.includes("T") && !value.endsWith("T00:00:00.000Z");
          return d.toLocaleDateString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            ...(hasTime ? { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" } : {}),
          });
        }
      }
      if (key === "horario") return value.slice(0, 5);
      return value;
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "authorization, x-client-info, apikey, content-type, x-cron-secret");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Only internal cron (with secret) or admins/coordenadores may dispatch the queue.
  const guard = await guardCronOrStaff(req, ["admin", "coordenador_de_tratamento"]);
  if (!guard.ok) return guard.response!;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const adapter = getAdapter({
      ZAPI_INSTANCE_ID: Deno.env.get("ZAPI_INSTANCE_ID"),
      ZAPI_INSTANCE_TOKEN: Deno.env.get("ZAPI_INSTANCE_TOKEN"),
      ZAPI_BASE_URL: Deno.env.get("ZAPI_BASE_URL"),
      ZAPI_CLIENT_TOKEN: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    });

    const nowIso = new Date().toISOString();
    // Eligible queue items: pending or scheduled-in-the-past, not exhausted.
    const { data: itens, error } = await admin
      .from("notificacoes_fila")
      .select("*")
      .in("status", ["pendente", "agendado"])
      .lte("scheduled_at", nowIso)
      .lt("retry_count", MAX_RETRY)
      .order("scheduled_at", { ascending: true })
      .limit(50);

    if (error) throw error;

    const result = { processados: 0, enviados: 0, ignorados: 0, falhas: 0, detalhes: [] as unknown[] };

    for (const item of itens || []) {
      result.processados++;
      const agora = new Date();

      // Load preferences + template
      const { data: pref } = await admin
        .from("notificacoes_preferencias")
        .select("whatsapp_ativo, horario_inicio_envio, horario_fim_envio")
        .eq("assistido_id", item.assistido_id)
        .maybeSingle();

      const whatsappAtivo = pref ? pref.whatsapp_ativo : true; // default opt-in
      const janelaInicio = pref?.horario_inicio_envio || "08:00";
      const janelaFim = pref?.horario_fim_envio || "20:00";

      // opt-out
      if (!whatsappAtivo) {
        await admin.from("notificacoes_fila").update({ status: "cancelado", erro: "opt_out" }).eq("id", item.id);
        await logFila(admin, item.id, "saida", null, null, "cancelado", "opt_out");
        result.ignorados++;
        continue;
      }
      // phone
      if (!item.telefone_normalizado) {
        await admin.from("notificacoes_fila").update({ status: "falha", erro: "sem_telefone" }).eq("id", item.id);
        await logFila(admin, item.id, "saida", null, null, "falha", "sem_telefone");
        result.falhas++;
        continue;
      }
      // window — leave scheduled for the next run
      if (!dentroJanela(agora, janelaInicio, janelaFim)) {
        result.ignorados++;
        continue;
      }
      // daily limit
      const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
      const { count } = await admin
        .from("notificacoes_fila")
        .select("id", { count: "exact", head: true })
        .eq("assistido_id", item.assistido_id)
        .eq("status", "enviado")
        .gte("sent_at", startDay.toISOString());
      if ((count || 0) >= LIMITE_DIARIO_PADRAO) {
        result.ignorados++;
        continue;
      }

      // Render template
      const { data: tpl } = await admin
        .from("notificacoes_templates")
        .select("corpo_template, ativo")
        .eq("codigo_template", item.template_codigo)
        .maybeSingle();
      if (!tpl || !tpl.ativo) {
        await admin.from("notificacoes_fila").update({ status: "falha", erro: "template_indisponivel" }).eq("id", item.id);
        await logFila(admin, item.id, "saida", null, null, "falha", "template_indisponivel");
        result.falhas++;
        continue;
      }

      const mensagem = renderTemplate(tpl.corpo_template, item.payload_json || {});
      const send = await adapter.send(item.telefone_normalizado, mensagem);
      await logFila(admin, item.id, "saida", { telefone: item.telefone_normalizado, mensagem }, send.raw ?? null, send.ok ? "enviado" : "falha", send.error);

      if (send.ok) {
        await admin.from("notificacoes_fila").update({
          status: "enviado", sent_at: new Date().toISOString(),
          external_message_id: send.externalMessageId || null, erro: null,
        }).eq("id", item.id);
        result.enviados++;
      } else {
        const nextRetry = (item.retry_count || 0) + 1;
        await admin.from("notificacoes_fila").update({
          status: nextRetry >= MAX_RETRY ? "falha" : "agendado",
          retry_count: nextRetry,
          scheduled_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          erro: send.error || "erro_envio",
        }).eq("id", item.id);
        result.falhas++;
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function logFila(
  admin: ReturnType<typeof createClient>,
  filaId: string,
  direcao: "saida" | "entrada",
  enviado: unknown,
  recebido: unknown,
  status: string,
  erro?: string,
) {
  await admin.from("notificacoes_log").insert({
    fila_id: filaId,
    direcao,
    payload_enviado: enviado ?? null,
    payload_recebido: recebido ?? null,
    status,
    erro: erro ?? null,
  });
}
