// Pure helpers for the in-app "Fale Conosco" floating WhatsApp entry point.
//
// This is just an ADDITIONAL door into the house's already-homologated WhatsApp
// central: clicking the button opens the house's WhatsApp number with a
// pre-filled message that signals the conversation started from the app. The
// message then arrives through the SAME inbound webhook / IA / handoff / audit
// flow used by people who message the house directly. No parallel central.

/** Friendly, institutional label for the floating button. */
export const FALE_CONOSCO_LABEL = "Fale Conosco";

/** Short supporting copy shown near the button (kept minimal, non-commercial). */
export const FALE_CONOSCO_APOIO = "Precisa de ajuda? Fale com a casa pelo WhatsApp.";

/**
 * Pre-filled opening message. It carries the "app" origin as natural context so
 * the central can triage it (and the audit trail keeps the provenance) without
 * any new backend logic.
 */
export const FALE_CONOSCO_MENSAGEM_PADRAO =
  "Olá, vim pelo app da FER e gostaria de tirar uma dúvida.";

/**
 * Normalizes a Brazilian phone number to the digit-only E.164 form expected by
 * wa.me. Adds the country code (55) when missing. Returns null when the number
 * is clearly invalid (too short), so the UI can hide the button gracefully.
 */
export function normalizarTelefoneWhatsapp(
  raw: string | null | undefined,
  ddiPadrao = "55",
): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Drop a leading "00" international prefix if present.
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Local number (10 = landline w/ DDD, 11 = mobile w/ DDD) → prepend DDI.
  if (digits.length === 10 || digits.length === 11) digits = ddiPadrao + digits;
  // Must at least contain DDI + DDD + number.
  if (digits.length < 12) return null;
  return digits;
}

/**
 * Builds the wa.me deep link for the house WhatsApp with the origin-aware
 * opening message. Returns null when there is no usable phone number.
 */
export function montarLinkWhatsapp(opts: {
  telefone: string | null | undefined;
  mensagem?: string;
}): string | null {
  const numero = normalizarTelefoneWhatsapp(opts.telefone);
  if (!numero) return null;
  const texto = (opts.mensagem ?? FALE_CONOSCO_MENSAGEM_PADRAO).trim();
  const qs = texto ? `?text=${encodeURIComponent(texto)}` : "";
  return `https://wa.me/${numero}${qs}`;
}
