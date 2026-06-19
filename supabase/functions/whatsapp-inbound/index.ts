import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getAdapter } from "../_shared/channel-adapter.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";


type Intencao =
  | "saudacao" | "agradecimento" | "pedido_informacao" | "encerramento"
  | "tratamento_hoje" | "proxima_sessao" | "horario_entrevista" | "confirmacao_agendamento"
  | "onde_ver_app" | "programacao_publica" | "eventos" | "campanhas" | "acao_social"
  | "opt_out" | "reativar" | "falar_humano" | "complexo";

// ===== CAMADA 1 — normalização + tolerância a erro (barata e determinística) =====
function normalizarTexto(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const CORRECOES_VOCABULARIO: Record<string, string> = {
  evangelioterapia: "evangelhoterapia", evangelhioterapia: "evangelhoterapia",
  evangeloterapia: "evangelhoterapia", evangelhterapia: "evangelhoterapia",
  tratamnto: "tratamento", tratameto: "tratamento", tratmento: "tratamento",
  trat: "tratamento", tto: "tratamento",
  sesao: "sessao", sessoes: "sessao", secao: "sessao",
  atendimeto: "atendimento", atendimnto: "atendimento",
  entrevsta: "entrevista", entervista: "entrevista", entrvista: "entrevista",
  agendamnto: "agendamento", agendameto: "agendamento",
  palesta: "palestra", palstra: "palestra", palesra: "palestra", palerstra: "palestra",
  progamacao: "programacao",
  campnha: "campanha", campanhia: "campanha", campanas: "campanha",
  aliemntos: "alimentos", alimetos: "alimentos", alimento: "alimentos",
  qdo: "quando", qd: "quando", qnd: "quando",
  prox: "proximo", proxmo: "proximo", proxma: "proxima",
  hj: "hoje", amnha: "amanha", amnh: "amanha", amanhq: "amanha",
  vc: "voce", vcs: "voces", pq: "porque", blz: "beleza",
  evento: "eventos",
};

const VOCAB_FUZZY = [
  "palestra", "evangelhoterapia", "tratamento", "atendimento", "entrevista",
  "agendamento", "programacao", "campanha", "campanhas", "eventos", "alimentos",
  "proximo", "proxima", "amanha", "remarcado", "cancelado", "sessao", "passe", "hoje",
];
const VOCAB_SET = new Set(VOCAB_FUZZY);

function distanciaEdicao(a: string, b: string): number {
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

function corrigirToken(tok: string): string {
  if (!tok) return tok;
  if (CORRECOES_VOCABULARIO[tok]) return CORRECOES_VOCABULARIO[tok];
  if (VOCAB_SET.has(tok)) return tok;
  if (tok.length < 6) return tok;
  for (const w of VOCAB_FUZZY) {
    if (Math.abs(w.length - tok.length) > 1) continue;
    if (distanciaEdicao(tok, w) === 1) return w;
  }
  return tok;
}

function corrigirTexto(s: string): string {
  return normalizarTexto(s)
    .split(" ")
    .map((t) => {
      const m = t.match(/^([\p{L}]+)([\s\S]*)$/u);
      if (!m) return t;
      return corrigirToken(m[1]) + m[2];
    })
    .join(" ");
}

const SENSITIVE = ["reclama", "absurdo", "pessimo", "péssimo", "horrivel", "horrível",
  "advogado", "processo", "denuncia", "denúncia", "urgente", "emergencia", "emergência"];

// Basic conversational / social messages handled by a friendly layer BEFORE
// business logic, so an isolated greeting/thanks never becomes a handoff.
const SAUDACAO_TERMOS = [
  "bom dia", "boa tarde", "boa noite", "ola", "olá", "oi", "oie", "opa",
  "eai", "e ai", "e aí", "tudo bem", "tudo bom", "como vai", "saudacoes", "saudações",
];
const AGRADECIMENTO_TERMOS = [
  "obrigado", "obrigada", "valeu", "vlw", "agradeço", "agradecido",
  "agradecida", "muito obrigado", "muito obrigada", "ok", "okay", "certo", "blz", "beleza",
];
// Bridge layer: generic requests for help/information that keep the conversation
// flowing naturally (instead of repeating a greeting or escalating to a human).
const PEDIDO_INFO_TERMOS = [
  "gostaria de informa", "gostaria de algumas informa", "gostaria de saber",
  "gostaria de uma informa", "gostaria de tirar", "queria saber", "queria uma informa",
  "quero uma informa", "queria tirar uma duvida", "queria tirar uma dúvida",
  "tirar uma duvida", "tirar uma dúvida", "tirar duvida", "tirar dúvida",
  "uma duvida", "uma dúvida", "uma pergunta", "fazer uma pergunta", "posso fazer uma pergunta",
  "duvida", "dúvida", "duvidas", "dúvidas", "algumas duvidas", "algumas dúvidas",
  "umas duvidas", "umas dúvidas", "tirar algumas", "tirar umas", "tirar duvidas", "tirar dúvidas",
  "perguntar", "pergunta", "perguntas", "umas perguntas", "algumas perguntas",
  "preciso de ajuda", "pode me ajudar", "voce pode me ajudar", "você pode me ajudar",
  "me ajuda", "preciso de uma informa", "uma informacao", "uma informação",
  "algumas informacoes", "algumas informações", "quero saber", "preciso saber",
  "informacoes", "informações",
];
// Simple, natural closings — a friendly sign-off, no handoff.
const ENCERRAMENTO_TERMOS = [
  "tchau", "ate logo", "até logo", "ate mais", "até mais", "ate breve", "até breve",
  "ate a proxima", "até a próxima", "era so isso", "era só isso", "so isso", "só isso",
  "nada mais", "por enquanto e so", "por enquanto é só", "fica com deus",
];

// Explicit request to talk to a real person. First time -> gentle retention by
// the IA; on a second insistence the conversation is escalated to human handoff.
const HUMANO_TERMOS = [
  "falar com humano", "falar com um humano", "falar com uma pessoa", "falar com pessoa",
  "falar com atendente", "falar com um atendente", "falar com alguem", "falar com alguém",
  "atendimento humano", "atendente humano", "quero um humano", "quero falar com humano",
  "quero falar com atendente", "quero falar com alguem", "quero falar com alguém",
  "pessoa real", "ser humano", "humano de verdade", "falar com responsavel", "falar com responsável",
];

// Personal intents must win over public-schedule intents so any message using
// personal markers is answered from the assistido's REAL data, not the generic
// house schedule.
const KEYWORDS: Array<{ intent: Intencao; terms: string[] }> = [
  { intent: "opt_out", terms: ["parar", "cancelar mensagens", "nao quero", "não quero", "sair", "descadastr", "remover"] },
  { intent: "reativar", terms: ["voltar a receber", "reativar", "quero receber"] },
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
  { intent: "programacao_publica", terms: [
    "palestra", "evangelhoterapia", "evangelho terapia", "passe",
    "trabalho publico", "trabalho público", "trabalhos publicos", "trabalhos públicos",
    "atendimento publico", "atendimento público", "programacao", "programação",
    "tem palestra", "tem culto", "abre hoje", "vai abrir", "que horas e a palestra", "que horas é a palestra",
  ] },
  { intent: "onde_ver_app", terms: ["app", "aplicativo", "onde vejo", "onde ver", "sistema", "site"] },
];

function contemTermo(txt: string, termos: string[]): boolean {
  // `txt` is already normalized (accent-free); normalize each term too.
  return termos.some((raw) => {
    const t = normalizarTexto(raw);
    return txt === t || txt.startsWith(t + " ") || txt.includes(" " + t) || txt.includes(t);
  });
}

function classificar(msg: string): Intencao {
  const limpo = (msg || "").toLowerCase().trim();
  if (!limpo) return "complexo";
  // CAMADA 1: normalize + correct typos/abbreviations before any matching.
  const txt = corrigirTexto(limpo);
  if (SENSITIVE.some((t) => txt.includes(normalizarTexto(t)))) return "complexo";
  // Explicit request to talk to a human wins over business/conversational layers
  // so the gentle-retention -> handoff flow can be applied.
  if (contemTermo(txt, HUMANO_TERMOS)) return "falar_humano";
  // Word-order-agnostic detection: any "treatment/session" word together with a
  // temporal marker. Public-scope phrasing is excluded so it stays public.
  const TEMPORAL = ["hoje", "amanha", "depois de amanha"];
  const TRAT_PALAVRAS = ["tratamento", "sessao", "atendimento"];
  const ehPublicoExplicito = txt.includes("publico") || txt.includes("publica");
  if (!ehPublicoExplicito
      && TEMPORAL.some((d) => txt.includes(d)) && TRAT_PALAVRAS.some((p) => txt.includes(p))) {
    return "tratamento_hoje";
  }
  // Business intents win first (greeting + operational request -> operational).
  for (const { intent, terms } of KEYWORDS) {
    if (terms.some((t) => txt.includes(normalizarTexto(t)))) return intent;
  }
  // Conversational layers (no handoff), most to least specific. The bridge
  // ("gostaria de informações") wins over a bare greeting so a continued
  // conversation flows naturally instead of repeating the greeting.
  if (contemTermo(txt, PEDIDO_INFO_TERMOS)) return "pedido_informacao";
  if (contemTermo(txt, ENCERRAMENTO_TERMOS)) return "encerramento";
  if (contemTermo(txt, AGRADECIMENTO_TERMOS)) return "agradecimento";
  if (contemTermo(txt, SAUDACAO_TERMOS)) return "saudacao";
  return "complexo";
}

// ===== Conversational generation: controlled repertoire + anti-repetition =====
// The wording is NOT a fixed string per intent. Each "modo" has a repertoire;
// a deterministic seed from the current message picks one, avoiding the exact
// text sent last turn. Data/decisions stay rigid; only the phrasing varies.
const IA_NOME = "Daniel";
const IA_CASA = "FER";
const IA_APRESENTACAO = `Sou ${IA_NOME}, assistente virtual da ${IA_CASA}`;
// Greeting persona line (uses the article "o Daniel" for a warmer, agreed tone).
const IA_APRESENTACAO_SAUDACAO = `Sou o ${IA_NOME}, assistente virtual da ${IA_CASA}`;
// The agreed welcoming closing explaining IA help + human escalation + hours.
const IA_SAUDACAO_EXPLICACAO =
  "Como posso lhe ajudar? Posso tirar suas dúvidas por aqui e, se necessário, " +
  "encaminhar você para um atendimento humano e personalizado. Os atendimentos " +
  "humanos acontecem em horário comercial e/ou nos horários de atendimento da FER.";

/** Returns a safe, presentable first name from a full name, or null. */
function primeiroNomeSeguro(nomeCompleto?: string | null): string | null {
  if (!nomeCompleto || typeof nomeCompleto !== "string") return null;
  const limpo = nomeCompleto.trim().replace(/\s+/g, " ");
  if (!limpo) return null;
  const primeiro = limpo.split(" ")[0];
  // Reject inconsistent / non-name tokens (numbers, symbols, single letters).
  if (primeiro.length < 2 || !/^[\p{L}'.-]+$/u.test(primeiro)) return null;
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
}

/** Period-of-day salutation in pt-BR from a local hour (0-23). */
function saudacaoPorHorario(horaLocal?: number): string {
  if (typeof horaLocal !== "number") return "Olá";
  if (horaLocal < 12) return "Bom dia";
  if (horaLocal < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Builds Daniel's agreed first-contact greeting. Uses the user's first name when
 * it is safely available, otherwise a neutral fallback. Always includes the
 * persona, the offer to help, the human-escalation note and the human hours.
 */
export function montarSaudacaoInicial(opts: { nome?: string | null; horaLocal?: number }): string {
  const saud = saudacaoPorHorario(opts.horaLocal);
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

// Controlled emoji palette by context — variety with good sense, never spammy.
const EMOJI_PALETA: Record<string, string[]> = {
  saudacao: ["✨", "🌿", "🙏"],
  bemestar: ["🌿", "💙", "🙏"],
  ponte: ["🌿", "✨", "🙏"],
  agradecimento: ["🙏", "🌿", "💙"],
  encerramento: ["🙏", "🌿", "💙"],
};

const SAUDACAO_SUFIXOS = [
  "Como posso te ajudar?",
  "Posso te ajudar com informações da casa, entrevistas, tratamentos e agendamentos. Como posso te ajudar?",
  "Estou à disposição para te ajudar com informações da casa e seus atendimentos.",
  "Fico à disposição para te ajudar. O que você gostaria de saber?",
];
const CONTINUACAO_FRASES = [
  "Claro, posso te ajudar com isso. Sobre o que você gostaria de saber?",
  "Fico à disposição. Em que posso ajudar?",
  "Pode me dizer o que você gostaria de saber?",
  "Com prazer. O que você deseja consultar?",
];
const BEM_ESTAR_TERMOS = ["tudo bem", "tudo bom", "como vai", "como voce esta", "como você está"];
const BEM_ESTAR_FRASES = [
  "Tudo bem, sim. E com você?",
  "Tudo bem, obrigado por perguntar. Em que posso te ajudar?",
  "Tudo ótimo por aqui. Como posso te ajudar?",
];
const PONTE_FRASES = [
  "Claro, fique à vontade para perguntar. Sobre o que você gostaria de saber?",
  "Posso ajudar, sim. Você gostaria de saber sobre programação, entrevistas ou tratamentos?",
  "Com prazer. Me diga qual informação deseja consultar.",
  "Pode perguntar à vontade. O que você gostaria de saber?",
];
const AGRADECIMENTO_FRASES = [
  "Disponha! Fico à disposição se precisar de mais alguma informação.",
  "Por nada! Se precisar, é só me chamar.",
  "Imagina! Estou por aqui se precisar de mais alguma coisa.",
];
const ENCERRAMENTO_FRASES = [
  "Se precisar de mais alguma informação, sigo à disposição por aqui.",
  "Conte conosco no que for possível.",
  "Se precisar, a casa está à disposição para te acolher.",
  "Fico à disposição caso queira confirmar mais alguma informação.",
];

function hashTexto(s: string): number {
  let h = 0;
  const t = s || "";
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  return h;
}

function escolherFrase(lista: string[], seed: number, evitar?: string | null): string {
  if (!lista || lista.length === 0) return "";
  if (lista.length === 1) return lista[0];
  let idx = ((seed % lista.length) + lista.length) % lista.length;
  if (evitar != null && lista[idx] === evitar) idx = (idx + 1) % lista.length;
  return lista[idx];
}

function escolherEmoji(contexto: string, seed: number, evitar?: string | null): string {
  const lista = EMOJI_PALETA[contexto];
  if (!lista || lista.length === 0) return "";
  let idx = ((seed % lista.length) + lista.length) % lista.length;
  if (evitar != null && lista[idx] === evitar) idx = (idx + 1) % lista.length;
  return lista[idx];
}

function comEmoji(frase: string, emoji: string): string {
  if (!emoji) return frase;
  return `${frase} ${emoji}`;
}

function extrairUltimoEmoji(texto?: string | null): string | null {
  if (!texto) return null;
  const todos = ["✨", "🌿", "🙏", "💙", "📅", "⏰", "✅", "⚠️", "📍", "🤝"];
  let achado: string | null = null;
  let pos = -1;
  for (const e of todos) {
    const i = texto.lastIndexOf(e);
    if (i > pos) { pos = i; achado = e; }
  }
  return achado;
}

interface ConversaContexto {
  horaLocal?: number; jaSaudado?: boolean; texto?: string; ultimaResposta?: string | null;
  nome?: string | null;
}

function extrairSaudacaoDoTexto(texto: string): string | null {
  const txt = (texto || "").toLowerCase();
  if (txt.includes("bom dia")) return "Bom dia";
  if (txt.includes("boa tarde")) return "Boa tarde";
  if (txt.includes("boa noite")) return "Boa noite";
  return null;
}

function gerarRespostaConversacional(intencao: Intencao, ctx: ConversaContexto = {}): string {
  const seed = hashTexto(ctx.texto || "") + (ctx.jaSaudado ? 1 : 0);
  const evitar = ctx.ultimaResposta ?? null;
  const emojiAnterior = extrairUltimoEmoji(evitar);
  const emojiSeed = seed + 7;

  if (intencao === "agradecimento")
    return comEmoji(escolherFrase(AGRADECIMENTO_FRASES, seed, evitar), escolherEmoji("agradecimento", emojiSeed, emojiAnterior));
  if (intencao === "encerramento")
    return comEmoji(escolherFrase(ENCERRAMENTO_FRASES, seed, evitar), escolherEmoji("encerramento", emojiSeed, emojiAnterior));
  if (intencao === "pedido_informacao")
    return comEmoji(escolherFrase(PONTE_FRASES, seed, evitar), escolherEmoji("ponte", emojiSeed, emojiAnterior));

  const txt = (ctx.texto || "").toLowerCase();
  if (BEM_ESTAR_TERMOS.some((t) => txt.includes(t)))
    return comEmoji(escolherFrase(BEM_ESTAR_FRASES, seed, evitar), escolherEmoji("bemestar", emojiSeed, emojiAnterior));

  // Explicit greeting mid-conversation: greet back, no persona re-introduction.
  const saudacaoUsuario = extrairSaudacaoDoTexto(ctx.texto || "");
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

  if (ctx.jaSaudado)
    return comEmoji(escolherFrase(CONTINUACAO_FRASES, seed, evitar), escolherEmoji("ponte", emojiSeed, emojiAnterior));

  // FIRST contact: agreed welcoming greeting — period salutation, the user's
  // name when safely available, persona, IA help + human escalation + hours.
  const horaParaSaudacao = (() => {
    const u = extrairSaudacaoDoTexto(ctx.texto || "");
    if (u === "Bom dia") return 9;
    if (u === "Boa tarde") return 15;
    if (u === "Boa noite") return 20;
    return ctx.horaLocal;
  })();
  return montarSaudacaoInicial({ nome: ctx.nome ?? null, horaLocal: horaParaSaudacao });
}

// True when the conversation was already greeted recently, so the IA continues
// the dialog instead of repeating the greeting on the next short message.
function jaSaudadoRecentemente(ultimoContatoIso?: string | null, janelaMin = 180): boolean {
  if (!ultimoContatoIso) return false;
  const t = new Date(ultimoContatoIso).getTime();
  if (isNaN(t)) return false;
  const diffMin = (Date.now() - t) / 60000;
  return diffMin >= 0 && diffMin <= janelaMin;
}

const AUTORESOLVIVEIS: Intencao[] = [
  "saudacao", "agradecimento", "pedido_informacao", "encerramento",
  "tratamento_hoje", "proxima_sessao", "horario_entrevista", "confirmacao_agendamento", "onde_ver_app",
  "programacao_publica", "eventos", "campanhas", "acao_social", "opt_out", "reativar", "falar_humano",
];

// Intents that can only be answered automatically when we know who is asking.
// "tratamento_hoje" is NOT here: when there is no identified assistido we still
// answer it from the house's treatment schedule + exceptions for the day.
const PRECISA_ASSISTIDO: Intencao[] = [
  "proxima_sessao", "horario_entrevista", "opt_out", "reativar",
];

// Intents about the assistido's OWN personal data (used to tag the short memory scope).
const PESSOAIS: Intencao[] = ["tratamento_hoje", "proxima_sessao", "horario_entrevista"];


const CANCELADO_STATUS = ["cancelado", "cancelada", "remarcado", "remarcada"];

function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "");
}

/**
 * Canonical Brazilian phone form for comparison: digits only, without the "55"
 * country code, so a stored "21984221866" matches an inbound "5521984221866".
 */
function canonTelefone(p: string): string {
  let d = normalizePhone(p);
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  return d;
}

/**
 * Robust phone equality that tolerates the country code (55) and the optional
 * 9th mobile digit, comparing by the DDD + last 8 digits as a final fallback.
 */
function mesmoTelefone(a: string, b: string): boolean {
  const ca = canonTelefone(a);
  const cb = canonTelefone(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (ca.slice(-10).length === 10 && ca.slice(-10) === cb.slice(-10)) return true;
  // DDD (first 2 of canonical) + last 8 digits, ignoring a missing/extra 9.
  const chave = (s: string) => s.slice(0, 2) + s.slice(-8);
  return chave(ca) === chave(cb);
}

function resumo(texto: string, max = 160): string {
  const t = (texto || "").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function formatarHorario(h: string | null | undefined): string {
  if (!h) return "";
  const [hh, mm] = h.split(":");
  if (mm && mm !== "00") return `${parseInt(hh, 10)}h${mm}`;
  return `${parseInt(hh, 10)}h`;
}

interface ItemProgramacao { nome: string; horario?: string | null; }

function capitalizar(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const MENSAGEM_HANDOFF =
  "Não consegui confirmar isso com segurança agora. Vou encaminhar para atendimento para te orientarmos corretamente. 🌿";

function montarRespostaProgramacao(itens: ItemProgramacao[], label = "hoje"): string {
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

// ===== Institutional modules: events / campaigns / social action =====
interface EventoResumo { titulo: string; data?: string | null; local?: string | null; }
function montarRespostaEventos(eventos: EventoResumo[]): string {
  const lista = (eventos || []).filter((e) => e && e.titulo);
  if (lista.length === 0) {
    return "No momento não encontrei eventos programados. Assim que houver novidades, divulgamos por aqui. 🌿";
  }
  if (lista.length === 1) {
    const e = lista[0];
    const data = e.data ? ` em ${formatarDataCurta(e.data)}` : "";
    const local = e.local ? ` (${e.local})` : "";
    return `Sim, temos o evento "${e.titulo}"${data}${local}. 🌿`;
  }
  const linhas = lista
    .map((e) => `• ${e.titulo}${e.data ? " — " + formatarDataCurta(e.data) : ""}`)
    .join("\n");
  return `Temos estes eventos:\n${linhas}\nSe quiser detalhes de algum, é só me dizer. 🌿`;
}

interface CampanhaResumo { titulo: string; descricao?: string | null; }
function montarRespostaCampanhas(campanhas: CampanhaResumo[]): string {
  const lista = (campanhas || []).filter((c) => c && c.titulo);
  if (lista.length === 0) {
    return "No momento não há campanhas ativas. Quando abrirmos uma nova, aviso por aqui. 🌿";
  }
  if (lista.length === 1) {
    const c = lista[0];
    const desc = c.descricao && c.descricao.trim() ? ` ${c.descricao.trim()}` : "";
    return `Sim, está acontecendo a campanha "${c.titulo}".${desc} Se quiser participar, posso te orientar. 🌿`;
  }
  const linhas = lista.map((c) => `• ${c.titulo}`).join("\n");
  return `Temos estas campanhas em andamento:\n${linhas}\nPosso te ajudar a participar de alguma delas. 🌿`;
}

interface AlimentoFaltante { nome: string; unidade?: string | null; faltante?: number | null; }
function montarRespostaAcaoSocial(alimentos: AlimentoFaltante[]): string {
  const lista = (alimentos || []).filter((a) => a && a.nome);
  if (lista.length === 0) {
    return "No momento não há itens em falta registrados na ação social. Obrigado pelo seu cuidado! Se quiser ajudar, nossa equipe pode te orientar. 🌿";
  }
  const linhas = lista
    .map((a) => {
      const qtd = a.faltante != null && a.faltante > 0
        ? ` (faltam ${a.faltante}${a.unidade ? " " + a.unidade : ""})`
        : "";
      return `• ${a.nome}${qtd}`;
    })
    .join("\n");
  return `Sim, estamos arrecadando para a ação social. Estes itens estão em falta:\n${linhas}\nQualquer doação ajuda muito. 🌿`;
}



interface ExcecaoOperacional {
  atividade: string; status: string; mensagem_ia?: string | null; motivo?: string | null;
  nova_data?: string | null; novo_horario?: string | null; horario_afetado?: string | null;
}

function montarRespostaExcecao(ex: ExcecaoOperacional, label = "hoje"): string {
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
  const h = formatarHorario(ex.horario_afetado);
  return `Sim, ${label} teremos ${ex.atividade}${h ? " às " + h : ""}. 🌿`;
}

function normalizarNome(s: string): string {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

interface ItemDia { nome: string; horario?: string | null; excecao?: ExcecaoOperacional | null; }

/**
 * Consolidated answer for "tem tratamento hoje?" covering ALL treatments of the
 * day and ALL operational exceptions, so days with multiple treatments don't
 * cause confusion. Each activity is listed with its real status (active,
 * cancelled, rescheduled, etc.).
 */
function montarRespostaDiaConsolidado(
  base: ItemProgramacao[],
  excecoes: ExcecaoOperacional[],
  label = "hoje",
): string {
  const quando = capitalizar(label);
  const itens: ItemDia[] = (base || [])
    .filter((i) => i && i.nome)
    .map((i) => ({ nome: i.nome, horario: i.horario ?? null, excecao: null }));

  // Apply / merge exceptions by activity name.
  for (const ex of (excecoes || [])) {
    if (!ex || !ex.atividade) continue;
    const alvo = itens.find((i) => {
      const a = normalizarNome(i.nome);
      const b = normalizarNome(ex.atividade);
      return a === b || a.includes(b) || b.includes(a);
    });
    if (alvo) {
      alvo.excecao = ex;
    } else {
      itens.push({ nome: ex.atividade, horario: ex.horario_afetado ?? null, excecao: ex });
    }
  }

  if (itens.length === 0) {
    return `${quando} não encontrei tratamentos agendados na casa. Em caso de dúvida, nossa equipe pode ajudar. 🌿`;
  }

  const descreverItem = (i: ItemDia): string => {
    const hora = formatarHorario(i.horario);
    const ex = i.excecao;
    if (!ex) return `${i.nome}${hora ? " às " + hora : ""} (normalmente)`;
    const st = (ex.status || "").toLowerCase();
    if (st === "cancelado" || st === "cancelada") {
      const motivo = ex.motivo && ex.motivo.trim() ? ` — ${ex.motivo.trim()}` : "";
      return `${i.nome}: cancelado${motivo}`;
    }
    if (st === "remarcado" || st === "remarcada") {
      const nd = ex.nova_data ? formatarDataCurta(ex.nova_data) : null;
      const nh = formatarHorario(ex.novo_horario);
      return `${i.nome}: remarcado${nd ? " para " + nd : ""}${nh ? " às " + nh : ""}`;
    }
    if (st === "excepcional") {
      const motivo = ex.motivo && ex.motivo.trim() ? ` — ${ex.motivo.trim()}` : "";
      return `${i.nome}: há uma alteração${motivo}`;
    }
    return `${i.nome}${hora ? " às " + hora : ""}`;
  };

  if (itens.length === 1) {
    const i = itens[0];
    const ex = i.excecao;
    const st = (ex?.status || "").toLowerCase();
    if (ex && ex.mensagem_ia && ex.mensagem_ia.trim()) return ex.mensagem_ia.trim();
    if (ex && (st === "cancelado" || st === "cancelada")) {
      const motivo = ex.motivo && ex.motivo.trim() ? ` Motivo: ${ex.motivo.trim()}.` : "";
      return `${quando} não haverá ${i.nome}.${motivo} 🌿`;
    }
    const hora = formatarHorario(i.horario);
    return `Sim, ${label} temos ${i.nome}${hora ? " às " + hora : ""}. 🌿`;
  }

  const linhas = itens.map((i) => `• ${descreverItem(i)}`).join("\n");
  return `${quando} a casa tem mais de um tratamento. Veja a situação de cada um:\n${linhas}\nEm caso de dúvida, nossa equipe pode confirmar. 🌿`;
}

interface SessaoPessoal { nome: string; data: string; horario?: string | null; status?: string | null; }

function formatarDataCurta(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!day) return d;
  return `${day}/${m}`;
}

function montarRespostaTratamentoHoje(sessoes: SessaoPessoal[], label = "hoje"): string {
  const quando = capitalizar(label);
  const lista = (sessoes || []).filter((s) => s && s.nome);
  const ativas = lista.filter((s) => !CANCELADO_STATUS.includes((s.status || "").toLowerCase()));
  const canceladas = lista.filter((s) => CANCELADO_STATUS.includes((s.status || "").toLowerCase()));
  if (ativas.length === 0 && canceladas.length > 0) {
    const c = canceladas[0];
    return `${quando} sua sessão de ${c.nome} consta como ${(c.status || "").toLowerCase()}. Em caso de dúvida, nossa equipe pode confirmar. 🌿`;
  }
  if (ativas.length === 0) return `${quando} você não tem tratamento agendado. 🌿`;
  if (ativas.length === 1) {
    const s = ativas[0];
    const hora = formatarHorario(s.horario);
    return `Sim, ${label} você tem ${s.nome}${hora ? " às " + hora : ""}. 🌿`;
  }
  const linhas = ativas
    .map((s) => `• ${s.nome}${s.horario ? " às " + formatarHorario(s.horario) : ""}`)
    .join("\n");
  return `${quando} você tem:\n${linhas}\n🌿`;
}

function montarRespostaProximaSessao(sessao: SessaoPessoal | null): string {
  if (!sessao || !sessao.nome) {
    return "Não encontrei sessões futuras agendadas no momento. Em caso de dúvida, nossa equipe pode ajudar. 🌿";
  }
  const st = (sessao.status || "").toLowerCase();
  const hora = formatarHorario(sessao.horario);
  const data = formatarDataCurta(sessao.data);
  if (CANCELADO_STATUS.includes(st)) {
    return `Sua próxima sessão de ${sessao.nome} em ${data} consta como ${st}. Nossa equipe pode confirmar a nova data. 🌿`;
  }
  return `Sua próxima sessão é ${sessao.nome} em ${data}${hora ? " às " + hora : ""}. 🌿`;
}

// ===== Contexto temporal: resolve a data referida pela mensagem ATUAL =====
const DIAS_SEMANA: Record<string, number> = {
  domingo: 0, segunda: 1, terca: 2, "terça": 2, quarta: 3,
  quinta: 4, sexta: 5, sabado: 6, "sábado": 6,
};
interface AlvoTempo { iso: string; diaSemana: number; label: string; }
function resolverDataAlvo(texto: string, baseIso: string): AlvoTempo {
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

const ATIVIDADES_PUBLICAS: Array<{ nome: string; termos: string[] }> = [
  { nome: "Palestra Pública", termos: ["palestra"] },
  { nome: "Evangelhoterapia", termos: ["evangelhoterapia", "evangelho terapia"] },
  { nome: "Passe", termos: ["passe"] },
];
function detectarAtividade(texto: string): string | null {
  const txt = (texto || "").toLowerCase();
  for (const a of ATIVIDADES_PUBLICAS) if (a.termos.some((t) => txt.includes(t))) return a.nome;
  return null;
}

/** True when the message itself carries an explicit date reference. */
function temDataExplicita(texto: string): boolean {
  const txt = (texto || "").toLowerCase();
  if (/hoje|amanha|amanhã|depois de amanha|depois de amanhã/.test(txt)) return true;
  for (const nome of Object.keys(DIAS_SEMANA)) if (txt.includes(nome)) return true;
  return false;
}

/**
 * Detects any known activity name (from the DB) inside the message, so the IA
 * recognizes activities like "Apometria" that aren't in the static public list.
 * Longest names first to avoid partial shadowing.
 */
function detectarAtividadePorNome(texto: string, nomes: string[]): string | null {
  const txt = (texto || "").toLowerCase();
  const ordenados = [...nomes].sort((a, b) => (b?.length || 0) - (a?.length || 0));
  for (const nome of ordenados) {
    const n = (nome || "").toLowerCase().trim();
    if (n.length >= 4 && txt.includes(n)) return nome;
  }
  return null;
}

/** Builds an AlvoTempo from an explicit ISO date (used to inherit conversation context). */
function alvoFromIso(iso: string, baseIso: string): AlvoTempo {
  const d = new Date(iso + "T12:00:00Z");
  const base = new Date(baseIso + "T12:00:00Z");
  const diff = Math.round((d.getTime() - base.getTime()) / 86400000);
  const label = diff === 0 ? "hoje" : diff === 1 ? "amanhã" : diff === 2 ? "depois de amanhã" : fmtData(iso);
  return { iso, diaSemana: d.getUTCDay(), label };
}

function hojeSaoPaulo(): { data: string; diaSemana: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  const data = fmt.format(new Date());
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short",
  }).format(new Date());
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { data, diaSemana: map[weekdayName] ?? new Date().getDay() };
}

function horaSaoPaulo(): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false,
  }).format(new Date());
  const n = parseInt(h, 10);
  return isNaN(n) ? new Date().getHours() : n;
}



function fmtData(value: string, withTime = false): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" } : {}),
  });
}

// ===================== FASE 3 — GERAÇÃO FINAL HUMANA (grounded) =====================
// A resposta factual já foi montada deterministicamente (fonte da verdade). Aqui
// um modelo LEVE/BARATO da família flash/lite apenas REESCREVE de forma natural e
// acolhedora, SEM inventar, remover ou alterar nenhum dado (datas/horários/nomes).
// Qualquer falha cai no texto determinístico — nunca fica sem resposta.

interface HumanizarCtx {
  escopo?: string | null;
  jaSaudado?: boolean;
  nome?: string | null;
  ultimosTurnos?: Array<{ papel: string; resumo: string }>;
}

async function humanizarRespostaIA(
  textoFactual: string,
  ctx: HumanizarCtx,
): Promise<{ texto: string; usouLlm: boolean }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey || !textoFactual || !textoFactual.trim()) {
    return { texto: textoFactual, usouLlm: false };
  }

  const historico = (ctx.ultimosTurnos || [])
    .slice(-4)
    .map((t) => `${t.papel === "ia" ? "Daniel" : "Pessoa"}: ${t.resumo}`)
    .join("\n");

  const sistema = [
    "Você é o Daniel, assistente virtual acolhedor de uma casa espírita (FER).",
    "Reescreva a MENSAGEM FACTUAL abaixo de forma natural, calorosa e humana, em português do Brasil.",
    "REGRAS ABSOLUTAS:",
    "- NÃO invente, remova ou altere nenhum fato: mantenha exatamente datas, horários, nomes de atividades e status.",
    "- Se a mensagem factual indica ausência (não há / não encontrei), mantenha a ausência de forma honesta, clara e acolhedora — nunca vaga ou seca.",
    "- Informação principal primeiro, em 1 frase. Complemente só o necessário.",
    ctx.jaSaudado ? "- A conversa já começou: NÃO repita saudações." : "- Pode cumprimentar brevemente.",
    "- Sem frases genéricas, sem burocracia. Fechamento gentil só quando fizer sentido.",
    "- No máximo 1 emoji discreto. Seja conciso (até ~2 frases).",
    "- Responda APENAS com o texto final para o usuário, sem aspas nem rótulos.",
  ].join("\n");

  const usuario = [
    historico ? `Contexto recente da conversa:\n${historico}\n` : "",
    `MENSAGEM FACTUAL a reescrever:\n${textoFactual}`,
  ].join("\n");

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-lite",
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: usuario },
        ],
        temperature: 0.5,
        max_tokens: 220,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return { texto: textoFactual, usouLlm: false };
    const json = await resp.json();
    const out = String(json?.choices?.[0]?.message?.content || "").trim();
    if (!out) return { texto: textoFactual, usouLlm: false };
    return { texto: out, usouLlm: true };
  } catch (_) {
    return { texto: textoFactual, usouLlm: false };
  }
}

// Intenções factuais cuja resposta pode ser humanizada (conversacionais já variam
// sozinhas; handoff e opt-out/in têm texto fixo e sensível, não humanizamos).
const INTENCOES_HUMANIZAVEIS = new Set<Intencao>([
  "tratamento_hoje", "proxima_sessao", "horario_entrevista", "confirmacao_agendamento",
  "onde_ver_app", "programacao_publica", "eventos", "campanhas", "acao_social",
]);

// ===================== FASE 2 — ORQUESTRADOR (precedência + próxima válida) =====================
// Espelho determinístico de src/lib/whatsappOrquestrador.ts (testado em vitest).
// Regras puras: cruzam os fatos já consultados no banco para decidir a fonte
// vencedora e a próxima ocorrência REALMENTE válida (validando exceções).

const EXCECAO_STATUS_INVALIDO = new Set([
  "cancelado", "cancelada", "remarcado", "remarcada", "excepcional", "alterado", "alterada",
]);

function excecaoInvalida(status?: string | null): boolean {
  return EXCECAO_STATUS_INVALIDO.has((status || "").toLowerCase());
}

function nomesEquivalentes(a?: string | null, b?: string | null): boolean {
  const na = normalizarNome(a || "");
  const nb = normalizarNome(b || "");
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

interface CandidataFato {
  atividade: string; data: string; horario?: string | null;
  tratamento_id?: string | null; status?: string | null;
}
interface ExcecaoFatoOrq {
  atividade?: string | null; tratamento_id?: string | null; data: string;
  status: string; nova_data?: string | null; novo_horario?: string | null;
  motivo?: string | null; mensagem_ia?: string | null;
}

function encontrarExcecaoFato(cand: CandidataFato, excecoes: ExcecaoFatoOrq[]): ExcecaoFatoOrq | null {
  for (const ex of excecoes || []) {
    if (!ex || ex.data !== cand.data) continue;
    if (cand.tratamento_id && ex.tratamento_id) {
      if (cand.tratamento_id === ex.tratamento_id) return ex;
      continue;
    }
    if (nomesEquivalentes(ex.atividade, cand.atividade)) return ex;
  }
  return null;
}

interface ResultadoProximaOrq {
  ocorrencia: CandidataFato | null;
  descartadas: Array<{ candidata: CandidataFato; motivo: string }>;
  semValida: boolean;
}

/** Caminha pelas candidatas ordenadas e devolve a primeira realmente válida. */
function proximaOcorrenciaValida(
  candidatas: CandidataFato[], excecoes: ExcecaoFatoOrq[],
): ResultadoProximaOrq {
  const ordenadas = [...(candidatas || [])].sort((a, b) =>
    a.data === b.data
      ? (a.horario || "").localeCompare(b.horario || "")
      : a.data.localeCompare(b.data));
  const descartadas: ResultadoProximaOrq["descartadas"] = [];
  for (const c of ordenadas) {
    const ex = encontrarExcecaoFato(c, excecoes);
    if (ex && excecaoInvalida(ex.status)) {
      descartadas.push({ candidata: c, motivo: (ex.status || "").toLowerCase() });
      continue;
    }
    if (!ex && excecaoInvalida(c.status)) {
      descartadas.push({ candidata: c, motivo: (c.status || "").toLowerCase() });
      continue;
    }
    return { ocorrencia: c, descartadas, semValida: false };
  }
  return { ocorrencia: null, descartadas, semValida: true };
}

function gerarCandidatasSemanais(opts: {
  atividade: string; diasSemana: number[]; horario?: string | null;
  baseIso: string; janelaDias?: number;
}): CandidataFato[] {
  const janela = opts.janelaDias ?? 60;
  const dias = new Set(opts.diasSemana || []);
  const out: CandidataFato[] = [];
  const base = new Date(opts.baseIso + "T12:00:00Z");
  for (let i = 0; i <= janela; i++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    if (dias.has(d.getUTCDay())) {
      out.push({ atividade: opts.atividade, data: d.toISOString().slice(0, 10), horario: opts.horario ?? null });
    }
  }
  return out;
}

/** True quando a mensagem pede explicitamente a PRÓXIMA ocorrência. */
function perguntaProximaOcorrencia(texto: string): boolean {
  const t = normalizarTexto(texto);
  return /\bproxim[ao]\b/.test(t) || t.includes("quando e a") || t.includes("quando e o")
    || t.includes("quando vai") || t.includes("quando tem");
}


Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "authorization, x-client-info, apikey, content-type");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });


  // admin client is needed across the whole flow (and for the catch-all safety net).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const body = await req.json().catch(() => ({}));
  const data = body?.data ?? body;

  // --- Webhook origin verification ---
  // The webhook is public (Z-API cannot send a user JWT), so we require a shared
  // secret passed by the provider either as the `?secret=` query param or the
  // `x-webhook-secret` header. Some Z-API webhook configurations cannot attach
  // custom headers/query params, so we also accept the provider payload when its
  // `instanceId` matches the configured instance. That keeps the existing
  // external entry working without opening a parallel channel.
  {
    const { data: secretRow } = await admin
      .from("app_cron_secrets")
      .select("secret")
      .eq("name", "whatsapp_webhook")
      .maybeSingle();
    const expected = secretRow?.secret;
    if (expected) {
      const url = new URL(req.url);
      const provided = url.searchParams.get("secret") || req.headers.get("x-webhook-secret");
      const configuredInstanceId = Deno.env.get("ZAPI_INSTANCE_ID") || "";
      const payloadInstanceId = String(body?.instanceId || data?.instanceId || "");
      const validZapiPayload = Boolean(
        configuredInstanceId &&
        payloadInstanceId &&
        payloadInstanceId === configuredInstanceId &&
        (body?.phone || data?.phone || data?.key?.remoteJid || data?.remoteJid)
      );
      if (provided !== expected && !validZapiPayload) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  try {
    // Z-API on-message-received webhook shape. Be defensive and also accept
    // legacy/other shapes so the parser survives provider variations.
    const remoteJid: string =
      body?.phone || data?.phone ||
      data?.key?.remoteJid || data?.remoteJid || "";
    const fromMe: boolean = body?.fromMe ?? data?.fromMe ?? data?.key?.fromMe ?? false;
    const texto: string =
      body?.text?.message || data?.text?.message ||
      data?.message?.conversation ||
      data?.message?.extendedTextMessage?.text ||
      body?.message || body?.text || "";

    if (fromMe || !remoteJid) {
      return new Response(JSON.stringify({ ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const telefone = normalizePhone(String(remoteJid).split("@")[0]);
    const adapter = getAdapter({
      ZAPI_INSTANCE_ID: Deno.env.get("ZAPI_INSTANCE_ID"),
      ZAPI_INSTANCE_TOKEN: Deno.env.get("ZAPI_INSTANCE_TOKEN"),
      ZAPI_BASE_URL: Deno.env.get("ZAPI_BASE_URL"),
      ZAPI_CLIENT_TOKEN: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    });

    // Identify assistido by phone (digits-only match on celular/telefone).
    const { data: assistidos } = await admin
      .from("assistidos")
      .select("id, nome, celular, telefone")
      .is("deleted_at", null);
    const assistido = (assistidos || []).find((a: any) =>
      mesmoTelefone(a.celular || "", telefone) || mesmoTelefone(a.telefone || "", telefone)
    );

    // Fallback identification: any registered system user (profiles) by phone.
    // This does NOT link to an assistido — it only records the contact name/type
    // so the panel shows the conversation as "identificado" for staff/volunteers.
    let nomeContato: string | null = assistido?.nome ?? null;
    let tipoContato: string | null = assistido ? "assistido" : null;
    if (!assistido) {
      const { data: perfis } = await admin
        .from("profiles")
        .select("nome_completo, celular");
      const perfil = (perfis || []).find((p: any) =>
        mesmoTelefone(p.celular || "", telefone)
      );
      if (perfil) {
        nomeContato = perfil.nome_completo ?? null;
        tipoContato = "usuario";
      }
    }

    // Upsert conversa (records the last inbound message text + timestamp).
    // Capture whether the user was already greeted recently BEFORE we update the
    // timestamp, so a continued conversation doesn't repeat the greeting.
    let conversaId: string;
    const { data: convExist } = await admin
      .from("whatsapp_conversas").select("*").eq("telefone", telefone).maybeSingle();
    const jaSaudado = jaSaudadoRecentemente(convExist?.ultimo_contato_em);
    // Last reply we sent (short context) for anti-repetition of the wording.
    const ultimaRespostaIA: string | null = convExist?.ultima_resposta_ia ?? null;
    if (convExist) {
      conversaId = convExist.id;
      await admin.from("whatsapp_conversas").update({
        ultimo_contato_em: new Date().toISOString(),
        ultima_mensagem: resumo(texto),
        assistido_id: assistido?.id ?? convExist.assistido_id,
        nome_contato: nomeContato ?? convExist.nome_contato,
        tipo_contato: tipoContato ?? convExist.tipo_contato,
        status_conversa: "ativa",
      }).eq("id", conversaId);
    } else {
      const { data: novaConv } = await admin.from("whatsapp_conversas").insert({
        telefone, assistido_id: assistido?.id ?? null, status_conversa: "ativa",
        nome_contato: nomeContato, tipo_contato: tipoContato,
        ultima_mensagem: resumo(texto),
      }).select("id").single();
      conversaId = novaConv!.id;
    }

    // ===== Classify + build response. Any failure here MUST fall back to handoff. =====
    let intencao: Intencao = "complexo";
    let resposta: string | null = null;
    let handoff = false;
    let handoffMotivo = "";
    let handoffOrigem = "ia";
    let respostaOk = true;
    let respostaErro: string | null = null;
    let fallbackMotivo: string | null = null;
    let respostaFonte: string | null = null;
    let ctxData: string | null = null;
    let ctxAtividade: string | null = null;

    try {
      intencao = classificar(texto);

      // Dynamic activity names from DB (exceptions, standard schedule, treatment
      // types) so the IA recognizes ANY named activity (e.g. "Apometria"), not
      // just the fixed public list — and never gets "lost" on a follow-up.
      let atividadeMencionada: string | null = null;
      try {
        const [excA, progA, tiposA] = await Promise.all([
          admin.from("excecoes_operacionais").select("atividade").eq("ativo", true),
          admin.from("programacao_padrao").select("atividade").eq("ativo", true),
          admin.from("tipos_tratamento").select("nome"),
        ]);
        const set = new Set<string>();
        for (const r of (excA.data || [])) if ((r as any).atividade) set.add((r as any).atividade);
        for (const r of (progA.data || [])) if ((r as any).atividade) set.add((r as any).atividade);
        for (const r of (tiposA.data || [])) if ((r as any).nome) set.add((r as any).nome);
        atividadeMencionada = detectarAtividadePorNome(texto, [...set]);
      } catch (_) { /* fall back to static detection */ }

      // A named activity that wasn't already routed to a data intent is a
      // schedule question — answer it instead of escalating to a human.
      if (atividadeMencionada && (intencao === "complexo" || intencao === "pedido_informacao")) {
        intencao = "programacao_publica";
      }

      // Temporal follow-up ("e amanhã?", "segunda?", "tem trabalho na casa amanhã?")
      // with no other intent: answer from real data instead of escalating.
      // - If a specific public activity is named/inherited -> public-schedule branch.
      // - Otherwise it's a GENERAL question about the day -> consolidated branch
      //   that lists ALL activities of the house (treatments + public works),
      //   not just public ones, so the IA never "misses" the parametrization.
      if ((intencao === "complexo" || intencao === "pedido_informacao") && temDataExplicita(texto)) {
        const atividadeContexto = (!atividadeMencionada && convExist?.contexto_atividade)
          ? String(convExist.contexto_atividade) : null;
        if (atividadeMencionada || detectarAtividade(texto) || atividadeContexto) {
          intencao = "programacao_publica";
          if (atividadeContexto) atividadeMencionada = atividadeContexto;
        } else {
          intencao = "tratamento_hoje";
        }
      }


      if (intencao === "saudacao" || intencao === "agradecimento"
          || intencao === "pedido_informacao" || intencao === "encerramento") {
        // Conversational layer: friendly, brief, human, varied. Never a handoff.
        respostaFonte = "conversa_basica";
        resposta = gerarRespostaConversacional(intencao, {
          horaLocal: horaSaoPaulo(), jaSaudado, texto, ultimaResposta: ultimaRespostaIA,
          nome: nomeContato,
        });
      } else if (intencao === "falar_humano") {
        // Gentle retention on the FIRST request; escalate on a second insistence.
        // The cycle restarts after each resolved handoff so a previously escalated
        // user is welcomed gently again on a brand-new request.
        const { data: ultimoHandoffFechado } = await admin
          .from("whatsapp_handoffs")
          .select("closed_at")
          .eq("conversa_id", conversaId)
          .eq("status", "fechado")
          .order("closed_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        let queryPedidos = admin
          .from("notificacoes_log")
          .select("id", { count: "exact", head: true })
          .eq("direcao", "entrada")
          .eq("payload_recebido->>telefone", telefone)
          .eq("payload_recebido->>intencao", "falar_humano");
        // Only count requests made after the last resolved handoff (if any).
        if (ultimoHandoffFechado?.closed_at) {
          queryPedidos = queryPedidos.gt("created_at", ultimoHandoffFechado.closed_at);
        }
        const { count: pedidosHumano } = await queryPedidos;
        if ((pedidosHumano ?? 0) >= 1) {
          // Second insistence -> escalate to a human handoff.
          respostaFonte = "handoff_humano_segunda";
          resposta = ENCAMINHAMENTO_HUMANO_MENSAGEM;
          handoff = true; handoffOrigem = "regra";
          handoffMotivo = "Solicitação reiterada de atendimento humano";
        } else {
          // First request -> acknowledge and gently offer IA help first.
          respostaFonte = "retencao_humano";
          resposta = RETENCAO_HUMANO_MENSAGEM;
        }
      } else if (intencao === "opt_out" && assistido) {
        await admin.from("notificacoes_preferencias").upsert({
          assistido_id: assistido.id, whatsapp_ativo: false,
          opt_out_at: new Date().toISOString(), opt_out_motivo: "solicitado_via_whatsapp",
          consentimento_status: "revogado", consentimento_at: new Date().toISOString(),
          consentimento_origem: "whatsapp",
        }, { onConflict: "assistido_id" });
        await admin.from("consentimentos_comunicacao").insert({
          assistido_id: assistido.id, canal: "whatsapp", acao: "revogado",
          origem: "whatsapp", observacao: "solicitado_via_whatsapp",
        });
        resposta = "Tudo certo! Você não receberá mais mensagens operacionais por aqui. Se mudar de ideia, é só responder 'quero receber'. 🌿";
      } else if (intencao === "reativar" && assistido) {
        await admin.from("notificacoes_preferencias").upsert({
          assistido_id: assistido.id, whatsapp_ativo: true, opt_out_at: null, opt_out_motivo: null,
          consentimento_status: "concedido", consentimento_at: new Date().toISOString(),
          consentimento_origem: "whatsapp",
        }, { onConflict: "assistido_id" });
        await admin.from("consentimentos_comunicacao").insert({
          assistido_id: assistido.id, canal: "whatsapp", acao: "concedido",
          origem: "whatsapp", observacao: "reativado_via_whatsapp",
        });
        resposta = "Pronto! Voltamos a enviar seus lembretes por aqui. 🌿";
      } else if (intencao === "tratamento_hoje" && assistido) {
        // Personal question about the assistido's own session on the requested
        // day. Order: identify -> operational exceptions -> real agenda.
        const { data: baseIso } = hojeSaoPaulo();
        const alvo = resolverDataAlvo(texto, baseIso);
        const { data: sessoesDia } = await admin
          .from("agenda_tratamentos_assistido")
          .select("horario, status, tratamento_id, tipos_tratamento ( nome )")
          .eq("assistido_id", assistido.id)
          .eq("data_sessao", alvo.iso)
          .order("horario", { ascending: true });

        const tratIds = [...new Set((sessoesDia || []).map((s: any) => s.tratamento_id).filter(Boolean))];
        // Exceptions that affect those treatments on the requested date.
        let excPorTrat: Record<string, any> = {};
        if (tratIds.length > 0) {
          const { data: excs } = await admin
            .from("excecoes_operacionais")
            .select("tratamento_id, atividade, status, mensagem_ia, motivo, nova_data, novo_horario, horario_afetado")
            .eq("ativo", true)
            .eq("data_excecao", alvo.iso)
            .in("tratamento_id", tratIds);
          for (const e of (excs || [])) if (e.tratamento_id) excPorTrat[e.tratamento_id] = e;
        }

        const itensDia: SessaoPessoal[] = (sessoesDia || []).map((s: any) => {
          const ex = excPorTrat[s.tratamento_id];
          return {
            nome: s?.tipos_tratamento?.nome || ex?.atividade || "Tratamento",
            data: alvo.iso,
            horario: s?.horario ?? null,
            status: ex ? ex.status : (s?.status ?? null),
          };
        });

        const aplicouExcecao = Object.keys(excPorTrat).length > 0;
        respostaFonte = aplicouExcecao ? "excecao_operacional" : "agenda_real_assistido";
        // Prefer an admin-authored message when there is a single exception.
        const exUnica = Object.values(excPorTrat)[0] as any;
        resposta = (aplicouExcecao && exUnica?.mensagem_ia && Object.keys(excPorTrat).length === 1)
          ? montarRespostaExcecao(exUnica, alvo.label)
          : montarRespostaTratamentoHoje(itensDia, alvo.label);
      } else if (intencao === "tratamento_hoje") {
        // No identified assistido: answer about the house's treatment schedule
        // for the requested day (exceptions → real sessions → standard schedule)
        // instead of escalating to a human.
        const { data: baseIso } = hojeSaoPaulo();
        const alvo = resolverDataAlvo(texto, baseIso);
        ctxData = alvo.iso;

        // 1) Base list of ALL treatments scheduled for the day: prefer real
        //    public sessions, fall back to the recurring standard schedule.
        const { data: sessoes } = await admin
          .from("sessoes_publicas")
          .select("horario_inicio, status, tipos_tratamento ( nome )")
          .eq("data_sessao", alvo.iso)
          .neq("status", "cancelada");
        let base: ItemProgramacao[] = (sessoes || []).map((s: any) => ({
          nome: s?.tipos_tratamento?.nome || "Atendimento",
          horario: s?.horario_inicio ?? null,
        }));
        let fonteBase = "agenda_publica_real";
        if (base.length === 0) {
          const { data: prog } = await admin
            .from("programacao_padrao")
            .select("atividade, horario")
            .eq("ativo", true)
            .eq("dia_semana", alvo.diaSemana);
          base = (prog || []).map((p: any) => ({ nome: p.atividade, horario: p.horario ?? null }));
          fonteBase = "programacao_padrao";
        }

        // Events scheduled for the requested date are part of "what's happening".
        const { data: eventosDiaRaw } = await admin
          .from("eventos")
          .select("titulo, data_evento, data_inicio, data_fim")
          .eq("ativo", true)
          .or(`data_inicio.eq.${alvo.iso},and(data_inicio.lte.${alvo.iso},data_fim.gte.${alvo.iso})`);
        const eventosDia: ItemProgramacao[] = (eventosDiaRaw || [])
          .filter((e: any) => (e?.data_evento ? String(e.data_evento).slice(0, 10) === alvo.iso : true))
          .map((e: any) => ({
            nome: e?.titulo || "Evento",
            horario: e?.data_evento ? String(e.data_evento).slice(11, 16) : null,
          }));
        if (eventosDia.length > 0) base = [...base, ...eventosDia];

        // 2) ALL operational exceptions registered for the day.
        const { data: excecoesCad } = await admin
          .from("excecoes_operacionais")
          .select("atividade, status, mensagem_ia, motivo, nova_data, novo_horario, horario_afetado, prioridade")
          .eq("ativo", true)
          .eq("data_excecao", alvo.iso)
          .order("prioridade", { ascending: false });

        respostaFonte = (excecoesCad && excecoesCad.length > 0)
          ? "dia_consolidado_com_excecoes"
          : fonteBase;
        // 3) Consolidate base treatments + exceptions into a single answer.
        resposta = montarRespostaDiaConsolidado(
          base,
          (excecoesCad || []) as any,
          alvo.label,
        );
      } else if (intencao === "proxima_sessao" && assistido) {
        // PRÓXIMA OCORRÊNCIA PESSOAL com validação obrigatória de exceção:
        // busca uma JANELA de sessões futuras (não só a primeira), cruza com as
        // exceções operacionais e avança até a próxima que continua válida.
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: sessFuturas } = await admin
          .from("agenda_tratamentos_assistido")
          .select("data_sessao, horario, status, tratamento_id, tipos_tratamento ( nome )")
          .eq("assistido_id", assistido.id)
          .neq("status", "realizado")
          .gte("data_sessao", hoje)
          .order("data_sessao", { ascending: true })
          .order("horario", { ascending: true })
          .limit(30);

        const candidatas: CandidataFato[] = (sessFuturas || []).map((s: any) => ({
          atividade: s?.tipos_tratamento?.nome || "Tratamento",
          data: s.data_sessao, horario: s.horario ?? null,
          tratamento_id: s.tratamento_id ?? null, status: s.status ?? null,
        }));

        // Exceções para as datas/tratamentos candidatos.
        const datasCand = [...new Set(candidatas.map((c) => c.data))];
        const tratCand = [...new Set(candidatas.map((c) => c.tratamento_id).filter(Boolean))] as string[];
        let excecoesOrq: ExcecaoFatoOrq[] = [];
        if (datasCand.length > 0 && tratCand.length > 0) {
          const { data: excs } = await admin
            .from("excecoes_operacionais")
            .select("atividade, tratamento_id, data_excecao, status, mensagem_ia, motivo, nova_data, novo_horario")
            .eq("ativo", true)
            .in("data_excecao", datasCand)
            .in("tratamento_id", tratCand);
          excecoesOrq = (excs || []).map((e: any) => ({
            atividade: e.atividade ?? null, tratamento_id: e.tratamento_id ?? null,
            data: e.data_excecao, status: e.status, mensagem_ia: e.mensagem_ia ?? null,
            motivo: e.motivo ?? null, nova_data: e.nova_data ?? null, novo_horario: e.novo_horario ?? null,
          }));
        }

        const r = proximaOcorrenciaValida(candidatas, excecoesOrq);
        respostaFonte = r.descartadas.length > 0 ? "excecao_operacional+proxima_valida" : "agenda_real_assistido";
        if (r.semValida && candidatas.length > 0) {
          // Honestidade humana: havia candidatas, mas todas estão alteradas.
          resposta = "Não encontrei uma próxima sessão confirmada — as próximas datas constam como alteradas. Se quiser, nossa equipe pode confirmar a nova data para você. 🌿";
        } else {
          const oc = r.ocorrencia;
          resposta = montarRespostaProximaSessao(oc ? {
            nome: oc.atividade, data: oc.data, horario: oc.horario, status: oc.status,
          } : null);
        }

      } else if (intencao === "horario_entrevista" && assistido) {
        const { data: ent } = await admin
          .from("entrevistas_fraternas")
          .select("data, status")
          .eq("assistido_id", assistido.id).eq("status", "agendada")
          .order("data", { ascending: true }).limit(1).maybeSingle();
        respostaFonte = "agenda_real_assistido";
        resposta = ent
          ? `Sua entrevista está agendada para ${fmtData(ent.data, true)}. 🌿`
          : "Não encontrei entrevista agendada no momento. Nossa equipe pode confirmar para você.";
      } else if (intencao === "confirmacao_agendamento") {
        resposta = "Obrigado por confirmar! Esperamos por você. 🌿";
      } else if (intencao === "onde_ver_app") {
        resposta = "Você pode ver seus agendamentos, tratamentos e avisos direto no app, na área 'Painel' e 'Agenda'. 🌿";
      } else if (intencao === "eventos") {
        // Active events, optionally bounded by the requested date window.
        const { data: eventosRaw } = await admin
          .from("eventos")
          .select("titulo, data_evento, data_inicio, data_fim, local, ordem")
          .eq("ativo", true)
          .order("data_evento", { ascending: true })
          .limit(8);
        const hojeIso = hojeSaoPaulo().data;
        const eventos: EventoResumo[] = (eventosRaw || [])
          .filter((e: any) => {
            // Keep events that are upcoming/ongoing (data_fim >= hoje when set).
            if (e?.data_fim) return String(e.data_fim) >= hojeIso;
            if (e?.data_evento) return String(e.data_evento).slice(0, 10) >= hojeIso;
            return true;
          })
          .map((e: any) => ({
            titulo: e?.titulo || "Evento",
            data: e?.data_evento ? String(e.data_evento).slice(0, 10) : (e?.data_inicio ?? null),
            local: e?.local ?? null,
          }));
        respostaFonte = "eventos_reais";
        resposta = montarRespostaEventos(eventos);
      } else if (intencao === "campanhas") {
        const hojeIso = hojeSaoPaulo().data;
        const { data: campsRaw } = await admin
          .from("campanhas")
          .select("titulo, descricao_curta, data_inicio, data_fim, ordem, destaque")
          .eq("ativo", true)
          .order("destaque", { ascending: false })
          .order("ordem", { ascending: true })
          .limit(8);
        const campanhas: CampanhaResumo[] = (campsRaw || [])
          .filter((c: any) => {
            const iniOk = !c?.data_inicio || String(c.data_inicio) <= hojeIso;
            const fimOk = !c?.data_fim || String(c.data_fim) >= hojeIso;
            return iniOk && fimOk;
          })
          .map((c: any) => ({ titulo: c?.titulo || "Campanha", descricao: c?.descricao_curta ?? null }));
        respostaFonte = "campanhas_reais";
        resposta = montarRespostaCampanhas(campanhas);
      } else if (intencao === "acao_social") {
        const { data: alimentosRaw } = await admin
          .from("acao_social_alimentos")
          .select("nome, unidade, quantidade_faltante, ordem")
          .eq("ativo", true)
          .order("ordem", { ascending: true })
          .limit(20);
        const alimentos: AlimentoFaltante[] = (alimentosRaw || [])
          .filter((a: any) => (a?.quantidade_faltante ?? 0) > 0)
          .map((a: any) => ({
            nome: a?.nome || "Item",
            unidade: a?.unidade ?? null,
            faltante: a?.quantidade_faltante ?? null,
          }));
        respostaFonte = "acao_social_real";
        resposta = montarRespostaAcaoSocial(alimentos);
      } else if (intencao === "programacao_publica") {
        // Public question. Mandatory lookup order:
        // (1) operational exceptions, (2) real public sessions,
        // (3) standard recurring schedule, (4) legacy fallback rule.
        const { data: baseIso } = hojeSaoPaulo();
        // Inherit the date from recent conversation context when the follow-up
        // doesn't carry its own ("e a Apometria?" right after "amanhã ...").
        let alvo = resolverDataAlvo(texto, baseIso);
        if (!temDataExplicita(texto) && jaSaudado && convExist?.contexto_data) {
          alvo = alvoFromIso(String(convExist.contexto_data), baseIso);
        }
        const atividade = detectarAtividade(texto) || atividadeMencionada;
        ctxData = alvo.iso;
        ctxAtividade = atividade;

        // PRÓXIMA OCORRÊNCIA PÚBLICA com validação de exceção: "quando é a
        // próxima evangelhoterapia?". Sem data explícita + atividade nomeada,
        // gera candidatas a partir da programação padrão e avança até a válida.
        let resolvidoProxima = false;
        if (atividade && perguntaProximaOcorrencia(texto) && !temDataExplicita(texto)) {
          const { data: progAtiv } = await admin
            .from("programacao_padrao")
            .select("atividade, horario, dia_semana")
            .eq("ativo", true)
            .eq("tipo", "publico")
            .ilike("atividade", `%${atividade}%`);
          const dias = [...new Set((progAtiv || []).map((p: any) => p.dia_semana).filter((d: any) => d != null))];
          const horario = (progAtiv || [])[0]?.horario ?? null;
          const nomeAtiv = (progAtiv || [])[0]?.atividade ?? atividade;
          if (dias.length > 0) {
            const candidatas = gerarCandidatasSemanais({
              atividade: nomeAtiv, diasSemana: dias as number[], horario, baseIso, janelaDias: 60,
            });
            const datasCand = [...new Set(candidatas.map((c) => c.data))];
            let excs: ExcecaoFatoOrq[] = [];
            if (datasCand.length > 0) {
              const { data: exRows } = await admin
                .from("excecoes_operacionais")
                .select("atividade, tratamento_id, data_excecao, status, mensagem_ia, motivo, nova_data, novo_horario")
                .eq("ativo", true)
                .in("data_excecao", datasCand)
                .ilike("atividade", `%${atividade}%`);
              excs = (exRows || []).map((e: any) => ({
                atividade: e.atividade ?? null, tratamento_id: e.tratamento_id ?? null,
                data: e.data_excecao, status: e.status, mensagem_ia: e.mensagem_ia ?? null,
              }));
            }
            const r = proximaOcorrenciaValida(candidatas, excs);
            respostaFonte = r.descartadas.length > 0 ? "programacao_padrao+proxima_valida" : "programacao_padrao";
            resolvidoProxima = true;
            if (r.ocorrencia) {
              const hora = formatarHorario(r.ocorrencia.horario);
              resposta = `A próxima ${nomeAtiv} será em ${formatarDataCurta(r.ocorrencia.data)}${hora ? " às " + hora : ""}. 🌿`;
            } else {
              resposta = `Não encontrei uma próxima ${nomeAtiv} confirmada nos próximos dias. Se quiser, nossa equipe pode te ajudar a confirmar. 🌿`;
            }
          }
        }

        if (!resolvidoProxima) {
        // 1) EXCEPTIONS registered for the requested date.

        // When a specific activity is named (e.g. "evangelhoterapia"), match it by
        // name regardless of the exception's "tipo" — an exception can be registered
        // as "tratamento" even for a public activity. Without a named activity we
        // restrict to public-scope exceptions so personal cancellations don't leak.
        let excQuery = admin
          .from("excecoes_operacionais")
          .select("atividade, status, mensagem_ia, motivo, nova_data, novo_horario, horario_afetado, prioridade")
          .eq("ativo", true)
          .eq("data_excecao", alvo.iso)
          .order("prioridade", { ascending: false });
        if (atividade) excQuery = excQuery.ilike("atividade", `%${atividade}%`);
        else excQuery = excQuery.eq("tipo", "publico");
        const { data: excecoesCad } = await excQuery;

        if (excecoesCad && excecoesCad.length > 0) {
          respostaFonte = "excecao_operacional";
          resposta = montarRespostaExcecao(excecoesCad[0] as any, alvo.label);
        } else {
          // 2) Real public sessions for the requested date.
          const { data: sessoes } = await admin
            .from("sessoes_publicas")
            .select("horario_inicio, status, tipos_tratamento ( nome, trabalho_publico )")
            .eq("data_sessao", alvo.iso)
            .neq("status", "cancelada");
          let itens: ItemProgramacao[] = (sessoes || [])
            .filter((s: any) => s?.tipos_tratamento?.trabalho_publico !== false)
            .map((s: any) => ({
              nome: s?.tipos_tratamento?.nome || "Trabalho público",
              horario: s?.horario_inicio ?? null,
            }));

          if (itens.length > 0) {
            respostaFonte = "agenda_publica_real";
          } else {
            // 3) Standard recurring schedule (fallback) for the weekday.
            let progQuery = admin
              .from("programacao_padrao")
              .select("atividade, horario")
              .eq("ativo", true)
              .eq("dia_semana", alvo.diaSemana)
              .eq("tipo", "publico");
            if (atividade) progQuery = progQuery.ilike("atividade", `%${atividade}%`);
            const { data: prog } = await progQuery;
            itens = (prog || []).map((p: any) => ({ nome: p.atividade, horario: p.horario ?? null }));
            if (itens.length > 0) {
              respostaFonte = "programacao_padrao";
            } else {
              // 4) Legacy JSON fallback rule (backward compatibility).
              const { data: regra } = await admin
                .from("regras_operacionais")
                .select("valor, ativo")
                .eq("chave", "programacao_publica_fallback")
                .eq("ativo", true)
                .maybeSingle();
              if (regra?.valor) {
                try {
                  const cfg = JSON.parse(regra.valor);
                  const doDia = cfg?.[String(alvo.diaSemana)] ?? cfg?.dias?.[String(alvo.diaSemana)] ?? [];
                  itens = (Array.isArray(doDia) ? doDia : [])
                    .map((i: any) => ({ nome: i?.nome, horario: i?.horario ?? null }))
                    .filter((i: ItemProgramacao) => i.nome);
                  if (itens.length > 0) respostaFonte = "regra_operacional";
                } catch (_) { /* malformed rule -> treated as no programming */ }
              }
            }
          }
          // 5) Events scheduled for the requested date (only on a general
          //    "what's happening?" question, not when a specific activity is named).
          if (!atividade) {
            const { data: eventos } = await admin
              .from("eventos")
              .select("titulo, data_evento, data_inicio, data_fim")
              .eq("ativo", true)
              .or(`data_inicio.eq.${alvo.iso},and(data_inicio.lte.${alvo.iso},data_fim.gte.${alvo.iso})`);
            const eventosDia: ItemProgramacao[] = (eventos || [])
              .filter((e: any) => {
                if (e?.data_evento) return String(e.data_evento).slice(0, 10) === alvo.iso;
                return true;
              })
              .map((e: any) => ({
                nome: e?.titulo || "Evento",
                horario: e?.data_evento ? String(e.data_evento).slice(11, 16) : null,
              }));
            if (eventosDia.length > 0) {
              itens = [...itens, ...eventosDia];
              respostaFonte = respostaFonte ? respostaFonte + "+eventos" : "eventos";
            }
          }
          // Always a safe, valid answer (even "no programming") -> no handoff needed.
          resposta = montarRespostaProgramacao(itens, alvo.label);
        }
        } // fim if (!resolvidoProxima)
      }


      // Decide handoff: anything the IA cannot auto-resolve, or that needs an
      // identified assistido but none was found, must escalate to a human.
      if (intencao === "complexo") {
        handoff = true; handoffOrigem = "ia";
        handoffMotivo = "Mensagem que requer atendimento humano";
      } else if (!AUTORESOLVIVEIS.includes(intencao)) {
        handoff = true; handoffOrigem = "regra";
        handoffMotivo = "Intenção sem resposta automática disponível";
      } else if (PRECISA_ASSISTIDO.includes(intencao) && !assistido) {
        handoff = true; handoffOrigem = "regra";
        handoffMotivo = "Assistido não identificado";
      } else if (!resposta) {
        // IA classified an intent but produced no valid action/answer.
        handoff = true; handoffOrigem = "regra";
        handoffMotivo = "IA não produziu uma resposta válida";
      }

    } catch (procErr) {
      // Any technical failure during classification/response building -> handoff.
      fallbackMotivo = `Falha técnica no processamento da IA: ${String(procErr)}`;
      handoff = true; handoffOrigem = "regra";
      handoffMotivo = fallbackMotivo;
      resposta = null;
    }

    // Persist short conversational context (last date/activity) for follow-ups.
    if (ctxData || ctxAtividade) {
      await admin.from("whatsapp_conversas").update({
        contexto_data: ctxData,
        contexto_atividade: ctxAtividade,
      }).eq("id", conversaId);
    }

    // ===== FASE 1 — Memória curta estruturada (assunto/entidade/escopo/turnos) =====
    // Resumo determinístico (sem LLM): mantém no máximo 4 turnos curtos para dar
    // o "fio da conversa" aos follow-ups e à geração humana.
    const escopoAtual: string = PESSOAIS.includes(intencao)
      ? "pessoal"
      : (intencao === "complexo" || intencao === "pedido_informacao" || intencao === "saudacao"
          ? "geral" : "publico");
    const ctxConvAnterior = (convExist?.contexto_conversa as any) || {};
    const turnosAnteriores: Array<{ papel: string; resumo: string; em: string }> =
      Array.isArray(ctxConvAnterior?.ultimos_turnos) ? ctxConvAnterior.ultimos_turnos : [];
    const resumirT = (t: string) => {
      const c = (t || "").replace(/\s+/g, " ").trim();
      return c.length > 120 ? c.slice(0, 119) + "…" : c;
    };
    const turnosComUser = [...turnosAnteriores,
      { papel: "user", resumo: resumirT(texto), em: new Date().toISOString() }].slice(-4);

    // Log inbound with full audit context (identification + intent + fallback).
    await admin.from("notificacoes_log").insert({
      fila_id: null, direcao: "entrada",
      payload_recebido: {
        telefone, texto, intencao,
        assistido_identificado: !!assistido,
        assistido_id: assistido?.id ?? null,
        resposta_fonte: respostaFonte,
        fallback_motivo: fallbackMotivo,
        escopo: escopoAtual,
      },
      status: "recebido",
    });

    if (handoff) {
      const { data: aberto } = await admin
        .from("whatsapp_handoffs").select("id").eq("conversa_id", conversaId)
        .in("status", ["aberto", "em_atendimento"]).maybeSingle();
      if (!aberto) {
        await admin.from("whatsapp_handoffs").insert({
          conversa_id: conversaId,
          motivo: handoffMotivo || "Atendimento humano necessário",
          origem: handoffOrigem,
          classificado_por_ia: handoffOrigem === "ia",
          status: "aberto",
        });
      }
      await admin.from("whatsapp_conversas").update({ em_handoff: true }).eq("id", conversaId);
      resposta = resposta || MENSAGEM_HANDOFF;
    }

    // ===== FASE 3 — Geração final humana (grounded), só p/ intenções factuais =====
    let usouLlm = false;
    if (resposta && !handoff && INTENCOES_HUMANIZAVEIS.has(intencao)) {
      const h = await humanizarRespostaIA(resposta, {
        escopo: escopoAtual, jaSaudado, nome: nomeContato, ultimosTurnos: turnosAnteriores,
      });
      resposta = h.texto;
      usouLlm = h.usouLlm;
    }


    // Send auto-reply (IA). If sending fails, ensure a handoff exists so the
    // message is never "lost": there is always either a reply or a handoff.
    if (resposta) {
      const send = await adapter.send(telefone, resposta);
      respostaOk = send.ok;
      respostaErro = send.error ?? null;
      // Remember the exact reply we sent (short context) for anti-repetition,
      // and persist the structured short memory (entity/scope/temporal/turns).
      if (send.ok) {
        const turnosFinais = [...turnosComUser,
          { papel: "ia", resumo: resumirT(resposta), em: new Date().toISOString() }].slice(-4);
        await admin.from("whatsapp_conversas").update({
          ultima_resposta_ia: resposta,
          contexto_conversa: {
            assunto_atual: intencao,
            entidade_atual: ctxAtividade ?? ctxConvAnterior?.entidade_atual ?? null,
            referencia_temporal: ctxData ?? ctxConvAnterior?.referencia_temporal ?? null,
            escopo: escopoAtual,
            assistido_identificado: !!assistido,
            assistido_id: assistido?.id ?? null,
            ultimos_turnos: turnosFinais,
          },
        }).eq("id", conversaId);
      }
      await admin.from("notificacoes_log").insert({
        fila_id: null, direcao: "saida",
        payload_enviado: { telefone, mensagem: resposta, autor: handoff ? "sistema" : "ia", usou_llm: usouLlm },
        payload_recebido: send.raw ?? null,
        status: send.ok ? "enviado" : "falha", erro: send.error ?? null,
      });


      if (!send.ok && !handoff) {
        // The IA answer could not be delivered -> escalate.
        handoff = true; handoffOrigem = "regra";
        handoffMotivo = `Falha ao enviar resposta automática (Z-API): ${send.error ?? "erro"}`;
        const { data: aberto2 } = await admin
          .from("whatsapp_handoffs").select("id").eq("conversa_id", conversaId)
          .in("status", ["aberto", "em_atendimento"]).maybeSingle();
        if (!aberto2) {
          await admin.from("whatsapp_handoffs").insert({
            conversa_id: conversaId, motivo: handoffMotivo, origem: "regra",
            classificado_por_ia: false, status: "aberto",
          });
        }
        await admin.from("whatsapp_conversas").update({ em_handoff: true }).eq("id", conversaId);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, intencao, handoff, resposta_enviada: !!resposta && respostaOk, erro: respostaErro }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    // Last-resort safety net: never let an inbound disappear silently.
    // Log the failure for auditing even when the main flow blew up early.
    try {
      await admin.from("notificacoes_log").insert({
        fila_id: null, direcao: "entrada",
        payload_recebido: { erro_fatal: String(e), fallback_motivo: "Falha fatal no inbound" },
        status: "falha", erro: String(e),
      });
    } catch (_) { /* ignore logging failure */ }
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
