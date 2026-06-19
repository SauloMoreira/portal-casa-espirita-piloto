/**
 * Lógica pura do envio institucional (Módulo 5B).
 *
 * Sem efeitos colaterais — define os estados da fila de envio, rótulos,
 * proteção anti-spam (janela de frequência) e cálculo de progresso/observabilidade.
 * O disparo efetivo ocorre na edge function `comunicacao-dispatch`.
 */
import type { Tables } from "@/integrations/supabase/types";

export type EnvioInstitucional = Tables<"comunicacoes_institucionais_envios">;

/** Estado geral do envio de uma comunicação. */
export type EnvioStatus =
  | "nao_iniciado"
  | "preparado"
  | "em_andamento"
  | "concluido"
  | "cancelado";

/** Estado de cada destinatário na fila. */
export type EnvioItemStatus = "pendente" | "enviado" | "falha" | "bloqueado" | "cancelado";

export const ENVIO_STATUS_LABEL: Record<EnvioStatus, string> = {
  nao_iniciado: "Não iniciado",
  preparado: "Fila preparada",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const ENVIO_ITEM_STATUS_LABEL: Record<EnvioItemStatus, string> = {
  pendente: "Pendente",
  enviado: "Enviado",
  falha: "Falha",
  bloqueado: "Bloqueado",
  cancelado: "Cancelado",
};

export const MOTIVO_LABEL: Record<string, string> = {
  limite_frequencia: "Limite de frequência (anti-spam)",
  consentimento_revogado: "Sem consentimento ativo",
  sem_telefone: "Sem telefone cadastrado",
};

/** Janela padrão (em dias) para a proteção anti-spam por frequência. */
export const JANELA_ANTISPAM_DIAS = 7;

/** Tamanho padrão de lote por execução de disparo (escalonamento). */
export const LOTE_PADRAO = 25;

/** Normaliza um valor para um estado geral de envio conhecido. */
export function normalizarEnvioStatus(s: string | null | undefined): EnvioStatus {
  if (s === "preparado" || s === "em_andamento" || s === "concluido" || s === "cancelado") return s;
  return "nao_iniciado";
}

/** Normaliza um valor para um estado de item conhecido. */
export function normalizarItemStatus(s: string | null | undefined): EnvioItemStatus {
  if (s === "enviado" || s === "falha" || s === "bloqueado" || s === "cancelado") return s;
  return "pendente";
}

export interface ComunicacaoEnvioResumo {
  status?: string | null;
  envio_status?: string | null;
  total_destinatarios?: number | null;
  total_enviados?: number | null;
  total_falhas?: number | null;
  total_bloqueados?: number | null;
}

/** True quando a comunicação pode ter a fila preparada (aprovada e ainda não disparada). */
export function podePreparar(c: ComunicacaoEnvioResumo): boolean {
  const env = normalizarEnvioStatus(c.envio_status);
  return c.status === "aprovada" && (env === "nao_iniciado" || env === "preparado");
}

/** True quando há itens pendentes para disparar. */
export function podeDisparar(c: ComunicacaoEnvioResumo): boolean {
  const env = normalizarEnvioStatus(c.envio_status);
  if (c.status !== "aprovada") return false;
  if (env !== "preparado" && env !== "em_andamento") return false;
  return pendentes(c) > 0;
}

/** Quantidade de pendentes derivada dos contadores (anti-spam: bloqueados não contam). */
export function pendentes(c: ComunicacaoEnvioResumo): number {
  const total = c.total_destinatarios ?? 0;
  const enviados = c.total_enviados ?? 0;
  const falhas = c.total_falhas ?? 0;
  const bloqueados = c.total_bloqueados ?? 0;
  return Math.max(total - enviados - falhas - bloqueados, 0);
}

/** Percentual de progresso (0–100) sobre os destinatários elegíveis (excluindo bloqueados). */
export function progressoPercentual(c: ComunicacaoEnvioResumo): number {
  const total = c.total_destinatarios ?? 0;
  const bloqueados = c.total_bloqueados ?? 0;
  const elegiveis = Math.max(total - bloqueados, 0);
  if (elegiveis <= 0) return 0;
  const concluidos = (c.total_enviados ?? 0) + (c.total_falhas ?? 0);
  return Math.min(Math.round((concluidos / elegiveis) * 100), 100);
}
