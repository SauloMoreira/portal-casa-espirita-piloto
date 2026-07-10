/**
 * SAAS-06-C1-FIX10 — Central de Chamados: service layer.
 *
 * Encapsula acesso a `chamados_suporte`, `chamado_mensagens`, `chamado_anexos`
 * e ao bucket privado `suporte-anexos`. Nunca expõe erros técnicos brutos —
 * use `toFriendlyError` na camada de UI.
 */
import { supabase } from "@/integrations/supabase/client";

export type ChamadoTipo =
  | "tecnico"
  | "operacional"
  | "comercial"
  | "cobranca"
  | "contrato_documento"
  | "melhoria"
  | "incidente";

export type ChamadoStatus =
  | "aberto"
  | "em_analise"
  | "aguardando_cliente"
  | "aguardando_administrador_global"
  | "aguardando_documento"
  | "resolvido"
  | "resolvido_pelo_suporte"
  | "reaberto"
  | "fechado_pelo_cliente"
  | "fechado_administrativo"
  | "cancelado";

export type ChamadoResolucaoTipo =
  | "correcao_tecnica_aplicada"
  | "orientacao_operacional"
  | "configuracao_ajustada"
  | "documento_recebido"
  | "solicitacao_comercial_tratada"
  | "nao_reproduzido"
  | "fora_do_escopo"
  | "duplicidade"
  | "outro";

export type ChamadoFechamentoCategoria =
  | "sem_retorno_cliente"
  | "duplicidade"
  | "chamado_cancelado"
  | "fora_do_escopo"
  | "resolvido_sem_confirmacao"
  | "erro_nao_reproduzido"
  | "outro";


export type ChamadoPrioridade = "baixa" | "normal" | "alta" | "critica";

export interface Chamado {
  id: string;
  instituicao_id: string;
  criado_por_user_id: string;
  responsavel_user_id: string | null;
  tipo: ChamadoTipo;
  origem: string | null;
  assunto: string;
  descricao: string;
  codigo_tecnico: string | null;
  prioridade: ChamadoPrioridade;
  status: ChamadoStatus;
  visibilidade: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  concluido_em: string | null;
}

export interface ChamadoMensagem {
  id: string;
  chamado_id: string;
  instituicao_id: string;
  autor_user_id: string;
  mensagem: string;
  interno: boolean;
  created_at: string;
}

export interface ChamadoAnexo {
  id: string;
  chamado_id: string;
  mensagem_id: string | null;
  instituicao_id: string;
  enviado_por_user_id: string;
  nome_arquivo: string;
  storage_path: string;
  mime_type: string;
  tamanho_bytes: number;
  created_at: string;
}

export const CHAMADO_TIPO_LABEL: Record<ChamadoTipo, string> = {
  tecnico: "Técnico",
  operacional: "Dúvida operacional",
  comercial: "Comercial",
  cobranca: "Cobrança",
  contrato_documento: "Contrato / documento",
  melhoria: "Melhoria",
  incidente: "Incidente",
};

export const CHAMADO_STATUS_LABEL: Record<ChamadoStatus, string> = {
  aberto: "Aberto",
  em_analise: "Em análise",
  aguardando_cliente: "Aguardando cliente",
  aguardando_administrador_global: "Aguardando administrador",
  aguardando_documento: "Aguardando documento",
  resolvido: "Resolvido",
  cancelado: "Cancelado",
};

export const CHAMADO_PRIORIDADE_LABEL: Record<ChamadoPrioridade, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  critica: "Crítica",
};

export const MIME_PERMITIDOS = [
  "image/png",
  "image/jpeg",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
] as const;

/** Extensões aceitas no seletor de arquivos (fallback para navegadores que
 * enviam MIME vazio ou divergente, ex.: .txt como "" ou "application/octet-stream"). */
export const EXTENSOES_PERMITIDAS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".pdf",
  ".docx",
  ".xlsx",
  ".txt",
] as const;

export const ACCEPT_ATTR = [...MIME_PERMITIDOS, ...EXTENSOES_PERMITIDAS].join(",");

export const MAX_ARQUIVO_BYTES = 10 * 1024 * 1024;
export const MAX_ARQUIVOS_POR_ENVIO = 5;

const EXT_TO_MIME: Record<string, (typeof MIME_PERMITIDOS)[number]> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

/** Resolve o MIME final a gravar: usa o do arquivo quando permitido; caso
 * contrário, tenta inferir pela extensão. Retorna null se não conseguir. */
export function resolveMimeType(file: File): (typeof MIME_PERMITIDOS)[number] | null {
  if (MIME_PERMITIDOS.includes(file.type as (typeof MIME_PERMITIDOS)[number])) {
    return file.type as (typeof MIME_PERMITIDOS)[number];
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_MIME[ext] ?? null;
}

export function validarArquivo(file: File): string | null {
  if (file.size <= 0) return "Arquivo vazio.";
  if (file.size > MAX_ARQUIVO_BYTES) return "Arquivo excede 10 MB.";
  if (!resolveMimeType(file)) {
    return "Tipo de arquivo não permitido. Envie PNG, JPG, PDF, DOCX, XLSX ou TXT.";
  }
  return null;
}

function slugFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(0, 120);
}

function buildStoragePath(instituicaoId: string, chamadoId: string, file: File): string {
  const uid =
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return `${instituicaoId}/${chamadoId}/${uid}-${slugFileName(file.name)}`;
}

export interface CreateChamadoInput {
  instituicaoId: string;
  tipo: ChamadoTipo;
  assunto: string;
  descricao: string;
  origem?: string | null;
  codigoTecnico?: string | null;
  prioridade?: ChamadoPrioridade;
  metadata?: Record<string, unknown>;
}

export async function criarChamado(input: CreateChamadoInput): Promise<Chamado> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("AUTH_REQUIRED");
  const payload = {
    instituicao_id: input.instituicaoId,
    criado_por_user_id: uid,
    tipo: input.tipo,
    assunto: input.assunto.trim(),
    descricao: input.descricao.trim(),
    origem: input.origem ?? null,
    codigo_tecnico: input.codigoTecnico ?? null,
    prioridade: input.prioridade ?? "normal",
    metadata: (input.metadata ?? {}) as unknown as never,
  };
  const { data, error } = await supabase
    .from("chamados_suporte")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return data as Chamado;
}

export async function listarChamados(opts: {
  instituicaoId?: string | null;
  status?: ChamadoStatus | null;
  tipo?: ChamadoTipo | null;
  prioridade?: ChamadoPrioridade | null;
  limit?: number;
}): Promise<Chamado[]> {
  let q = supabase
    .from("chamados_suporte")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.instituicaoId) q = q.eq("instituicao_id", opts.instituicaoId);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.tipo) q = q.eq("tipo", opts.tipo);
  if (opts.prioridade) q = q.eq("prioridade", opts.prioridade);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Chamado[];
}

export async function obterMensagens(chamadoId: string): Promise<ChamadoMensagem[]> {
  const { data, error } = await supabase
    .from("chamado_mensagens")
    .select("*")
    .eq("chamado_id", chamadoId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChamadoMensagem[];
}

export async function obterAnexos(chamadoId: string): Promise<ChamadoAnexo[]> {
  const { data, error } = await supabase
    .from("chamado_anexos")
    .select("*")
    .eq("chamado_id", chamadoId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChamadoAnexo[];
}

export async function enviarMensagem(
  chamado: Pick<Chamado, "id" | "instituicao_id">,
  mensagem: string,
  interno = false,
): Promise<ChamadoMensagem> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("AUTH_REQUIRED");
  const { data, error } = await supabase
    .from("chamado_mensagens")
    .insert({
      chamado_id: chamado.id,
      instituicao_id: chamado.instituicao_id,
      autor_user_id: uid,
      mensagem: mensagem.trim(),
      interno,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ChamadoMensagem;
}

export async function enviarAnexo(
  chamado: Pick<Chamado, "id" | "instituicao_id">,
  file: File,
  mensagemId?: string | null,
): Promise<ChamadoAnexo> {
  const err = validarArquivo(file);
  if (err) throw new Error(err);
  const mime = resolveMimeType(file);
  if (!mime) throw new Error("Tipo de arquivo não permitido. Envie PNG, JPG, PDF, DOCX, XLSX ou TXT.");
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("AUTH_REQUIRED");

  const path = buildStoragePath(chamado.instituicao_id, chamado.id, file);
  const up = await supabase.storage.from("suporte-anexos").upload(path, file, {
    contentType: mime,
    upsert: false,
  });
  if (up.error) throw up.error;

  const { data, error } = await supabase
    .from("chamado_anexos")
    .insert({
      chamado_id: chamado.id,
      instituicao_id: chamado.instituicao_id,
      mensagem_id: mensagemId ?? null,
      enviado_por_user_id: uid,
      nome_arquivo: file.name,
      storage_path: path,
      mime_type: mime,
      tamanho_bytes: file.size,
    })
    .select("*")
    .single();
  if (error) {
    // Compensar: remover objeto órfão
    await supabase.storage.from("suporte-anexos").remove([path]).catch(() => undefined);
    throw error;
  }
  return data as ChamadoAnexo;
}

export async function urlAssinadaAnexo(anexo: ChamadoAnexo, ttlSeconds = 300): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("suporte-anexos")
    .createSignedUrl(anexo.storage_path, ttlSeconds, { download: anexo.nome_arquivo });
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function atualizarStatus(
  chamadoId: string,
  status: ChamadoStatus,
): Promise<void> {
  const patch: { status: ChamadoStatus; concluido_em: string | null } = {
    status,
    concluido_em:
      status === "resolvido" || status === "cancelado" ? new Date().toISOString() : null,
  };
  const { error } = await supabase.from("chamados_suporte").update(patch).eq("id", chamadoId);
  if (error) throw error;
}

export async function atribuirResponsavel(chamadoId: string, userId: string | null): Promise<void> {
  const { error } = await supabase
    .from("chamados_suporte")
    .update({ responsavel_user_id: userId })
    .eq("id", chamadoId);
  if (error) throw error;
}
