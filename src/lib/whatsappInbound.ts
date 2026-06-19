// Pure, dependency-free helpers for the WhatsApp inbound flow.
// Shared by the edge function logic and unit tests so the fallback rules
// (every inbound produces either an IA answer or a handoff) are verifiable.

export type Intencao =
  | "saudacao" | "agradecimento" | "pedido_informacao" | "encerramento"
  | "tratamento_hoje" | "proxima_sessao" | "horario_entrevista" | "confirmacao_agendamento"
  | "onde_ver_app" | "programacao_publica" | "eventos" | "campanhas" | "acao_social"
  | "opt_out" | "reativar" | "falar_humano" | "complexo";

// ===================== CAMADA 1 — NORMALIZAÇÃO + TOLERÂNCIA A ERRO =====================
// Cheap, deterministic text understanding that runs BEFORE any classification.
// It lowercases, strips accents, fixes common typos/abbreviations and corrects
// near-miss words (edit distance) against the house vocabulary. This gives the IA
// real tolerance to typos/variations without any LLM cost.

/** Lowercases, removes accents and collapses whitespace. Never throws. */
export function normalizarTexto(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Explicit corrections for frequent abbreviations/typos (accent-free keys).
export const CORRECOES_VOCABULARIO: Record<string, string> = {
  evangelioterapia: "evangelhoterapia", evangelhioterapia: "evangelhoterapia",
  evangeloterapia: "evangelhoterapia", evangelhterapia: "evangelhoterapia",
  tratamnto: "tratamento", tratameto: "tratamento", tratmento: "tratamento",
  trat: "tratamento", tto: "tratamento",
  sesao: "sessao", sessoes: "sessao", secao: "sessao",
  atendimeto: "atendimento", atendimnto: "atendimento",
  entrevsta: "entrevista", entervista: "entrevista", entrvista: "entrevista",
  agendamnto: "agendamento", agendameto: "agendamento",
  palesta: "palestra", palstra: "palestra", palesra: "palestra", palerstra: "palestra",
  programacao: "programacao", progamacao: "programacao",
  campnha: "campanha", campanhia: "campanha", campanas: "campanha",
  aliemntos: "alimentos", alimetos: "alimentos", alimento: "alimentos",
  qdo: "quando", qd: "quando", qnd: "quando",
  prox: "proximo", proxmo: "proximo", proxma: "proxima",
  hj: "hoje", amnha: "amanha", amnh: "amanha", amanhq: "amanha",
  vc: "voce", vcs: "voces", pq: "porque", blz: "beleza",
  evento: "eventos",
};

// Vocabulary used by the fuzzy near-miss corrector (edit distance). Kept small and
// specific to avoid false positives — short/common verb-like words are excluded.
const VOCAB_FUZZY = [
  "palestra", "evangelhoterapia", "tratamento", "atendimento", "entrevista",
  "agendamento", "programacao", "campanha", "campanhas", "eventos", "alimentos",
  "proximo", "proxima", "amanha", "remarcado", "cancelado",
];

/** Classic Levenshtein edit distance (small strings only). */
export function distanciaEdicao(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Corrects a single (already accent-free) word via the map then fuzzy vocab. */
export function corrigirToken(tok: string): string {
  if (!tok) return tok;
  if (CORRECOES_VOCABULARIO[tok]) return CORRECOES_VOCABULARIO[tok];
  if (tok.length < 5) return tok;
  let melhor: string | null = null;
  let melhorDist = 99;
  for (const w of VOCAB_FUZZY) {
    if (Math.abs(w.length - tok.length) > 2) continue;
    const d = distanciaEdicao(tok, w);
    const limite = w.length >= 8 ? 2 : 1;
    if (d > 0 && d <= limite && d < melhorDist) { melhorDist = d; melhor = w; }
  }
  return melhor ?? tok;
}

/**
 * Normalizes + corrects an entire message: the cheap "understanding" step. Keeps
 * trailing punctuation attached to each word so phrase matching still works.
 */
export function corrigirTexto(s: string): string {
  return normalizarTexto(s)
    .split(" ")
    .map((t) => {
      const m = t.match(/^([\p{L}]+)([\s\S]*)$/u);
      if (!m) return t;
      return corrigirToken(m[1]) + m[2];
    })
    .join(" ");
}

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
  "duvida", "dúvida", "duvidas", "dúvidas", "algumas duvidas", "algumas dúvidas",
  "umas duvidas", "umas dúvidas", "tirar algumas", "tirar umas", "tirar duvidas", "tirar dúvidas",
  "perguntar", "pergunta", "perguntas", "fazer uma pergunta", "umas perguntas", "algumas perguntas",
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

// Explicit request to talk to a real person. First time -> gentle retention by
// the IA; on a second insistence the conversation is escalated to human handoff.
export const HUMANO_TERMOS = [
  "falar com humano", "falar com um humano", "falar com uma pessoa", "falar com pessoa",
  "falar com atendente", "falar com um atendente", "falar com alguem", "falar com alguém",
  "atendimento humano", "atendente humano", "quero um humano", "quero falar com humano",
  "quero falar com atendente", "quero falar com alguem", "quero falar com alguém",
  "pessoa real", "ser humano", "humano de verdade", "falar com responsavel", "falar com responsável",
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
  // ===== PUBLIC institutional modules (events, campaigns, social action) =====
  { intent: "acao_social", terms: [
    "acao social", "ação social", "alimentos", "alimento", "cesta basica", "cesta básica",
    "doar", "doacao", "doação", "doacoes", "doações", "arrecada", "arrecadacao", "arrecadação",
    "esta faltando", "está faltando", "o que falta", "como ajudar", "como posso ajudar a casa",
  ] },
  { intent: "campanhas", terms: [
    "campanha", "campanhas", "socio mantenedor", "sócio mantenedor", "mantenedor",
    "tem alguma campanha", "campanha ativa", "campanha da casa",
  ] },
  { intent: "eventos", terms: [
    "evento", "eventos", "tem evento", "algum evento", "que eventos", "evento essa semana",
    "evento ativo", "proximos eventos", "próximos eventos",
  ] },
  // ===== PUBLIC schedule (identity-free, answered from the house schedule) =====
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
  "programacao_publica", "eventos", "campanhas", "acao_social", "opt_out", "reativar", "falar_humano",
];

/**
 * Requires an identified assistido to be answered automatically. Note that
 * "tratamento_hoje" is intentionally NOT here: without an identified assistido it
 * is still answered from the house's treatment schedule + exceptions for the day.
 */
export const PRECISA_ASSISTIDO: Intencao[] = [
  "proxima_sessao", "horario_entrevista", "opt_out", "reativar",
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
  // `txt` is already normalized (accent-free); normalize each term too so the
  // matching is tolerant to accents/casing on both sides.
  return termos.some((raw) => {
    const t = normalizarTexto(raw);
    return txt === t || txt.startsWith(t + " ") || txt.includes(" " + t) || txt.includes(t);
  });
}

// Word-order-agnostic personal treatment question: any treatment word together
// with a temporal marker ("hoje tem tratamento", "tem sessão hoje").
const TEMPORAL_MARCADORES = ["hoje", "amanha", "depois de amanha"];
const TRATAMENTO_PALAVRAS = ["tratamento", "sessao", "atendimento"];

export function classificarIntencao(msg: string): Intencao {
  const limpo = (msg || "").toLowerCase().trim();
  if (!limpo) return "complexo";
  // CAMADA 1: normalize + correct typos/abbreviations before any matching.
  const txt = corrigirTexto(limpo);
  if (SENSITIVE.some((t) => txt.includes(normalizarTexto(t)))) return "complexo";
  // Explicit request to talk to a human wins over business/conversational layers
  // so the gentle-retention -> handoff flow can be applied.
  if (contemTermo(txt, HUMANO_TERMOS)) return "falar_humano";
  // Treatment word + temporal marker (order-agnostic) -> personal "today" question.
  if (TEMPORAL_MARCADORES.some((d) => txt.includes(d))
      && TRATAMENTO_PALAVRAS.some((p) => txt.includes(p))) {
    return "tratamento_hoje";
  }
  // Business intents win first, so "boa tarde, tem palestra hoje?" is answered
  // as an operational question (greeting + request → operational content).
  for (const { intent, terms } of KEYWORDS) {
    if (terms.some((t) => txt.includes(normalizarTexto(t)))) return intent;
  }
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

// ===================== PERSONA & EMOJI =====================
// The IA presents itself as "Daniel", virtual assistant of the FER. The full
// presentation only happens on the FIRST contact of a conversation; afterwards
// the dialog flows naturally without re-introducing the persona.

/** Assistant identity used in the opening presentation. */
export const IA_NOME = "Daniel";
export const IA_CASA = "FER";
export const IA_APRESENTACAO = `Sou ${IA_NOME}, assistente virtual da ${IA_CASA}`;
// Greeting persona line (uses the article "o Daniel" for a warmer, agreed tone).
export const IA_APRESENTACAO_SAUDACAO = `Sou o ${IA_NOME}, assistente virtual da ${IA_CASA}`;
// The agreed welcoming closing: IA help + human escalation + human hours note.
export const IA_SAUDACAO_EXPLICACAO =
  "Como posso lhe ajudar? Posso tirar suas dúvidas por aqui e, se necessário, " +
  "encaminhar você para um atendimento humano e personalizado. Os atendimentos " +
  "humanos acontecem em horário comercial e/ou nos horários de atendimento da FER.";

/** Returns a safe, presentable first name from a full name, or null. */
export function primeiroNomeSeguro(nomeCompleto?: string | null): string | null {
  if (!nomeCompleto || typeof nomeCompleto !== "string") return null;
  const limpo = nomeCompleto.trim().replace(/\s+/g, " ");
  if (!limpo) return null;
  const primeiro = limpo.split(" ")[0];
  // Reject inconsistent / non-name tokens (numbers, symbols, single letters).
  if (primeiro.length < 2 || !/^[\p{L}'.-]+$/u.test(primeiro)) return null;
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
}

/**
 * Builds Daniel's agreed first-contact greeting. Uses the user's first name when
 * it is safely available, otherwise a neutral fallback. Always includes the
 * persona, the offer to help, the human-escalation note and the human hours.
 */
export function montarSaudacaoInicial(opts: { nome?: string | null; horaLocal?: number }): string {
  const saud = saudacaoPorHora(opts.horaLocal);
  const nome = primeiroNomeSeguro(opts.nome);
  const abertura = nome ? `${saud}, ${nome}.` : `${saud}.`;
  return `${abertura} ${IA_APRESENTACAO_SAUDACAO}. ${IA_SAUDACAO_EXPLICACAO} 🌿`;
}

// First request to talk to a human: acknowledge + gently offer IA help first.
export const RETENCAO_HUMANO_MENSAGEM =
  "Claro, posso te encaminhar se for necessário. Antes disso, posso tentar te " +
  "ajudar por aqui com dúvidas sobre horários da casa, palestras, evangelhoterapia, " +
  "tratamentos, agendamentos, eventos, campanhas e informações gerais. Me diga o " +
  "que você precisa e, se eu não conseguir resolver, encaminho você para um " +
  "atendimento humano. 🌿";
// Second insistence: confirm escalation warmly (then a handoff is opened).
export const ENCAMINHAMENTO_HUMANO_MENSAGEM =
  "Sem problemas! Vou te encaminhar agora para um atendimento humano. Em breve " +
  "alguém da nossa equipe falará com você. 🙏";

/**
 * Decides the IA behaviour for an explicit "talk to a human" request, applying
 * gentle retention on the first ask and escalation on a second insistence.
 * `pedidosAnteriores` is how many prior human requests this conversation had.
 */
export function decidirPedidoHumano(pedidosAnteriores: number): {
  resposta: string; handoff: boolean;
} {
  if ((pedidosAnteriores ?? 0) >= 1) {
    return { resposta: ENCAMINHAMENTO_HUMANO_MENSAGEM, handoff: true };
  }
  return { resposta: RETENCAO_HUMANO_MENSAGEM, handoff: false };
}

// Controlled emoji palette by context — variety with good sense, never spammy.
// Each context offers a few options so the same emoji is not repeated mechanically.
export const EMOJI_PALETA = {
  saudacao: ["✨", "🌿", "🙏"],
  bemestar: ["🌿", "💙", "🙏"],
  ponte: ["🌿", "✨", "🙏"],
  agradecimento: ["🙏", "🌿", "💙"],
  encerramento: ["🙏", "🌿", "💙"],
  agenda: ["📅", "⏰", "✅"],
  aviso: ["⚠️", "📅"],
  handoff: ["🤝"],
} as const;

/** Deterministically picks one emoji from a context palette, avoiding `evitar`. */
export function escolherEmoji(
  contexto: keyof typeof EMOJI_PALETA,
  seed: number,
  evitar?: string | null,
): string {
  const lista = EMOJI_PALETA[contexto] as readonly string[];
  if (!lista || lista.length === 0) return "";
  let idx = ((seed % lista.length) + lista.length) % lista.length;
  if (evitar != null && lista[idx] === evitar) idx = (idx + 1) % lista.length;
  return lista[idx];
}

// Suffixes appended to the FIRST-contact greeting (after the persona presentation).
export const SAUDACAO_SUFIXOS = [
  "Como posso te ajudar?",
  "Posso te ajudar com informações da casa, entrevistas, tratamentos e agendamentos. Como posso te ajudar?",
  "Estou à disposição para te ajudar com informações da casa e seus atendimentos.",
  "Fico à disposição para te ajudar. O que você gostaria de saber?",
];

// Continued conversation (already greeted): keep flowing WITHOUT a new greeting
// and WITHOUT re-introducing the persona. Emojis are injected dynamically.
export const CONTINUACAO_FRASES = [
  "Claro, posso te ajudar com isso. Sobre o que você gostaria de saber?",
  "Fico à disposição. Em que posso ajudar?",
  "Pode me dizer o que você gostaria de saber?",
  "Com prazer. O que você deseja consultar?",
];

// Well-being questions ("tudo bem?", "como vai?").
export const BEM_ESTAR_TERMOS = ["tudo bem", "tudo bom", "como vai", "como voce esta", "como você está"];
export const BEM_ESTAR_FRASES = [
  "Tudo bem, sim. E com você?",
  "Tudo bem, obrigado por perguntar. Em que posso te ajudar?",
  "Tudo ótimo por aqui. Como posso te ajudar?",
];

// Generic request for help / information (bridge).
export const PONTE_FRASES = [
  "Claro, fique à vontade para perguntar. Sobre o que você gostaria de saber?",
  "Posso ajudar, sim. Você gostaria de saber sobre programação, entrevistas ou tratamentos?",
  "Com prazer. Me diga qual informação deseja consultar.",
  "Pode perguntar à vontade. O que você gostaria de saber?",
];

// Thanks.
export const AGRADECIMENTO_FRASES = [
  "Disponha! Fico à disposição se precisar de mais alguma informação.",
  "Por nada! Se precisar, é só me chamar.",
  "Imagina! Estou por aqui se precisar de mais alguma coisa.",
];

// Gentle closing.
export const ENCERRAMENTO_FRASES = [
  "Se precisar de mais alguma informação, sigo à disposição por aqui.",
  "Conte conosco no que for possível.",
  "Se precisar, a casa está à disposição para te acolher.",
  "Fico à disposição caso queira confirmar mais alguma informação.",
];

/** Appends a context emoji to a phrase that does not already carry one. */
function comEmoji(frase: string, emoji: string): string {
  if (!emoji) return frase;
  return `${frase} ${emoji}`;
}

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
  /** Identified contact name (assistido or registered user), when available. */
  nome?: string | null;
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
  // Emoji seed is offset so it doesn't always co-vary with the phrase seed,
  // and the previous reply's trailing emoji is avoided to prevent repetition.
  const emojiAnterior = extrairUltimoEmoji(evitar);
  const emojiSeed = seed + 7;

  if (intencao === "agradecimento") {
    const frase = escolherFrase(AGRADECIMENTO_FRASES, seed, evitar);
    return comEmoji(frase, escolherEmoji("agradecimento", emojiSeed, emojiAnterior));
  }
  if (intencao === "encerramento") {
    const frase = escolherFrase(ENCERRAMENTO_FRASES, seed, evitar);
    return comEmoji(frase, escolherEmoji("encerramento", emojiSeed, emojiAnterior));
  }
  if (intencao === "pedido_informacao") {
    const frase = escolherFrase(PONTE_FRASES, seed, evitar);
    return comEmoji(frase, escolherEmoji("ponte", emojiSeed, emojiAnterior));
  }

  // saudacao
  if (ehBemEstar(ctx.texto)) {
    const frase = escolherFrase(BEM_ESTAR_FRASES, seed, evitar);
    return comEmoji(frase, escolherEmoji("bemestar", emojiSeed, emojiAnterior));
  }

  // If the user explicitly greets with "bom dia" / "boa tarde" / "boa noite",
  // we greet back with the SAME phrase — polite and human, even mid-conversation.
  // Mid-conversation we do NOT re-introduce the persona; only the first contact does.
  const saudacaoUsuario = extrairSaudacaoDoTexto(ctx.texto);
  if (saudacaoUsuario && ctx.jaSaudado) {
    const emoji = escolherEmoji("saudacao", emojiSeed, emojiAnterior);
    const candidatos = [
      `${saudacaoUsuario}! Como posso te ajudar?`,
      `${saudacaoUsuario}! Em que posso ajudar?`,
      `${saudacaoUsuario}! Fico à disposição. Como posso te ajudar?`,
      `${saudacaoUsuario}! O que você gostaria de saber?`,
    ];
    return comEmoji(escolherFrase(candidatos, seed, evitar), emoji);
  }

  // Already greeted: continue the dialog without repeating a greeting or persona.
  if (ctx.jaSaudado) {
    const frase = escolherFrase(CONTINUACAO_FRASES, seed, evitar);
    return comEmoji(frase, escolherEmoji("ponte", emojiSeed, emojiAnterior));
  }

  // FIRST contact: agreed welcoming greeting — period salutation, the user's
  // name when safely available, persona, IA help + human escalation + hours.
  const horaParaSaudacao = (() => {
    if (saudacaoUsuario === "Bom dia") return 9;
    if (saudacaoUsuario === "Boa tarde") return 15;
    if (saudacaoUsuario === "Boa noite") return 20;
    return ctx.horaLocal;
  })();
  return montarSaudacaoInicial({ nome: ctx.nome ?? null, horaLocal: horaParaSaudacao });
}

/** Extracts the trailing emoji of a previous reply (best-effort), for anti-repetition. */
export function extrairUltimoEmoji(texto?: string | null): string | null {
  if (!texto) return null;
  const todos = ["✨", "🌿", "🙏", "💙", "📅", "⏰", "✅", "⚠️", "📍", "🤝"];
  let achado: string | null = null;
  let pos = -1;
  for (const e of todos) {
    const i = texto.lastIndexOf(e);
    if (i > pos) {
      pos = i;
      achado = e;
    }
  }
  return achado;
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
