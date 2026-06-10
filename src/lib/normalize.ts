/**
 * Pure normalization helpers shared across the system to prevent duplicate
 * records (e.g. public check-in matching). Mirrors the logic used in the
 * `checkin-publico` edge function so the same rules can be unit-tested on the
 * frontend.
 */

/** Normalize a person name: strip accents, collapse spaces, lowercase. */
export function normalizeNome(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

/** Normalize a phone number to digits only. */
export function normalizeCelular(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}
