import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getAdapter } from "../_shared/channel-adapter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Intencao =
  | "saudacao" | "agradecimento" | "pedido_informacao" | "encerramento"
  | "tratamento_hoje" | "proxima_sessao" | "horario_entrevista" | "confirmacao_agendamento"
  | "onde_ver_app" | "programacao_publica" | "opt_out" | "reativar" | "complexo";

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
  { intent: "programacao_publica", terms: [
    "palestra", "evangelhoterapia", "evangelho terapia", "passe",
    "trabalho publico", "trabalho público", "trabalhos publicos", "trabalhos públicos",
    "atendimento publico", "atendimento público", "programacao", "programação",
    "tem palestra", "tem culto", "abre hoje", "vai abrir", "que horas e a palestra", "que horas é a palestra",
  ] },
  { intent: "onde_ver_app", terms: ["app", "aplicativo", "onde vejo", "onde ver", "sistema", "site"] },
];

function contemTermo(txt: string, termos: string[]): boolean {
  return termos.some((t) => txt === t || txt.startsWith(t + " ") || txt.includes(" " + t) || txt.includes(t));
}

function classificar(msg: string): Intencao {
  const txt = (msg || "").toLowerCase().trim();
  if (!txt) return "complexo";
  if (SENSITIVE.some((t) => txt.includes(t))) return "complexo";
  // Business intents win first (greeting + operational request -> operational).
  for (const { intent, terms } of KEYWORDS) if (terms.some((t) => txt.includes(t))) return intent;
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
const SAUDACAO_SUFIXOS = [
  "Como posso te ajudar hoje?",
  "Fico à disposição. Em que posso ajudar?",
  "Se quiser, posso te ajudar com informações da casa, entrevistas ou tratamentos.",
  "Seja bem-vindo(a). Como posso te ajudar?",
];
const CONTINUACAO_FRASES = [
  "Claro, posso te ajudar com isso. 🌿 Sobre o que você gostaria de saber?",
  "Fico à disposição. 🌿 Em que posso ajudar?",
  "Se quiser, posso te orientar por aqui. 🌿",
  "Pode me dizer o que você gostaria de saber? 🌿",
];
const BEM_ESTAR_TERMOS = ["tudo bem", "tudo bom", "como vai", "como voce esta", "como você está"];
const BEM_ESTAR_FRASES = [
  "Tudo bem, sim. 🌿 E com você?",
  "Tudo bem, graças a Deus. 🌿 Em que posso te ajudar?",
  "Tudo ótimo por aqui. 🌿 Como posso te ajudar hoje?",
];
const PONTE_FRASES = [
  "Claro, fico à disposição. Sobre o que você gostaria de saber? 🌿",
  "Posso ajudar, sim. Você gostaria de saber sobre programação, entrevistas ou tratamentos? 🌿",
  "Com prazer. Pode me dizer qual informação deseja consultar? 🌿",
  "Com prazer! Você gostaria de saber sobre a programação da casa, entrevistas ou tratamentos? 🌿",
];
const AGRADECIMENTO_FRASES = [
  "Disponha! 🌿 Fico à disposição se precisar de mais alguma informação.",
  "Por nada! 🌿 Se precisar, é só me chamar.",
  "Imagina! 🌿 Estou por aqui se precisar de mais alguma coisa.",
];
const ENCERRAMENTO_FRASES = [
  "Conte conosco. 🌿 Se precisar de mais alguma orientação, a casa está à disposição para te acolher.",
  "Fico à disposição se precisar de mais alguma informação. 🌿",
  "Se precisar, posso continuar te ajudando por aqui. 🌿",
  "Conte conosco. 🌿",
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

interface ConversaContexto {
  horaLocal?: number; jaSaudado?: boolean; texto?: string; ultimaResposta?: string | null;
}

function gerarRespostaConversacional(intencao: Intencao, ctx: ConversaContexto = {}): string {
  const seed = hashTexto(ctx.texto || "") + (ctx.jaSaudado ? 1 : 0);
  const evitar = ctx.ultimaResposta ?? null;
  if (intencao === "agradecimento") return escolherFrase(AGRADECIMENTO_FRASES, seed, evitar);
  if (intencao === "encerramento") return escolherFrase(ENCERRAMENTO_FRASES, seed, evitar);
  if (intencao === "pedido_informacao") return escolherFrase(PONTE_FRASES, seed, evitar);
  const txt = (ctx.texto || "").toLowerCase();
  if (BEM_ESTAR_TERMOS.some((t) => txt.includes(t))) return escolherFrase(BEM_ESTAR_FRASES, seed, evitar);
  if (ctx.jaSaudado) return escolherFrase(CONTINUACAO_FRASES, seed, evitar);
  let saudacao = "Olá";
  if (typeof ctx.horaLocal === "number") {
    if (ctx.horaLocal < 12) saudacao = "Bom dia";
    else if (ctx.horaLocal < 18) saudacao = "Boa tarde";
    else saudacao = "Boa noite";
  }
  return escolherFrase(SAUDACAO_SUFIXOS.map((s) => `${saudacao}! 🌿 ${s}`), seed, evitar);
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
  "programacao_publica", "opt_out", "reativar",
];

// Intents that can only be answered automatically when we know who is asking.
const PRECISA_ASSISTIDO: Intencao[] = [
  "tratamento_hoje", "proxima_sessao", "horario_entrevista", "opt_out", "reativar",
];

const CANCELADO_STATUS = ["cancelado", "cancelada", "remarcado", "remarcada"];

function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // admin client is needed across the whole flow (and for the catch-all safety net).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    // Z-API on-message-received webhook shape. Be defensive and also accept
    // legacy/other shapes so the parser survives provider variations.
    const data = body?.data ?? body;
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
      normalizePhone(a.celular || "") === telefone || normalizePhone(a.telefone || "") === telefone
    );

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
        status_conversa: "ativa",
      }).eq("id", conversaId);
    } else {
      const { data: novaConv } = await admin.from("whatsapp_conversas").insert({
        telefone, assistido_id: assistido?.id ?? null, status_conversa: "ativa",
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

    try {
      intencao = classificar(texto);

      if (intencao === "saudacao" || intencao === "agradecimento"
          || intencao === "pedido_informacao" || intencao === "encerramento") {
        // Conversational layer: friendly, brief, human. Never a handoff.
        respostaFonte = "conversa_basica";
        resposta = montarRespostaConversacional(intencao, horaSaoPaulo(), jaSaudado);
      } else if (intencao === "opt_out" && assistido) {
        await admin.from("notificacoes_preferencias").upsert({
          assistido_id: assistido.id, whatsapp_ativo: false,
          opt_out_at: new Date().toISOString(), opt_out_motivo: "solicitado_via_whatsapp",
        }, { onConflict: "assistido_id" });
        resposta = "Tudo certo! Você não receberá mais mensagens operacionais por aqui. Se mudar de ideia, é só responder 'quero receber'. 🌿";
      } else if (intencao === "reativar" && assistido) {
        await admin.from("notificacoes_preferencias").upsert({
          assistido_id: assistido.id, whatsapp_ativo: true, opt_out_at: null, opt_out_motivo: null,
        }, { onConflict: "assistido_id" });
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
      } else if (intencao === "proxima_sessao" && assistido) {
        const hoje = new Date().toISOString().slice(0, 10);
        const { data: sess } = await admin
          .from("agenda_tratamentos_assistido")
          .select("data_sessao, horario, status, tratamento_id, tipos_tratamento ( nome )")
          .eq("assistido_id", assistido.id)
          .neq("status", "realizado")
          .gte("data_sessao", hoje)
          .order("data_sessao", { ascending: true })
          .order("horario", { ascending: true })
          .limit(1).maybeSingle();
        respostaFonte = "agenda_real_assistido";
        let statusFinal = sess?.status ?? null;
        if (sess?.tratamento_id) {
          const { data: ex } = await admin
            .from("excecoes_operacionais")
            .select("status, mensagem_ia")
            .eq("ativo", true)
            .eq("data_excecao", sess.data_sessao)
            .eq("tratamento_id", sess.tratamento_id)
            .maybeSingle();
          if (ex) { statusFinal = ex.status; respostaFonte = "excecao_operacional"; }
        }
        resposta = montarRespostaProximaSessao(sess ? {
          nome: (sess as any)?.tipos_tratamento?.nome || "Tratamento",
          data: sess.data_sessao,
          horario: sess.horario,
          status: statusFinal,
        } : null);
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
      } else if (intencao === "programacao_publica") {
        // Public question. Mandatory lookup order:
        // (1) operational exceptions, (2) real public sessions,
        // (3) standard recurring schedule, (4) legacy fallback rule.
        const { data: baseIso } = hojeSaoPaulo();
        const alvo = resolverDataAlvo(texto, baseIso);
        const atividade = detectarAtividade(texto);

        // 1) EXCEPTIONS registered for the requested date (public scope).
        let excQuery = admin
          .from("excecoes_operacionais")
          .select("atividade, status, mensagem_ia, motivo, nova_data, novo_horario, horario_afetado, prioridade")
          .eq("ativo", true)
          .eq("data_excecao", alvo.iso)
          .eq("tipo", "publico")
          .order("prioridade", { ascending: false });
        if (atividade) excQuery = excQuery.ilike("atividade", `%${atividade}%`);
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
          // Always a safe, valid answer (even "no programming") -> no handoff needed.
          resposta = montarRespostaProgramacao(itens, alvo.label);
        }
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

    // Log inbound with full audit context (identification + intent + fallback).
    await admin.from("notificacoes_log").insert({
      fila_id: null, direcao: "entrada",
      payload_recebido: {
        telefone, texto, intencao,
        assistido_identificado: !!assistido,
        assistido_id: assistido?.id ?? null,
        resposta_fonte: respostaFonte,
        fallback_motivo: fallbackMotivo,
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

    // Send auto-reply (IA). If sending fails, ensure a handoff exists so the
    // message is never "lost": there is always either a reply or a handoff.
    if (resposta) {
      const send = await adapter.send(telefone, resposta);
      respostaOk = send.ok;
      respostaErro = send.error ?? null;
      await admin.from("notificacoes_log").insert({
        fila_id: null, direcao: "saida",
        payload_enviado: { telefone, mensagem: resposta, autor: handoff ? "sistema" : "ia" },
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
