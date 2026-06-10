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
