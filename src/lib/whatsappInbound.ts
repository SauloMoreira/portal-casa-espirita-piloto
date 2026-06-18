// Pure, dependency-free helpers for the WhatsApp inbound flow.
// Shared by the edge function logic and unit tests so the fallback rules
// (every inbound produces either an IA answer or a handoff) are verifiable.

export type Intencao =
  | "saudacao" | "agradecimento" | "pedido_informacao" | "encerramento"
  | "tratamento_hoje" | "proxima_sessao" | "horario_entrevista" | "confirmacao_agendamento"
  | "onde_ver_app" | "programacao_publica" | "opt_out" | "reativar" | "complexo";

export const SENSITIVE = ["reclama", "absurdo", "pessimo", "péssimo", "horrivel", "horrível",
  "advogado", "processo", "denuncia", "denúncia", "urgente", "emergencia", "emergência"];

// Basic conversational / social messages (greetings, thanks, acknowledgements).
// These are handled by a friendly social layer BEFORE any business logic, so an
// isolated "oi" or "boa tarde" is never escalated to a human handoff.
export const SAUDACAO_TERMOS = [
  "bom dia", "boa tarde", "boa noite", "ola", "olá", "oi", "oie", "opa",
  "eai", "e ai", "e aí", "tudo bem", "tudo bom", "como vai", "saudacoes", "saudações",
];

export const AGRADECIMENTO_TERMOS = [
  "obrigado", "obrigada", "obrigado!", "valeu", "vlw", "agradeço", "agradecido",
  "agradecida", "muito obrigado", "muito obrigada", "ok", "okay", "certo", "blz", "beleza",
];

// "Bridge" layer: generic requests for help/information that should keep the
// conversation flowing naturally (instead of repeating a greeting or escalating
// to a human). They produce a warm, inviting reply asking what the person needs.
export const PEDIDO_INFO_TERMOS = [
  "gostaria de informa", "gostaria de algumas informa", "gostaria de saber",
  "gostaria de uma informa", "gostaria de tirar", "queria saber", "queria uma informa",
  "quero uma informa", "queria tirar uma duvida", "queria tirar uma dúvida",
  "tirar uma duvida", "tirar uma dúvida", "tirar duvida", "tirar dúvida",
  "uma duvida", "uma dúvida", "uma pergunta", "fazer uma pergunta", "posso fazer uma pergunta",
  "preciso de ajuda", "pode me ajudar", "voce pode me ajudar", "você pode me ajudar",
  "me ajuda", "preciso de uma informa", "uma informacao", "uma informação",
  "algumas informacoes", "algumas informações", "quero saber", "preciso saber",
  "informacoes", "informações",
];

// Simple, natural closings ("tchau", "era só isso") — a friendly sign-off, no handoff.
export const ENCERRAMENTO_TERMOS = [
  "tchau", "ate logo", "até logo", "ate mais", "até mais", "ate breve", "até breve",
  "ate a proxima", "até a próxima", "era so isso", "era só isso", "so isso", "só isso",
  "nada mais", "por enquanto e so", "por enquanto é só", "fica com deus",
];

// Personal intents (about the assistido's own treatments/appointments) MUST win
// over the public schedule intents, so any message that uses personal markers
// ("meu", "minha", "tenho", "tratamento", "sessão", "entrevista") is routed to
// the assistido's real data instead of the generic house schedule.
export const KEYWORDS: Array<{ intent: Intencao; terms: string[] }> = [
  { intent: "opt_out", terms: ["parar", "cancelar mensagens", "nao quero", "não quero", "sair", "descadastr", "remover"] },
  { intent: "reativar", terms: ["voltar a receber", "reativar", "quero receber"] },
  // ===== PERSONAL intents (require an identified assistido + real data) =====
  { intent: "horario_entrevista", terms: [
    "entrevista", "tenho entrevista", "minha entrevista", "entrevista marcada", "entrevista fraterna",
  ] },
  { intent: "tratamento_hoje", terms: [
    "tenho tratamento hoje", "tem tratamento hoje", "tratamento hoje",
    "tenho sessao hoje", "tenho sessão hoje", "minha sessao hoje", "minha sessão hoje",
    "tenho atendimento hoje", "tenho hoje", "sessao hoje", "sessão hoje", "atendimento hoje",
  ] },
  { intent: "proxima_sessao", terms: [
    "proxima sessao", "próxima sessão", "minha sessao", "minha sessão",
    "meu tratamento", "meu próximo", "meu proximo", "proximo tratamento", "próximo tratamento",
    "proximo atendimento", "próximo atendimento", "meu atendimento", "minha proxima", "minha próxima",
    "quando e minha sessao", "quando é minha sessão", "quando e meu", "quando é meu",
    "que horas e minha", "que horas é minha", "horario da minha", "horário da minha",
  ] },
  { intent: "confirmacao_agendamento", terms: ["confirmar", "confirmado", "ta marcado", "tá marcado", "esta marcado"] },
  // ===== PUBLIC intents (identity-free, answered from the house schedule) =====
  { intent: "programacao_publica", terms: [
    "palestra", "evangelhoterapia", "evangelho terapia", "passe",
    "trabalho publico", "trabalho público", "trabalhos publicos", "trabalhos públicos",
    "atendimento publico", "atendimento público", "programacao", "programação",
    "tem palestra", "tem culto", "abre hoje", "vai abrir", "que horas e a palestra", "que horas é a palestra",
  ] },
  { intent: "onde_ver_app", terms: ["app", "aplicativo", "onde vejo", "onde ver", "sistema", "site"] },
];

export const AUTORESOLVIVEIS: Intencao[] = [
  "saudacao", "agradecimento", "pedido_informacao", "encerramento",
  "tratamento_hoje", "proxima_sessao", "horario_entrevista", "confirmacao_agendamento", "onde_ver_app",
  "programacao_publica", "opt_out", "reativar",
];

/** Requires an identified assistido to be answered automatically. */
export const PRECISA_ASSISTIDO: Intencao[] = [
  "tratamento_hoje", "proxima_sessao", "horario_entrevista", "opt_out", "reativar",
];

/** True when the intent is about the assistido's own personal data. */
export const PESSOAIS: Intencao[] = [
  "tratamento_hoje", "proxima_sessao", "horario_entrevista",
];

export function ehPerguntaPessoal(intencao: Intencao): boolean {
  return PESSOAIS.includes(intencao);
}

/** True for the basic social/conversational intents (greeting, thanks, bridge, closing). */
export const CONVERSACIONAIS: Intencao[] = [
  "saudacao", "agradecimento", "pedido_informacao", "encerramento",
];
export function ehConversacional(intencao: Intencao): boolean {
  return CONVERSACIONAIS.includes(intencao);
}

function contemTermo(txt: string, termos: string[]): boolean {
  return termos.some((t) => txt === t || txt.startsWith(t + " ") || txt.includes(" " + t) || txt.includes(t));
}

export function classificarIntencao(msg: string): Intencao {
  const txt = (msg || "").toLowerCase().trim();
  if (!txt) return "complexo";
  if (SENSITIVE.some((t) => txt.includes(t))) return "complexo";
  // Business intents win first, so "boa tarde, tem palestra hoje?" is answered
  // as an operational question (greeting + request → operational content).
  for (const { intent, terms } of KEYWORDS) if (terms.some((t) => txt.includes(t))) return intent;
  // Conversational layers (no handoff), checked from most to least specific:
  // bridge ("gostaria de informações") wins over a bare greeting so a continued
  // conversation flows naturally instead of repeating the greeting.
  if (contemTermo(txt, PEDIDO_INFO_TERMOS)) return "pedido_informacao";
  if (contemTermo(txt, ENCERRAMENTO_TERMOS)) return "encerramento";
  if (contemTermo(txt, AGRADECIMENTO_TERMOS)) return "agradecimento";
  if (contemTermo(txt, SAUDACAO_TERMOS)) return "saudacao";
  return "complexo";
}

// ===================== CONTEXTO TEMPORAL =====================
// Each inbound message is classified independently (stateless), so the IA never
// reuses a previous message's intent or date. The requested date is extracted
// from the CURRENT message only.

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, "terça": 2, quarta: 3,
  quinta: 4, sexta: 5, sabado: 6, "sábado": 6,
};

export interface AlvoTempo { iso: string; diaSemana: number; label: string; }

/**
 * Resolves the date a public/personal question refers to, based ONLY on the
 * current message ("hoje", "amanhã", "depois de amanhã", weekday names).
 * `baseIso` is today's date (YYYY-MM-DD) in the house timezone.
 */
export function resolverDataAlvo(texto: string, baseIso: string): AlvoTempo {
  const txt = (texto || "").toLowerCase();
  const base = new Date(baseIso + "T12:00:00Z");
  const mk = (offset: number, label: string): AlvoTempo => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    return { iso: d.toISOString().slice(0, 10), diaSemana: d.getUTCDay(), label };
  };
  if (txt.includes("depois de amanha") || txt.includes("depois de amanhã")) return mk(2, "depois de amanhã");
  if (txt.includes("amanha") || txt.includes("amanhã")) return mk(1, "amanhã");
  if (txt.includes("hoje")) return mk(0, "hoje");
  for (const [nome, dow] of Object.entries(DIAS_SEMANA)) {
    if (txt.includes(nome)) {
      let offset = (dow - base.getUTCDay() + 7) % 7;
      if (offset === 0 && (txt.includes("proxima") || txt.includes("próxima") || txt.includes("que vem"))) offset = 7;
      return mk(offset, nome.replace("terca", "terça").replace("sabado", "sábado"));
    }
  }
  return mk(0, "hoje");
}

// Known public activities for entity detection (used to match exceptions/sessions).
export const ATIVIDADES_PUBLICAS: Array<{ nome: string; termos: string[] }> = [
  { nome: "Palestra Pública", termos: ["palestra"] },
  { nome: "Evangelhoterapia", termos: ["evangelhoterapia", "evangelho terapia"] },
  { nome: "Passe", termos: ["passe"] },
];

/** Detects which public activity a message is about (null when generic). */
export function detectarAtividade(texto: string): string | null {
  const txt = (texto || "").toLowerCase();
  for (const a of ATIVIDADES_PUBLICAS) if (a.termos.some((t) => txt.includes(t))) return a.nome;
  return null;
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

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export const STATUS_EXCECAO_NEGATIVO = ["cancelado", "cancelada", "remarcado", "remarcada", "excepcional"];

export interface ExcecaoOperacional {
  atividade: string;
  status: string;
  mensagem_ia?: string | null;
  motivo?: string | null;
  nova_data?: string | null;
  novo_horario?: string | null;
  horario_afetado?: string | null;
}

/**
 * Builds the reply for a registered operational exception. Prefers the
 * admin-authored "mensagem_ia"; otherwise composes a precise, human answer from
 * the structured data. Never invents information.
 */
export function montarRespostaExcecao(ex: ExcecaoOperacional, label = "hoje"): string {
  if (ex.mensagem_ia && ex.mensagem_ia.trim()) return ex.mensagem_ia.trim();
  const st = (ex.status || "").toLowerCase();
  const quando = capitalizar(label);
  if (st === "cancelado" || st === "cancelada") {
    const motivo = ex.motivo && ex.motivo.trim() ? ` Motivo: ${ex.motivo.trim()}.` : "";
    return `${quando} não haverá ${ex.atividade}.${motivo} Se quiser, posso verificar a próxima data para você. 🌿`;
  }
  if (st === "remarcado" || st === "remarcada") {
    const nd = ex.nova_data ? formatarDataCurta(ex.nova_data) : null;
    const nh = formatarHorario(ex.novo_horario);
    return `${quando} ${ex.atividade} foi remarcada${nd ? " para " + nd : ""}${nh ? " às " + nh : ""}. 🌿`;
  }
  if (st === "excepcional") {
    const motivo = ex.motivo && ex.motivo.trim() ? ` ${ex.motivo.trim()}.` : "";
    return `${quando} há uma alteração em ${ex.atividade}.${motivo} Nossa equipe pode confirmar os detalhes. 🌿`;
  }
  // mantido
  const h = formatarHorario(ex.horario_afetado);
  return `Sim, ${label} teremos ${ex.atividade}${h ? " às " + h : ""}. 🌿`;
}

/**
 * Builds the auto-reply for public schedule questions from real data.
 * Always returns a valid, safe answer (never empty) so these questions do
 * not need a human handoff when the lookup succeeds. `label` is the requested
 * day ("hoje", "amanhã", weekday) so the answer matches the question's context.
 */
export function montarRespostaProgramacao(itens: ItemProgramacao[], label = "hoje"): string {
  const quando = capitalizar(label);
  const lista = (itens || []).filter((i) => i && i.nome);
  if (lista.length === 0) {
    return `${quando} não encontrei programação pública agendada. Em caso de dúvida, nossa equipe pode ajudar. 🌿`;
  }
  if (lista.length === 1) {
    const i = lista[0];
    const hora = formatarHorario(i.horario);
    return `Sim, ${label} temos ${i.nome}${hora ? " às " + hora : ""}. 🌿`;
  }
  const linhas = lista
    .map((i) => `• ${i.nome}${i.horario ? " às " + formatarHorario(i.horario) : ""}`)
    .join("\n");
  return `${quando} temos:\n${linhas}\n🌿`;
}

export interface SessaoPessoal {
  nome: string;
  data: string; // YYYY-MM-DD
  horario?: string | null;
  status?: string | null; // e.g. "agendado", "realizado", "cancelado", "remarcado"
}

/** Formats a "YYYY-MM-DD" date as "DD/MM" (defensive, never throws). */
export function formatarDataCurta(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!day) return d;
  return `${day}/${m}`;
}

/**
 * Builds the reply for the personal question "tenho tratamento hoje?" using the
 * assistido's REAL agenda for today. Considers operational exceptions encoded as
 * the session status (cancelled/rescheduled) so the IA never invents a session.
 */
export function montarRespostaTratamentoHoje(sessoes: SessaoPessoal[]): string {
  const lista = (sessoes || []).filter((s) => s && s.nome);
  const ativas = lista.filter((s) => {
    const st = (s.status || "").toLowerCase();
    return st !== "cancelado" && st !== "cancelada" && st !== "remarcado" && st !== "remarcada";
  });
  const canceladas = lista.filter((s) => {
    const st = (s.status || "").toLowerCase();
    return st === "cancelado" || st === "cancelada" || st === "remarcado" || st === "remarcada";
  });

  if (ativas.length === 0 && canceladas.length > 0) {
    const c = canceladas[0];
    return `Hoje sua sessão de ${c.nome} consta como ${(c.status || "").toLowerCase()}. Em caso de dúvida, nossa equipe pode confirmar. 🌿`;
  }
  if (ativas.length === 0) {
    return "Hoje você não tem tratamento agendado. 🌿";
  }
  if (ativas.length === 1) {
    const s = ativas[0];
    const hora = formatarHorario(s.horario);
    return `Sim, hoje você tem ${s.nome}${hora ? " às " + hora : ""}. 🌿`;
  }
  const linhas = ativas
    .map((s) => `• ${s.nome}${s.horario ? " às " + formatarHorario(s.horario) : ""}`)
    .join("\n");
  return `Hoje você tem:\n${linhas}\n🌿`;
}

/**
 * Builds the reply for "qual meu próximo tratamento/atendimento?" using the
 * next real scheduled session. Honors operational exceptions via the status.
 */
export function montarRespostaProximaSessao(sessao: SessaoPessoal | null): string {
  if (!sessao || !sessao.nome) {
    return "Não encontrei sessões futuras agendadas no momento. Em caso de dúvida, nossa equipe pode ajudar. 🌿";
  }
  const st = (sessao.status || "").toLowerCase();
  const hora = formatarHorario(sessao.horario);
  const data = formatarDataCurta(sessao.data);
  if (st === "cancelado" || st === "cancelada" || st === "remarcado" || st === "remarcada") {
    return `Sua próxima sessão de ${sessao.nome} em ${data} consta como ${st}. Nossa equipe pode confirmar a nova data. 🌿`;
  }
  return `Sua próxima sessão é ${sessao.nome} em ${data}${hora ? " às " + hora : ""}. 🌿`;
}

// ===================== GERAÇÃO CONVERSACIONAL =====================
// The conversational layer is NOT a fixed string per intent. Each "modo" has a
// controlled REPERTOIRE of valid formulations; a deterministic seed (derived
// from the current message) picks one, and an anti-repetition rule avoids
// returning the exact same text that was sent in the previous turn. Data and
// decisions stay rigid; only the wording varies — naturally and within bounds.

/** Time-of-day greeting prefix ("Bom dia"/"Boa tarde"/"Boa noite"/"Olá"). */
export function saudacaoPorHora(horaLocal?: number): string {
  if (typeof horaLocal !== "number") return "Olá";
  if (horaLocal < 12) return "Bom dia";
  if (horaLocal < 18) return "Boa tarde";
  return "Boa noite";
}

// Suffixes appended to the time-of-day greeting on the FIRST contact.
export const SAUDACAO_SUFIXOS = [
  "Como posso te ajudar hoje?",
  "Fico à disposição. Em que posso ajudar?",
  "Se quiser, posso te ajudar com informações da casa, entrevistas ou tratamentos.",
  "Seja bem-vindo(a). Como posso te ajudar?",
];

// Continued conversation (already greeted): keep flowing WITHOUT a new greeting.
export const CONTINUACAO_FRASES = [
  "Claro, posso te ajudar com isso. 🌿 Sobre o que você gostaria de saber?",
  "Fico à disposição. 🌿 Em que posso ajudar?",
  "Se quiser, posso te orientar por aqui. 🌿",
  "Pode me dizer o que você gostaria de saber? 🌿",
];

// Well-being questions ("tudo bem?", "como vai?").
export const BEM_ESTAR_TERMOS = ["tudo bem", "tudo bom", "como vai", "como voce esta", "como você está"];
export const BEM_ESTAR_FRASES = [
  "Tudo bem, sim. 🌿 E com você?",
  "Tudo bem, graças a Deus. 🌿 Em que posso te ajudar?",
  "Tudo ótimo por aqui. 🌿 Como posso te ajudar hoje?",
];

// Generic request for help / information (bridge).
export const PONTE_FRASES = [
  "Claro, fico à disposição. Sobre o que você gostaria de saber? 🌿",
  "Posso ajudar, sim. Você gostaria de saber sobre programação, entrevistas ou tratamentos? 🌿",
  "Com prazer. Pode me dizer qual informação deseja consultar? 🌿",
  "Com prazer! Você gostaria de saber sobre a programação da casa, entrevistas ou tratamentos? 🌿",
];

// Thanks.
export const AGRADECIMENTO_FRASES = [
  "Disponha! 🌿 Fico à disposição se precisar de mais alguma informação.",
  "Por nada! 🌿 Se precisar, é só me chamar.",
  "Imagina! 🌿 Estou por aqui se precisar de mais alguma coisa.",
];

// Gentle closing.
export const ENCERRAMENTO_FRASES = [
  "Conte conosco. 🌿 Se precisar de mais alguma orientação, a casa está à disposição para te acolher.",
  "Fico à disposição se precisar de mais alguma informação. 🌿",
  "Se precisar, posso continuar te ajudando por aqui. 🌿",
  "Conte conosco. 🌿",
];

/**
 * When the user explicitly greets with a time-of-day phrase ("bom dia", "boa tarde",
 * "boa noite"), we always greet back with the SAME phrase — it feels human and polite.
 * This is checked BEFORE the generic continuation logic so even a repeated greeting
 * within the same conversation gets a warm reply.
 */
export function extrairSaudacaoDoTexto(texto: string): string | null {
  const txt = (texto || "").toLowerCase();
  if (txt.includes("bom dia")) return "Bom dia";
  if (txt.includes("boa tarde")) return "Boa tarde";
  if (txt.includes("boa noite")) return "Boa noite";
  return null;
}

/** Small, stable string hash used as a deterministic seed for variation. */
export function hashTexto(s: string): number {
  let h = 0;
  const t = s || "";
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Picks a phrase from a repertoire deterministically (seed) while avoiding the
 * exact `evitar` text from the previous turn (anti-repetition). Controlled, not
 * random: same seed → same phrase, unless it would repeat the last one.
 */
export function escolherFrase(lista: string[], seed: number, evitar?: string | null): string {
  if (!lista || lista.length === 0) return "";
  if (lista.length === 1) return lista[0];
  let idx = ((seed % lista.length) + lista.length) % lista.length;
  if (evitar != null && lista[idx] === evitar) idx = (idx + 1) % lista.length;
  return lista[idx];
}

function ehBemEstar(texto?: string): boolean {
  const txt = (texto || "").toLowerCase();
  return BEM_ESTAR_TERMOS.some((t) => txt.includes(t));
}

export interface ConversaContexto {
  horaLocal?: number;
  /** True when the user was already greeted recently in this conversation. */
  jaSaudado?: boolean;
  /** The current inbound message (used as the variation seed). */
  texto?: string;
  /** The exact last reply we sent, to avoid repeating it verbatim. */
  ultimaResposta?: string | null;
}

/**
 * Generates a natural, human conversational reply for the social/bridge/closing
 * layer. Returns the chosen text — it is NOT a single fixed string per intent.
 * Honors anti-repetition and short context (greet only once per conversation).
 */
export function gerarRespostaConversacional(
  intencao: Intencao,
  ctx: ConversaContexto = {},
): string {
  const seed = hashTexto(ctx.texto || "") + (ctx.jaSaudado ? 1 : 0);
  const evitar = ctx.ultimaResposta ?? null;

  if (intencao === "agradecimento") return escolherFrase(AGRADECIMENTO_FRASES, seed, evitar);
  if (intencao === "encerramento") return escolherFrase(ENCERRAMENTO_FRASES, seed, evitar);
  if (intencao === "pedido_informacao") return escolherFrase(PONTE_FRASES, seed, evitar);

  // saudacao
  if (ehBemEstar(ctx.texto)) return escolherFrase(BEM_ESTAR_FRASES, seed, evitar);

  // If the user explicitly greets with "bom dia" / "boa tarde" / "boa noite",
  // we greet back with the SAME phrase — polite and human, even mid-conversation.
  const saudacaoUsuario = extrairSaudacaoDoTexto(ctx.texto);
  if (saudacaoUsuario) {
    const candidatos = [
      `${saudacaoUsuario}! 🌿 Como posso te ajudar?`,
      `${saudacaoUsuario}! 🌿 Em que posso ajudar?`,
      `${saudacaoUsuario}! 🌿 Seja bem-vindo(a). Como posso te ajudar?`,
      `${saudacaoUsuario}! 🌿 Fico à disposição. Como posso te ajudar?`,
    ];
    return escolherFrase(candidatos, seed, evitar);
  }

  // Already greeted: continue the dialog without repeating a greeting.
  if (ctx.jaSaudado) return escolherFrase(CONTINUACAO_FRASES, seed, evitar);
  const saudacao = saudacaoPorHora(ctx.horaLocal);
  const candidatos = SAUDACAO_SUFIXOS.map((s) => `${saudacao}! 🌿 ${s}`);
  return escolherFrase(candidatos, seed, evitar);
}

/**
 * Backwards-compatible thin wrapper. Prefer {@link gerarRespostaConversacional}.
 */
export function montarRespostaConversacional(
  intencao: Intencao,
  horaLocal?: number,
  jaSaudado?: boolean,
): string {
  return gerarRespostaConversacional(intencao, { horaLocal, jaSaudado });
}

/**
 * True when a stored conversation indicates the user was already greeted
 * recently (within `janelaMin` minutes), so the IA should continue the dialog
 * instead of repeating a greeting. Defensive: returns false on missing/bad data.
 */
export function jaSaudadoRecentemente(
  ultimoContatoIso: string | null | undefined,
  agoraMs: number = Date.now(),
  janelaMin = 180,
): boolean {
  if (!ultimoContatoIso) return false;
  const t = new Date(ultimoContatoIso).getTime();
  if (isNaN(t)) return false;
  const diffMin = (agoraMs - t) / 60000;
  return diffMin >= 0 && diffMin <= janelaMin;
}


/** Warm, precise fallback shown to the user whenever a handoff is opened. */
export const MENSAGEM_HANDOFF =
  "Não consegui confirmar isso com segurança agora. Vou encaminhar para atendimento para te orientarmos corretamente. 🌿";

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
