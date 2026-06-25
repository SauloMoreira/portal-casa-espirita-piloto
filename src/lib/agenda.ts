import { parseISO } from "date-fns";

/**
 * Format the time portion of an interview timestamp. Returns null when the
 * time is midnight (no explicit time set). Uses UTC components to match the
 * stored value (behavior preserved from the original Agenda implementation).
 */
export function formatEntrevistaTime(dateStr: string): string | null {
  const d = parseISO(dateStr);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  if (h === 0 && m === 0) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Context-aware label for the "Horário" field of an interview.
 *
 * Domain rule: an interview can legitimately exist without a clock time. The
 * operational "Realizar Entrevista" flow records the interview as date-only
 * (stored at midnight UTC) with status "realizada" — the fraternal interview is
 * registered as performed on a given date, not at a specific hour. Likewise a
 * scheduled interview may be created date-only. Therefore "no time" is a valid
 * state and must be communicated precisely instead of the ambiguous
 * "Não definido", which wrongly implies missing/broken data.
 */
export function rotuloHorarioEntrevista(dateStr: string, status?: string): string {
  const time = formatEntrevistaTime(dateStr);
  if (time) return time;
  if (status === "realizada") return "Sem horário registrado";
  if (status === "cancelada") return "Sem horário";
  return "Horário a definir";
}
