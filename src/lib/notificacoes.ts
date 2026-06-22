/**
 * Pure logic for the Central de Notificações (WhatsApp channel).
 *
 * Kept provider-agnostic and side-effect free so the anti-spam rules,
 * template rendering and AI triage can be unit tested independently of the
 * Z-API adapter and the database. The edge functions reuse the same rules.
 */

export const LIMITE_DIARIO_PADRAO = 3;
export const JANELA_INICIO_PADRAO = "08:00";
export const JANELA_FIM_PADRAO = "20:00";

export type NotifEvento =
  | "entrevista_criada"
  | "entrevista_lembrete"
  | "sessao_criada"
  | "sessao_lembrete"
  | "remarcacao"
  | "cancelamento";

export type NotifStatus = "pendente" | "agendado" | "enviado" | "falha" | "cancelado";

/** Render a `{{var}}` template against a payload, formatting dates/times for pt-BR. */
export function renderTemplate(
  corpo: string,
  payload: Record<string, unknown>,
): string {
  return corpo.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const raw = payload[key];
    if (raw === undefined || raw === null || raw === "") return "";
    return formatValue(key, raw);
  }).replace(/\s{2,}/g, " ").trim();
}

function formatValue(key: string, raw: unknown): string {
  const value = String(raw);
  if (key === "data") {
    // Accept ISO datetime or date-only.
    const d = new Date(value);
    if (!isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}/.test(value)) {
      const hasTime = value.includes("T") && !value.endsWith("T00:00:00.000Z");
      return d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(hasTime ? { hour: "2-digit", minute: "2-digit" } : {}),
      });
    }
  }
  if (key === "horario") {
    // Trim seconds from a HH:MM:SS time.
    return value.slice(0, 5);
  }
  return value;
}

// ============================================================================
// Reminder temporal reference (hoje / amanhã / data completa)
// ============================================================================

/** Official operational timezone of the institution. */
export const TIMEZONE_OFICIAL = "America/Sao_Paulo";

/** Returns the local calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDateISO(instant: Date, timeZone: string = TIMEZONE_OFICIAL): string {
  // en-CA renders as YYYY-MM-DD.
  return instant.toLocaleDateString("en-CA", { timeZone });
}

/** Format an ISO date (YYYY-MM-DD...) as DD/MM/YYYY. */
export function formatarDataBR(data: string): string {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ""));
  if (!m) return String(data || "");
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Whole-calendar-day difference between the session date and "now", both
 * evaluated in the official timezone. 0 = same day, 1 = next day, etc.
 */
export function diffDiasCalendario(
  sessaoData: string,
  agora: Date,
  timeZone: string = TIMEZONE_OFICIAL,
): number {
  const hojeISO = localDateISO(agora, timeZone);
  const sessaoISO = String(sessaoData || "").slice(0, 10);
  const a = Date.parse(`${hojeISO}T00:00:00Z`);
  const b = Date.parse(`${sessaoISO}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Builds the natural temporal reference compared at SEND time:
 *  - same local day   → "hoje, DD/MM/YYYY"
 *  - next local day   → "amanhã, DD/MM/YYYY"
 *  - otherwise        → "no dia DD/MM/YYYY"
 */
export function referenciaTemporalLembrete(
  sessaoData: string,
  agora: Date,
  timeZone: string = TIMEZONE_OFICIAL,
): string {
  const dataFmt = formatarDataBR(sessaoData);
  const diff = diffDiasCalendario(sessaoData, agora, timeZone);
  if (diff === 0) return `hoje, ${dataFmt}`;
  if (diff === 1) return `amanhã, ${dataFmt}`;
  return `no dia ${dataFmt}`;
}

/** Builds the session start instant from date + time in the official timezone. */
export function sessaoInstante(
  sessaoData: string,
  horario: string,
  // São Paulo no longer observes DST → fixed -03:00.
  tzOffset: string = "-03:00",
): Date {
  const d = String(sessaoData || "").slice(0, 10);
  const h = String(horario || "00:00").slice(0, 5);
  return new Date(`${d}T${h}:00${tzOffset}`);
}

/**
 * A reminder is stale/expired when, at dispatch time, the session has already
 * started or passed (now >= session start). Such items must NOT be sent.
 */
export function lembreteVencido(
  sessaoData: string,
  horario: string,
  agora: Date,
): boolean {
  const inst = sessaoInstante(sessaoData, horario);
  if (isNaN(inst.getTime())) return false;
  return agora.getTime() >= inst.getTime();
}

/** Parse a "HH:MM" or "HH:MM:SS" string into minutes since midnight. */
export function parseHoraMin(hora: string): number {
  const [h, m] = hora.split(":");
  return Number(h) * 60 + Number(m || 0);
}

/**
 * True when `date` falls inside the allowed sending window (inclusive start,
 * exclusive end) in the provided local-minute-of-day. Defaults to 08:00–20:00.
 */
export function dentroJanela(
  date: Date,
  inicio: string = JANELA_INICIO_PADRAO,
  fim: string = JANELA_FIM_PADRAO,
): boolean {
  const minutos = date.getHours() * 60 + date.getMinutes();
  return minutos >= parseHoraMin(inicio) && minutos < parseHoraMin(fim);
}

/** True when the daily operational message cap was reached for a recipient. */
export function limiteDiarioAtingido(
  enviadosHoje: number,
  limite: number = LIMITE_DIARIO_PADRAO,
): boolean {
  return enviadosHoje >= limite;
}

export interface PodeEnviarInput {
  whatsappAtivo: boolean;
  telefone: string | null | undefined;
  agora: Date;
  enviadosHoje: number;
  janelaInicio?: string;
  janelaFim?: string;
  limiteDiario?: number;
}

export interface PodeEnviarResult {
  enviar: boolean;
  motivo?: "opt_out" | "sem_telefone" | "fora_janela" | "limite_diario";
}

/** Central anti-spam gate: applies opt-out, phone, window and daily-limit rules. */
export function podeEnviar(input: PodeEnviarInput): PodeEnviarResult {
  if (!input.whatsappAtivo) return { enviar: false, motivo: "opt_out" };
  if (!input.telefone) return { enviar: false, motivo: "sem_telefone" };
  if (!dentroJanela(input.agora, input.janelaInicio, input.janelaFim)) {
    return { enviar: false, motivo: "fora_janela" };
  }
  if (limiteDiarioAtingido(input.enviadosHoje, input.limiteDiario)) {
    return { enviar: false, motivo: "limite_diario" };
  }
  return { enviar: true };
}

// ============================================================================
// Inbound AI triage (keyword fallback / deterministic classification)
// ============================================================================

export type IntencaoInbound =
  | "proxima_sessao"
  | "horario_entrevista"
  | "confirmacao_agendamento"
  | "onde_ver_app"
  | "opt_out"
  | "reativar"
  | "complexo";

const INTENT_KEYWORDS: Array<{ intent: IntencaoInbound; terms: string[] }> = [
  { intent: "opt_out", terms: ["parar", "cancelar mensagens", "nao quero", "não quero", "sair", "descadastr", "remover"] },
  { intent: "reativar", terms: ["voltar a receber", "reativar", "quero receber"] },
  { intent: "proxima_sessao", terms: ["proxima sessao", "próxima sessão", "minha sessao", "quando é minha sessao", "quando e minha sessao"] },
  { intent: "horario_entrevista", terms: ["entrevista", "horario da entrevista", "horário da entrevista"] },
  { intent: "confirmacao_agendamento", terms: ["confirmar", "confirmado", "ta marcado", "tá marcado", "esta marcado"] },
  { intent: "onde_ver_app", terms: ["app", "aplicativo", "onde vejo", "onde ver", "sistema", "site"] },
];

const SENSITIVE_TERMS = [
  "reclama", "absurdo", "pessimo", "péssimo", "horrivel", "horrível",
  "advogado", "processo", "denuncia", "denúncia", "urgente", "emergencia", "emergência",
];

/** Deterministic intent classification used as a safe fallback for AI triage. */
export function classificarIntencao(mensagem: string): IntencaoInbound {
  const txt = (mensagem || "").toLowerCase().trim();
  if (!txt) return "complexo";
  if (SENSITIVE_TERMS.some((t) => txt.includes(t))) return "complexo";
  for (const { intent, terms } of INTENT_KEYWORDS) {
    if (terms.some((t) => txt.includes(t))) return intent;
  }
  return "complexo";
}

/** Intents the AI may resolve on its own in the MVP. */
const INTENCOES_AUTORESOLVIVEIS: IntencaoInbound[] = [
  "proxima_sessao",
  "horario_entrevista",
  "confirmacao_agendamento",
  "onde_ver_app",
  "opt_out",
  "reativar",
];

/** True when the inbound intent must be escalated to a human handoff. */
export function precisaHandoff(intencao: IntencaoInbound): boolean {
  return !INTENCOES_AUTORESOLVIVEIS.includes(intencao);
}

/** Build a stable dedupe key for a queued notification. */
export function dedupeKey(evento: NotifEvento, refId: string, sufixo?: string): string {
  return sufixo ? `${evento}:${refId}:${sufixo}` : `${evento}:${refId}`;
}
