import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getAdapter } from "../_shared/channel-adapter.ts";
import { guardCronOrStaff } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { classificarEvento } from "../_shared/comunicacaoCanal.ts";


const LIMITE_DIARIO_PADRAO = 3;
const MAX_RETRY = 4;
const TIMEZONE_OFICIAL = "America/Sao_Paulo";

function parseHoraMin(hora: string): number {
  const [h, m] = (hora || "0:0").split(":");
  return Number(h) * 60 + Number(m || 0);
}

function minutosLocais(date: Date, timeZone = TIMEZONE_OFICIAL): number {
  const hhmm = date.toLocaleTimeString("en-GB", {
    timeZone, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return parseHoraMin(hhmm);
}

function dentroJanela(date: Date, inicio: string, fim: string): boolean {
  const minutos = minutosLocais(date);
  return minutos >= parseHoraMin(inicio) && minutos < parseHoraMin(fim);
}

// --- Temporal reference helpers (mirror of src/lib/notificacoes.ts) ---
function localDateISO(instant: Date, timeZone = TIMEZONE_OFICIAL): string {
  return instant.toLocaleDateString("en-CA", { timeZone });
}

function formatarDataBR(data: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ""));
  if (!m) return String(data || "");
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function diffDiasCalendario(sessaoData: string, agora: Date, timeZone = TIMEZONE_OFICIAL): number {
  const hojeISO = localDateISO(agora, timeZone);
  const sessaoISO = String(sessaoData || "").slice(0, 10);
  const a = Date.parse(`${hojeISO}T00:00:00Z`);
  const b = Date.parse(`${sessaoISO}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

function referenciaTemporalLembrete(sessaoData: string, agora: Date, timeZone = TIMEZONE_OFICIAL): string {
  const dataFmt = formatarDataBR(sessaoData);
  const diff = diffDiasCalendario(sessaoData, agora, timeZone);
  if (diff === 0) return `hoje, ${dataFmt}`;
  if (diff === 1) return `amanhã, ${dataFmt}`;
  return `no dia ${dataFmt}`;
}

function sessaoInstante(sessaoData: string, horario: string, tzOffset = "-03:00"): Date {
  const d = String(sessaoData || "").slice(0, 10);
  const h = String(horario || "00:00").slice(0, 5);
  return new Date(`${d}T${h}:00${tzOffset}`);
}

function lembreteVencido(sessaoData: string, horario: string, agora: Date): boolean {
  const inst = sessaoInstante(sessaoData, horario);
  if (isNaN(inst.getTime())) return false;
  return agora.getTime() >= inst.getTime();
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

    // Optional controlled targeting for safe end-to-end validation.
    // When `fila_id` is provided, ONLY that single queue item is processed
    // (still subject to all the same eligibility rules below). This does NOT
    // change any business rule — it only narrows the selection for a test.
    const body = await req.json().catch(() => ({}));
    const filaId: string | undefined = body?.fila_id;
    const loteMax = Math.min(Math.max(Number(body?.lote_max) || 50, 1), 50);

    const nowIso = new Date().toISOString();
    // Eligible queue items: pending or scheduled-in-the-past, not exhausted.
    let filaQuery = admin
      .from("notificacoes_fila")
      .select("*")
      .in("status", ["pendente", "agendado"])
      .lte("scheduled_at", nowIso)
      .lt("retry_count", MAX_RETRY)
      .order("scheduled_at", { ascending: true })
      .limit(filaId ? 1 : loteMax);
    if (filaId) filaQuery = filaQuery.eq("id", filaId);

    const { data: itens, error } = await filaQuery;

    if (error) throw error;

    const result = { processados: 0, enviados: 0, ignorados: 0, falhas: 0, detalhes: [] as unknown[] };

    for (const item of itens || []) {
      result.processados++;
      const agora = new Date();

      // Load preferences + template
      const { data: pref } = await admin
        .from("notificacoes_preferencias")
        .select("whatsapp_ativo, comunicacao_geral_ativa, horario_inicio_envio, horario_fim_envio")
        .eq("assistido_id", item.assistido_id)
        .maybeSingle();

      const whatsappAtivo = pref ? pref.whatsapp_ativo : true; // default opt-in
      const comunicacaoGeralAtiva = pref ? pref.comunicacao_geral_ativa !== false : true;
      const janelaInicio = pref?.horario_inicio_envio || "08:00";
      const janelaFim = pref?.horario_fim_envio || "20:00";

      // Classificação geral × operacional (fonte única compartilhada).
      const classe = classificarEvento(item.evento_origem);

      // opt-out de canal (vale para qualquer mensagem)
      if (!whatsappAtivo) {
        await admin.from("notificacoes_fila").update({ status: "cancelado", erro: "opt_out" }).eq("id", item.id);
        await logFila(admin, item.id, "saida", null, null, "cancelado", "opt_out");
        result.ignorados++;
        continue;
      }
      // comunicações GERAIS respeitam a flag; operacionais NUNCA são bloqueadas por ela
      if (classe === "geral" && !comunicacaoGeralAtiva) {
        await admin.from("notificacoes_fila").update({ status: "cancelado", erro: "comunicacao_geral_desativada" }).eq("id", item.id);
        await logFila(admin, item.id, "saida", null, null, "cancelado", "comunicacao_geral_desativada");
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
      // daily limit (start of day in the official timezone)
      const startDay = new Date(`${localDateISO(agora)}T00:00:00-03:00`);
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

      // Build the payload for rendering. Session reminders get a temporal
      // reference computed at SEND time (timezone-aware) and a stale guard.
      const payload: Record<string, unknown> = { ...(item.payload_json || {}) };
      const ehLembreteSessao =
        item.evento_origem === "sessao_lembrete" || item.template_codigo === "sessao_lembrete";
      if (ehLembreteSessao) {
        const sessaoData = String((item.payload_json || {}).data || "");
        const horario = String((item.payload_json || {}).horario || "");
        // Do not send reminders for sessions that already started/passed.
        if (lembreteVencido(sessaoData, horario, agora)) {
          await admin.from("notificacoes_fila").update({ status: "cancelado", erro: "lembrete_vencido" }).eq("id", item.id);
          await logFila(admin, item.id, "saida", null, null, "cancelado", "lembrete_vencido");
          result.ignorados++;
          continue;
        }
        payload.quando = referenciaTemporalLembrete(sessaoData, agora);
      }

      const mensagem = renderTemplate(tpl.corpo_template, payload);
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
