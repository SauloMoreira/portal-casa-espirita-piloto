import { supabase } from "@/integrations/supabase/client";

export interface PreferenciaNotificacao {
  id: string;
  assistido_id: string;
  whatsapp_ativo: boolean;
  opt_out_at: string | null;
  opt_out_motivo: string | null;
  horario_inicio_envio: string;
  horario_fim_envio: string;
}

/** Conteúdo conhecido do payload oficial da fila (gerado pelo backend). */
export interface FilaPayload {
  nome?: string | null;
  tratamento?: string | null;
  data?: string | null;
  horario?: string | null;
  [key: string]: unknown;
}

export interface FilaItem {
  id: string;
  evento_origem: string;
  assistido_id: string | null;
  telefone_normalizado: string | null;
  canal: string;
  template_codigo: string | null;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  retry_count: number;
  external_message_id: string | null;
  erro: string | null;
  created_at: string;
  /** Payload oficial da fila — carrega nome/tratamento sem necessidade de join. */
  payload_json?: FilaPayload | null;
}

/** Nome da pessoa resolvido a partir do payload oficial da fila (sem join). */
export function filaItemNome(f: Pick<FilaItem, "payload_json">): string | null {
  const nome = f.payload_json?.nome;
  return typeof nome === "string" && nome.trim() ? nome.trim() : null;
}

/** Tratamento vinculado, quando aplicável, a partir do payload oficial. */
export function filaItemTratamento(f: Pick<FilaItem, "payload_json">): string | null {
  const t = f.payload_json?.tratamento;
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

/** Previsão oficial de envio = quando a mensagem está/estava programada para sair. */
export function filaItemPrevisao(f: Pick<FilaItem, "scheduled_at">): string | null {
  return f.scheduled_at || null;
}

export type FilaOrdenacao =
  | "previsao_proxima"
  | "previsao_recente"
  | "enviado_recente"
  | "nome"
  | "tratamento";

export interface FilaFiltros {
  status?: string; // "todos" ou status específico
  nome?: string;
  telefone?: string;
  tratamento?: string;
  evento?: string; // evento_origem ou template_codigo
  canal?: string;
  previsaoDe?: string; // ISO ou yyyy-mm-dd
  previsaoAte?: string;
  envioDe?: string;
  envioAte?: string;
}

function inicioDoDia(v: string): number {
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return d.getTime();
}
function fimDoDia(v: string): number {
  const d = new Date(v.length <= 10 ? `${v}T23:59:59.999` : v);
  return d.getTime();
}

/** Filtragem pura e combinável da fila (sem lógica paralela de dados). */
export function filtrarFila(fila: FilaItem[], filtros: FilaFiltros): FilaItem[] {
  const nomeQ = filtros.nome?.trim().toLowerCase();
  const telQ = filtros.telefone?.trim().toLowerCase();
  const tratQ = filtros.tratamento?.trim().toLowerCase();
  const eventoQ = filtros.evento?.trim().toLowerCase();
  const canalQ = filtros.canal?.trim().toLowerCase();

  return fila.filter((f) => {
    if (filtros.status && filtros.status !== "todos" && f.status !== filtros.status) return false;
    if (nomeQ) {
      const nome = (filaItemNome(f) || "").toLowerCase();
      if (!nome.includes(nomeQ)) return false;
    }
    if (telQ) {
      if (!(f.telefone_normalizado || "").toLowerCase().includes(telQ)) return false;
    }
    if (tratQ) {
      const t = (filaItemTratamento(f) || "").toLowerCase();
      if (!t.includes(tratQ)) return false;
    }
    if (eventoQ) {
      const ev = `${f.evento_origem || ""} ${f.template_codigo || ""}`.toLowerCase();
      if (!ev.includes(eventoQ)) return false;
    }
    if (canalQ && canalQ !== "todos") {
      if ((f.canal || "").toLowerCase() !== canalQ) return false;
    }
    if (filtros.previsaoDe && (!f.scheduled_at || new Date(f.scheduled_at).getTime() < inicioDoDia(filtros.previsaoDe))) return false;
    if (filtros.previsaoAte && (!f.scheduled_at || new Date(f.scheduled_at).getTime() > fimDoDia(filtros.previsaoAte))) return false;
    if (filtros.envioDe && (!f.sent_at || new Date(f.sent_at).getTime() < inicioDoDia(filtros.envioDe))) return false;
    if (filtros.envioAte && (!f.sent_at || new Date(f.sent_at).getTime() > fimDoDia(filtros.envioAte))) return false;
    return true;
  });
}

/** Ordenação pura da fila por critério explícito de operação. */
export function ordenarFila(fila: FilaItem[], criterio: FilaOrdenacao): FilaItem[] {
  const arr = [...fila];
  const ts = (v?: string | null) => (v ? new Date(v).getTime() : null);
  switch (criterio) {
    case "previsao_proxima":
      return arr.sort((a, b) => (ts(a.scheduled_at) ?? Infinity) - (ts(b.scheduled_at) ?? Infinity));
    case "previsao_recente":
      return arr.sort((a, b) => (ts(b.scheduled_at) ?? -Infinity) - (ts(a.scheduled_at) ?? -Infinity));
    case "enviado_recente":
      return arr.sort((a, b) => (ts(b.sent_at) ?? -Infinity) - (ts(a.sent_at) ?? -Infinity));
    case "nome":
      return arr.sort((a, b) => (filaItemNome(a) || "~").localeCompare(filaItemNome(b) || "~", "pt-BR"));
    case "tratamento":
      return arr.sort((a, b) => (filaItemTratamento(a) || "~").localeCompare(filaItemTratamento(b) || "~", "pt-BR"));
    default:
      return arr;
  }
}

export interface Conversa {
  id: string;
  assistido_id: string | null;
  telefone: string;
  status_conversa: string;
  ultimo_contato_em: string;
  em_handoff: boolean;
  atendente_responsavel: string | null;
}

export interface Handoff {
  id: string;
  conversa_id: string;
  motivo: string | null;
  classificado_por_ia: boolean;
  origem: string;
  status: string;
  atendente_id: string | null;
  opened_at: string;
  closed_at: string | null;
}

export interface HandoffEnriquecido extends Handoff {
  telefone: string | null;
  assistido_id: string | null;
  assistido_nome: string | null;
  identificado: boolean;
  ultima_mensagem: string | null;
  ultimo_contato_em: string | null;
  atendente_nome: string | null;
}

export interface MensagemConversa {
  id: string;
  direcao: "entrada" | "saida";
  texto: string;
  autor: "assistido" | "ia" | "humano" | "sistema";
  status: string | null;
  erro: string | null;
  created_at: string;
  /** Tipo da mensagem inbound: texto, audio, imagem, video, documento, etc. */
  tipo_mensagem?: string | null;
  /** Indica que a mensagem é uma mídia/placeholder (não texto puro). */
  midia?: boolean;
}

/** Preferência do assistido logado (cria default se não existir). */
export async function getMinhaPreferencia(assistidoId: string): Promise<PreferenciaNotificacao | null> {
  const { data } = await supabase
    .from("notificacoes_preferencias")
    .select("*")
    .eq("assistido_id", assistidoId)
    .maybeSingle();
  return (data as PreferenciaNotificacao) ?? null;
}

export async function setWhatsappAtivo(
  assistidoId: string,
  ativo: boolean,
  motivo?: string,
): Promise<void> {
  const payload = {
    assistido_id: assistidoId,
    whatsapp_ativo: ativo,
    opt_out_at: ativo ? null : new Date().toISOString(),
    opt_out_motivo: ativo ? null : (motivo || "solicitado_no_app"),
  };
  const { error } = await supabase
    .from("notificacoes_preferencias")
    .upsert(payload, { onConflict: "assistido_id" });
  if (error) throw error;
}

/**
 * Lê a preferência de comunicações gerais do assistido.
 * Default seguro = true quando não há registro prévio.
 */
export async function getComunicacaoGeralAtiva(assistidoId: string): Promise<boolean> {
  const { data } = await supabase
    .from("notificacoes_preferencias")
    .select("comunicacao_geral_ativa")
    .eq("assistido_id", assistidoId)
    .maybeSingle();
  return data ? (data as any).comunicacao_geral_ativa !== false : true;
}

/**
 * Persiste a preferência de comunicações gerais via upsert seguro por
 * assistido_id (funciona mesmo sem registro prévio). Compatível com a RLS.
 */
export async function setComunicacaoGeralAtiva(assistidoId: string, ativa: boolean): Promise<void> {
  const { error } = await supabase
    .from("notificacoes_preferencias")
    .upsert(
      { assistido_id: assistidoId, comunicacao_geral_ativa: ativa },
      { onConflict: "assistido_id" },
    );
  if (error) throw error;
}

/**
 * Alvo da preferência de comunicação geral. Centraliza a fonte de dados:
 * - assistido → notificacoes_preferencias (por assistido_id)
 * - staff     → profiles (por user_id)
 */
export type ComunicacaoGeralTarget =
  | { tipo: "assistido"; assistidoId: string }
  | { tipo: "staff"; userId: string };

/** Leitura única da preferência de comunicação geral, independente do papel. */
export async function getComunicacaoGeral(target: ComunicacaoGeralTarget): Promise<boolean> {
  if (target.tipo === "assistido") {
    return getComunicacaoGeralAtiva(target.assistidoId);
  }
  const { data } = await supabase
    .from("profiles")
    .select("comunicacao_geral_ativa")
    .eq("user_id", target.userId)
    .maybeSingle();
  return data ? (data as any).comunicacao_geral_ativa !== false : true;
}

/** Gravação única da preferência de comunicação geral, independente do papel. */
export async function setComunicacaoGeral(target: ComunicacaoGeralTarget, ativa: boolean): Promise<void> {
  if (target.tipo === "assistido") {
    return setComunicacaoGeralAtiva(target.assistidoId, ativa);
  }
  const { error } = await supabase
    .from("profiles")
    .update({ comunicacao_geral_ativa: ativa } as any)
    .eq("user_id", target.userId);
  if (error) throw error;
}

export async function listFila(limit = 100): Promise<FilaItem[]> {
  const { data, error } = await supabase
    .from("notificacoes_fila")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as FilaItem[]) ?? [];
}

/** Resultado estruturado do encerramento manual de um item por erro de cadastro. */
export interface EncerramentoErroCadastroResult {
  ok: boolean;
  fila_id: string;
  status: string;
  motivo_encerramento: string;
  motivo_anterior: string | null;
  assistido_id: string | null;
  encerrado_por: string | null;
  encerrado_em: string;
}

/**
 * Encerra SOMENTE o item atual da fila que ficou inviável por erro de cadastro.
 *
 * Chama a RPC oficial `fn_encerrar_item_fila_erro_cadastro` (SECURITY DEFINER),
 * que valida permissão e elegibilidade no servidor, atualiza status/motivo,
 * grava trilha técnica + auditoria e NÃO altera opt-out/consentimento nem
 * bloqueia o assistido. Toda a regra de negócio fica no backend.
 */
export async function encerrarItemFilaErroCadastro(
  filaId: string,
  observacao?: string,
): Promise<EncerramentoErroCadastroResult> {
  const { data, error } = await supabase.rpc("fn_encerrar_item_fila_erro_cadastro", {
    p_fila_id: filaId,
    p_motivo: "erro_cadastro",
    p_observacao: observacao?.trim() ? observacao.trim() : null,
  });
  if (error) throw error;
  return data as unknown as EncerramentoErroCadastroResult;
}



/** Uma entrada da trilha de log (notificacoes_log) de um item da fila. */
export interface FilaLogEntry {
  id: string;
  direcao: "entrada" | "saida";
  status: string | null;
  erro: string | null;
  mensagem: string | null;
  telefone: string | null;
  external_message_id: string | null;
  created_at: string;
}

/** Detalhe completo de um item da fila: dados + texto enviado + trilha de log. */
export interface FilaItemDetalhe {
  item: FilaItem;
  assistido_nome: string | null;
  mensagem_enviada: string | null;
  logs: FilaLogEntry[];
}

/**
 * Carrega o detalhe completo de um item da fila para auditoria/transparência:
 * dados do envio, conteúdo efetivamente enviado e a trilha em notificacoes_log.
 */
export async function getFilaItemDetalhe(item: FilaItem): Promise<FilaItemDetalhe> {
  const { data: logsRaw, error } = await supabase
    .from("notificacoes_log")
    .select("*")
    .eq("fila_id", item.id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const logs: FilaLogEntry[] = (logsRaw ?? []).map((l: any) => ({
    id: l.id,
    direcao: l.direcao,
    status: l.status,
    erro: l.erro,
    mensagem: l.payload_enviado?.mensagem ?? l.payload_recebido?.texto ?? null,
    telefone: l.payload_enviado?.telefone ?? l.payload_recebido?.telefone ?? null,
    external_message_id:
      l.payload_recebido?.messageId ?? l.payload_recebido?.id ?? null,
    created_at: l.created_at,
  }));

  const mensagem_enviada =
    logs.find((l) => l.direcao === "saida" && l.mensagem)?.mensagem ?? null;

  let assistido_nome: string | null = null;
  if (item.assistido_id) {
    const { data: a } = await supabase
      .from("assistidos")
      .select("nome")
      .eq("id", item.assistido_id)
      .maybeSingle();
    assistido_nome = (a as any)?.nome ?? null;
  }

  return { item, assistido_nome, mensagem_enviada, logs };
}


export async function listConversas(limit = 100): Promise<Conversa[]> {
  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .select("*")
    .order("ultimo_contato_em", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Conversa[]) ?? [];
}

export async function listHandoffs(limit = 100): Promise<Handoff[]> {
  const { data, error } = await supabase
    .from("whatsapp_handoffs")
    .select("*")
    .order("opened_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Handoff[]) ?? [];
}

/** Atendimentos com contexto: telefone, assistido, última mensagem e atendente. */
export async function listHandoffsEnriquecidos(limit = 100): Promise<HandoffEnriquecido[]> {
  const handoffs = await listHandoffs(limit);
  if (handoffs.length === 0) return [];

  const conversaIds = [...new Set(handoffs.map((h) => h.conversa_id))];
  const { data: conversas } = await supabase
    .from("whatsapp_conversas")
    .select("id, telefone, assistido_id, nome_contato, ultima_mensagem, ultimo_contato_em")
    .in("id", conversaIds);
  const convMap = new Map((conversas ?? []).map((c: any) => [c.id, c]));

  const assistidoIds = [...new Set((conversas ?? []).map((c: any) => c.assistido_id).filter(Boolean))];
  const assistidoMap = new Map<string, string>();
  if (assistidoIds.length > 0) {
    const { data: assistidos } = await supabase
      .from("assistidos").select("id, nome").in("id", assistidoIds);
    (assistidos ?? []).forEach((a: any) => assistidoMap.set(a.id, a.nome));
  }

  const atendenteIds = [...new Set(handoffs.map((h) => h.atendente_id).filter(Boolean))] as string[];
  const atendenteMap = new Map<string, string>();
  if (atendenteIds.length > 0) {
    const { data: staff } = await supabase.rpc("staff_names", { _ids: atendenteIds });
    (staff ?? []).forEach((s: any) => atendenteMap.set(s.user_id, s.nome_completo));
  }

  return handoffs.map((h) => {
    const c: any = convMap.get(h.conversa_id);
    const assistidoId = c?.assistido_id ?? null;
    const nomeContato: string | null = c?.nome_contato ?? null;
    const nome = assistidoId ? assistidoMap.get(assistidoId) ?? null : nomeContato;
    return {
      ...h,
      telefone: c?.telefone ?? null,
      assistido_id: assistidoId,
      assistido_nome: nome,
      identificado: !!assistidoId || !!nomeContato,
      ultima_mensagem: c?.ultima_mensagem ?? null,
      ultimo_contato_em: c?.ultimo_contato_em ?? null,
      atendente_nome: h.atendente_id ? atendenteMap.get(h.atendente_id) ?? null : null,
    };
  });
}

/** Histórico de mensagens (inbound/outbound) de uma conversa, por telefone. */
/** Rótulo amigável (placeholder) para mensagens inbound não textuais. */
export function rotuloTipoMensagemConversa(tipo: string): string {
  switch (tipo) {
    case "audio": return "🎤 Usuário enviou um áudio";
    case "imagem": return "🖼️ Usuário enviou uma imagem";
    case "video": return "🎬 Usuário enviou um vídeo";
    case "documento": return "📎 Usuário enviou um documento";
    case "localizacao": return "📍 Usuário enviou uma localização";
    case "contato": return "👤 Usuário enviou um contato";
    case "sticker": return "🌟 Usuário enviou uma figurinha";
    default: return "💬 Usuário enviou uma mensagem";
  }
}

export async function getConversaMensagens(telefone: string): Promise<MensagemConversa[]> {
  if (!telefone) return [];
  const { data, error } = await supabase
    .from("notificacoes_log")
    .select("*")
    .or(`payload_recebido->>telefone.eq.${telefone},payload_enviado->>telefone.eq.${telefone}`)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((l: any): MensagemConversa => {
    if (l.direcao === "entrada") {
      const tipo = (l.payload_recebido?.tipo_mensagem as string | undefined) ?? null;
      const ehMidia = !!tipo && tipo !== "texto";
      // Prioriza o conteúdo de exibição (legenda/placeholder), depois o texto puro,
      // e por fim um placeholder pelo tipo — para a pergunta NUNCA sumir do histórico.
      const texto =
        (l.payload_recebido?.conteudo_exibicao as string | undefined)?.trim() ||
        (l.payload_recebido?.texto as string | undefined)?.trim() ||
        (ehMidia ? rotuloTipoMensagemConversa(tipo!) : "");
      return {
        id: l.id, direcao: "entrada",
        texto,
        autor: "assistido",
        status: l.status, erro: l.erro, created_at: l.created_at,
        tipo_mensagem: tipo, midia: ehMidia,
      };
    }
    const autorRaw = l.payload_enviado?.autor;
    const autor: MensagemConversa["autor"] =
      autorRaw === "humano" ? "humano" : autorRaw === "sistema" ? "sistema" : "ia";
    return {
      id: l.id, direcao: "saida",
      texto: l.payload_enviado?.mensagem ?? "",
      autor,
      status: l.status, erro: l.erro, created_at: l.created_at,
    };
  });
}

export async function assumirHandoff(id: string, atendenteId: string, conversaId: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_handoffs")
    .update({ status: "em_atendimento", atendente_id: atendenteId })
    .eq("id", id);
  if (error) throw error;
  await supabase.from("whatsapp_conversas")
    .update({ atendente_responsavel: atendenteId }).eq("id", conversaId);
}

export async function fecharHandoff(id: string, conversaId: string): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_handoffs")
    .update({ status: "fechado", closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await supabase.from("whatsapp_conversas").update({ em_handoff: false }).eq("id", conversaId);
}

/** Vincula (ou desvincula) um assistido a uma conversa. */
export async function vincularAssistidoConversa(conversaId: string, assistidoId: string | null): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_conversas")
    .update({ assistido_id: assistidoId })
    .eq("id", conversaId);
  if (error) throw error;
}

// ===== Histórico e gestão de conversas (aba Conversas) =====

export interface ConversaEnriquecida {
  id: string;
  telefone: string;
  assistido_id: string | null;
  assistido_nome: string | null;
  identificado: boolean;
  status_conversa: string;
  em_handoff: boolean;
  ultimo_contato_em: string | null;
  ultima_mensagem: string | null;
  total_mensagens: number;
  ultimo_autor: "assistido" | "ia" | "humano" | "sistema" | null;
  intencao: string | null;
  respondida_ia: boolean;
  handoff_motivo: string | null;
  handoff_origem: string | null;
  handoff_status: string | null;
  handoff_atendente_id: string | null;
  tem_handoff: boolean;
  atendente_nome: string | null;
  canal: string;
}

export interface ConversasFiltros {
  inicio?: string | null;
  fim?: string | null;
  status?: string | null;
  identificado?: boolean | null;
  handoff?: boolean | null;
  resolucaoIa?: boolean | null;
  atendente?: string | null;
  busca?: string | null;
  pendente?: boolean | null;
}

export interface ConversasResultado {
  autorizado: boolean;
  total: number;
  rows: ConversaEnriquecida[];
}

/** Lista o histórico de conversas WhatsApp enriquecido, com filtros server-side. */
export async function listConversasEnriquecidas(filtros: ConversasFiltros = {}): Promise<ConversasResultado> {
  const { data, error } = await (supabase.rpc as any)("painel_conversas", {
    p_inicio: filtros.inicio ?? null,
    p_fim: filtros.fim ?? null,
    p_status: filtros.status ?? null,
    p_identificado: filtros.identificado ?? null,
    p_handoff: filtros.handoff ?? null,
    p_resolucao_ia: filtros.resolucaoIa ?? null,
    p_atendente: filtros.atendente ?? null,
    p_busca: filtros.busca?.trim() ? filtros.busca.trim() : null,
    p_pendente: filtros.pendente ?? null,
    p_limit: 300,
  });
  if (error) throw error;
  const r = (data as unknown as ConversasResultado) ?? { autorizado: false, total: 0, rows: [] };
  return { autorizado: r.autorizado, total: r.total ?? 0, rows: r.rows ?? [] };
}

/** Assume uma conversa: define atendente e garante um handoff em atendimento. */
export async function assumirConversa(conversaId: string, atendenteId: string): Promise<void> {
  await supabase.from("whatsapp_conversas")
    .update({ atendente_responsavel: atendenteId, em_handoff: true }).eq("id", conversaId);

  const { data: aberto } = await supabase
    .from("whatsapp_handoffs")
    .select("id")
    .eq("conversa_id", conversaId)
    .neq("status", "fechado")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (aberto?.id) {
    await supabase.from("whatsapp_handoffs")
      .update({ status: "em_atendimento", atendente_id: atendenteId }).eq("id", aberto.id);
  } else {
    await supabase.from("whatsapp_handoffs").insert({
      conversa_id: conversaId,
      motivo: "Intervenção manual do atendente",
      origem: "manual",
      classificado_por_ia: false,
      status: "em_atendimento",
      atendente_id: atendenteId,
    });
  }
}

/** Encerra a conversa e fecha eventuais handoffs abertos. */
export async function encerrarConversa(conversaId: string): Promise<void> {
  await supabase.from("whatsapp_handoffs")
    .update({ status: "fechado", closed_at: new Date().toISOString() })
    .eq("conversa_id", conversaId).neq("status", "fechado");
  const { error } = await supabase.from("whatsapp_conversas")
    .update({ em_handoff: false, status_conversa: "encerrada" }).eq("id", conversaId);
  if (error) throw error;
}

/** Reabre uma conversa encerrada. */
export async function reabrirConversa(conversaId: string): Promise<void> {
  const { error } = await supabase.from("whatsapp_conversas")
    .update({ status_conversa: "ativa" }).eq("id", conversaId);
  if (error) throw error;
}

/** Atualiza o status da conversa (ativa/encerrada). */
export async function atualizarStatusConversa(conversaId: string, status: "ativa" | "encerrada"): Promise<void> {
  const { error } = await supabase.from("whatsapp_conversas")
    .update({ status_conversa: status }).eq("id", conversaId);
  if (error) throw error;
}

/** Marca/desmarca a conversa como revisada para fins de governança. */
export async function marcarConversaRevisada(conversaId: string, atendenteId: string, revisada: boolean): Promise<void> {
  const { error } = await supabase.from("whatsapp_conversas")
    .update({
      revisada_em: revisada ? new Date().toISOString() : null,
      revisada_por: revisada ? atendenteId : null,
    } as any).eq("id", conversaId);
  if (error) throw error;
}

/** Envia uma resposta manual do atendente via Z-API (edge function autenticada). */
export async function responderConversa(conversaId: string, mensagem: string): Promise<{ ok: boolean; erro: string | null }> {
  const { data, error } = await supabase.functions.invoke("whatsapp-responder", {
    body: { conversa_id: conversaId, mensagem },
  });
  if (error) throw error;
  return (data as { ok: boolean; erro: string | null }) ?? { ok: false, erro: "Sem resposta" };
}

/** Dispara manualmente o processamento da fila. */
export async function processarFila(): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("notificacoes-dispatch");
  if (error) throw error;
  return data;
}

// ===== Painel operacional do canal WhatsApp =====

export interface PainelPorTipo {
  tipo: string;
  geradas: number;
  enviadas: number;
  falhas: number;
  taxa_entrega: number;
}

export interface PainelIntent {
  intent: string;
  total: number;
}

export interface PainelFalha {
  tipo: string;
  telefone: string | null;
  erro: string | null;
  quando: string | null;
}

export interface PainelWhatsapp {
  autorizado: boolean;
  periodo?: { inicio: string; fim: string };
  operacional?: {
    geradas: number;
    enviadas: number;
    falhas: number;
    pendentes: number;
    agendados: number;
    canceladas: number;
    inbound: number;
    optout: number;
    handoffs_abertos: number;
    handoffs_resolvidos: number;
    intents_ia: number;
  };
  por_tipo?: PainelPorTipo[];
  intents?: PainelIntent[];
  falhas_recentes?: PainelFalha[];
  impacto?: {
    presenca_atual_pct: number;
    presenca_anterior_pct: number;
    faltas_atual: number;
    faltas_anterior: number;
    presentes_atual: number;
    ausentes_atual: number;
    periodo_anterior: { inicio: string; fim: string };
  };
}

/** Indicadores operacionais e de impacto do canal WhatsApp por período. */
export async function getPainelWhatsapp(inicio: string, fim: string): Promise<PainelWhatsapp> {
  const { data, error } = await supabase.rpc("painel_whatsapp", {
    p_inicio: inicio,
    p_fim: fim,
  });
  if (error) throw error;
  return (data as unknown as PainelWhatsapp) ?? { autorizado: false };
}

// ===== Painel de métricas v2 (5 blocos + filtros) =====

export interface PainelV2Filtros {
  template?: string | null;
  status?: string | null;
  assistido?: string | null;
  resolucao?: "ia" | "handoff" | null;
  optout?: boolean | null;
}

export interface SeriePonto {
  dia: string;
  geradas: number;
  enviadas: number;
  falhas: number;
  inbound: number;
}

export interface PainelV2 {
  autorizado: boolean;
  periodo?: { inicio: string; fim: string; dias: number };
  periodo_anterior?: { inicio: string; fim: string };
  entrega?: {
    geradas: number; enviadas: number; falhas: number;
    pendentes: number; agendados: number; canceladas: number;
    retries: number; tempo_medio_envio_seg: number; sem_telefone: number; inbound: number;
    falhas_por_evento: { evento: string; falhas: number; total: number }[];
    falhas_recentes: { tipo: string; evento: string; telefone: string | null; erro: string | null; retries: number; quando: string | null }[];
  };
  engajamento?: {
    inbound: number; optout: number; reativacoes: number;
    assistidos_impactados: number; media_msgs_por_assistido: number;
    horarios: { hora: number; total: number }[];
    resposta_por_tipo: { tipo: string; enviadas: number }[];
  };
  efetividade?: {
    presenca_atual_pct: number; presenca_anterior_pct: number;
    faltas_atual: number; faltas_anterior: number;
    presentes_atual: number; ausentes_atual: number;
    comparecimento_apos_lembrete_pct: number; comparecimento_base: number;
  };
  ia_humano?: {
    inbound: number; resolvidas_ia: number; handoffs: number; handoffs_resolvidos: number;
    tempo_medio_resolucao_seg: number;
    motivos: { motivo: string; total: number }[];
    intents: { intent: string; total: number; resolvida: boolean }[];
  };
  qualidade?: {
    fora_janela: number; dedup_bloqueadas: number; limite_diario_barradas: number;
    canceladas: number; sem_telefone: number; retries: number;
    por_tipo: { tipo: string; geradas: number; enviadas: number; falhas: number; taxa_entrega: number }[];
    optout_por_tipo: { tipo: string; total: number }[];
  };
  serie?: SeriePonto[];
}

/** Painel completo de métricas do canal WhatsApp (5 blocos) com filtros. */
export async function getPainelWhatsappV2(
  inicio: string,
  fim: string,
  filtros: PainelV2Filtros = {},
): Promise<PainelV2> {
  const { data, error } = await supabase.rpc("painel_whatsapp_v2", {
    p_inicio: inicio,
    p_fim: fim,
    p_template: filtros.template ?? null,
    p_status: filtros.status ?? null,
    p_assistido: filtros.assistido ?? null,
    p_resolucao: filtros.resolucao ?? null,
    p_optout: filtros.optout ?? null,
  });
  if (error) throw error;
  return (data as unknown as PainelV2) ?? { autorizado: false };
}
