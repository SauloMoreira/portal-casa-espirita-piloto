// Pure, dependency-free helpers for the WhatsApp inbound flow.
// Shared by the edge function logic and unit tests so the fallback rules
// (every inbound produces either an IA answer or a handoff) are verifiable.

export type Intencao =
  | "tratamento_hoje" | "proxima_sessao" | "horario_entrevista" | "confirmacao_agendamento"
  | "onde_ver_app" | "programacao_publica" | "opt_out" | "reativar" | "complexo";

export const SENSITIVE = ["reclama", "absurdo", "pessimo", "péssimo", "horrivel", "horrível",
  "advogado", "processo", "denuncia", "denúncia", "urgente", "emergencia", "emergência"];

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

export function classificarIntencao(msg: string): Intencao {
  const txt = (msg || "").toLowerCase().trim();
  if (!txt) return "complexo";
  if (SENSITIVE.some((t) => txt.includes(t))) return "complexo";
  for (const { intent, terms } of KEYWORDS) if (terms.some((t) => txt.includes(t))) return intent;
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
