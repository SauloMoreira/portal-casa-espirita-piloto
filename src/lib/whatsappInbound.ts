// Pure, dependency-free helpers for the WhatsApp inbound flow.
// Shared by the edge function logic and unit tests so the fallback rules
// (every inbound produces either an IA answer or a handoff) are verifiable.

export type Intencao =
  | "proxima_sessao" | "horario_entrevista" | "confirmacao_agendamento"
  | "onde_ver_app" | "programacao_publica" | "opt_out" | "reativar" | "complexo";

export const SENSITIVE = ["reclama", "absurdo", "pessimo", "péssimo", "horrivel", "horrível",
  "advogado", "processo", "denuncia", "denúncia", "urgente", "emergencia", "emergência"];

export const KEYWORDS: Array<{ intent: Intencao; terms: string[] }> = [
  { intent: "opt_out", terms: ["parar", "cancelar mensagens", "nao quero", "não quero", "sair", "descadastr", "remover"] },
  { intent: "reativar", terms: ["voltar a receber", "reativar", "quero receber"] },
  // Public, identity-free intents about the house's public schedule. Placed
  // before personal intents so "palestra"/"trabalho público" win over generic terms.
  { intent: "programacao_publica", terms: [
    "palestra", "evangelhoterapia", "evangelho terapia", "passe",
    "trabalho publico", "trabalho público", "trabalhos publicos", "trabalhos públicos",
    "atendimento publico", "atendimento público", "programacao", "programação",
    "tem hoje", "tera hoje", "terá hoje", "tem culto", "abre hoje", "vai abrir",
  ] },
  { intent: "proxima_sessao", terms: ["proxima sessao", "próxima sessão", "minha sessao", "quando e minha sessao", "quando é minha sessão"] },
  { intent: "horario_entrevista", terms: ["entrevista"] },
  { intent: "confirmacao_agendamento", terms: ["confirmar", "confirmado", "ta marcado", "tá marcado", "esta marcado"] },
  { intent: "onde_ver_app", terms: ["app", "aplicativo", "onde vejo", "onde ver", "sistema", "site"] },
];

export const AUTORESOLVIVEIS: Intencao[] = [
  "proxima_sessao", "horario_entrevista", "confirmacao_agendamento", "onde_ver_app",
  "programacao_publica", "opt_out", "reativar",
];

/** Requires an identified assistido to be answered automatically. */
export const PRECISA_ASSISTIDO: Intencao[] = [
  "proxima_sessao", "horario_entrevista", "opt_out", "reativar",
];

export function classificarIntencao(msg: string): Intencao {
  const txt = (msg || "").toLowerCase().trim();
  if (!txt) return "complexo";
  if (SENSITIVE.some((t) => txt.includes(t))) return "complexo";
  for (const { intent, terms } of KEYWORDS) if (terms.some((t) => txt.includes(t))) return intent;
  return "complexo";
}

/** Formats a "HH:MM[:SS]" string as a friendly Brazilian time (e.g. "19h", "20h30"). */
export function formatarHorario(h: string | null | undefined): string {
  if (!h) return "";
  const [hh, mm] = h.split(":");
  if (mm && mm !== "00") return `${parseInt(hh, 10)}h${mm}`;
  return `${parseInt(hh, 10)}h`;
}

export interface ItemProgramacao {
  nome: string;
  horario?: string | null;
}

/**
 * Builds the auto-reply for public schedule questions from real data.
 * Always returns a valid, safe answer (never empty) so these questions do
 * not need a human handoff when the lookup succeeds.
 */
export function montarRespostaProgramacao(itens: ItemProgramacao[]): string {
  const lista = (itens || []).filter((i) => i && i.nome);
  if (lista.length === 0) {
    return "Hoje não encontrei programação pública agendada. Em caso de dúvida, nossa equipe pode ajudar. 🌿";
  }
  if (lista.length === 1) {
    const i = lista[0];
    const hora = formatarHorario(i.horario);
    return `Sim, hoje temos ${i.nome}${hora ? " às " + hora : ""}. 🌿`;
  }
  const linhas = lista
    .map((i) => `• ${i.nome}${i.horario ? " às " + formatarHorario(i.horario) : ""}`)
    .join("\n");
  return `Hoje temos:\n${linhas}\n🌿`;
}

export interface DecisaoFallback {
  handoff: boolean;
  origem: "ia" | "regra" | "manual";
  motivo: string;
}

/**
 * Decide whether an inbound needs a human handoff. This encodes the guarantee
 * that no inbound is ever silently dropped:
 *  - "complexo" / sensitive -> IA handoff
 *  - non auto-resolvable intent -> rule handoff
 *  - intent needs an identified assistido but none -> rule handoff
 *  - intent auto-resolvable but no answer produced -> rule handoff
 */
export function decidirHandoff(
  intencao: Intencao,
  opts: { assistidoIdentificado: boolean; respostaGerada: boolean },
): DecisaoFallback {
  if (intencao === "complexo") {
    return { handoff: true, origem: "ia", motivo: "Mensagem que requer atendimento humano" };
  }
  if (!AUTORESOLVIVEIS.includes(intencao)) {
    return { handoff: true, origem: "regra", motivo: "Intenção sem resposta automática disponível" };
  }
  if (PRECISA_ASSISTIDO.includes(intencao) && !opts.assistidoIdentificado) {
    return { handoff: true, origem: "regra", motivo: "Assistido não identificado" };
  }
  if (!opts.respostaGerada) {
    return { handoff: true, origem: "regra", motivo: "IA não produziu uma resposta válida" };
  }
  return { handoff: false, origem: "ia", motivo: "" };
}

export function resumoMensagem(texto: string, max = 160): string {
  const t = (texto || "").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}
