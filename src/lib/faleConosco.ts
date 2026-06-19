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

/** Returns the period-of-day salutation for a given hour (0-23). */
export function saudacaoPorHorario(hora: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Extracts a safe first name from a full name. Returns null when there is no
 * trustworthy name, so the message can fall back to a neutral greeting.
 */
export function primeiroNomeSeguro(nomeCompleto: string | null | undefined): string | null {
  if (!nomeCompleto) return null;
  const limpo = nomeCompleto.trim().replace(/\s+/g, " ");
  if (!limpo) return null;
  const primeiro = limpo.split(" ")[0];
  // Avoid leaking odd values (e.g. emails) as a "name".
  if (primeiro.length < 2 || primeiro.includes("@")) return null;
  // Capitalize first letter for a warm, human tone.
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
}

/**
 * Builds the contextual, welcoming opening message for the in-app entry point.
 * It mentions Daniel (FER's virtual assistant), uses the user's first name when
 * safely available, and clearly states human support follows business hours —
 * setting the right expectation without being cold or bureaucratic. The "app"
 * origin is woven in so the central keeps provenance for triage/audit.
 */
export function montarSaudacaoFaleConosco(opts: {
  nomeCompleto?: string | null;
  hora?: number;
}): string {
  const hora = opts.hora ?? new Date().getHours();
  const saudacao = saudacaoPorHorario(hora);
  const nome = primeiroNomeSeguro(opts.nomeCompleto);
  const abertura = nome ? `${saudacao}, ${nome}.` : `${saudacao}.`;
  return (
    `${abertura} Sou o Daniel, assistente virtual da FER (estou falando com você pelo app). ` +
    `Como posso lhe ajudar? Posso tirar suas dúvidas por aqui e, se necessário, ` +
    `encaminhar você para um atendimento humano e personalizado. ` +
    `Os atendimentos humanos acontecem em horário comercial e/ou nos horários de atendimento da FER.`
  );
}

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
