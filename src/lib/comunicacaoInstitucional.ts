/**
 * Lógica pura da comunicação institucional (Módulo 5A).
 *
 * Sem efeitos colaterais para testes isolados. Define os tipos de comunicação,
 * a máquina de estados (rascunho → em revisão → aprovada → arquivada) e a
 * validação do conteúdo antes do envio. O disparo em massa fica no Módulo 5B.
 */
import type { Tables } from "@/integrations/supabase/types";

export type ComunicacaoInstitucional = Tables<"comunicacoes_institucionais">;

export type ComunicacaoTipo = "campanha" | "evento" | "comunicado";

export type ComunicacaoStatus = "rascunho" | "em_revisao" | "aprovada" | "arquivada";

export const TIPOS: { value: ComunicacaoTipo; label: string }[] = [
  { value: "comunicado", label: "Comunicado" },
  { value: "campanha", label: "Campanha" },
  { value: "evento", label: "Evento" },
];

export const STATUS_LABEL: Record<ComunicacaoStatus, string> = {
  rascunho: "Rascunho",
  em_revisao: "Em revisão",
  aprovada: "Aprovada",
  arquivada: "Arquivada",
};

export const MENSAGEM_MAX = 1000;

/** Normaliza um valor para um tipo conhecido (default: comunicado). */
export function normalizarTipo(tipo: string | null | undefined): ComunicacaoTipo {
  if (tipo === "campanha" || tipo === "evento") return tipo;
  return "comunicado";
}

/** Normaliza um valor para um status conhecido (default: rascunho). */
export function normalizarStatus(status: string | null | undefined): ComunicacaoStatus {
  if (status === "em_revisao" || status === "aprovada" || status === "arquivada") return status;
  return "rascunho";
}

export const TRANSICOES: Record<ComunicacaoStatus, ComunicacaoStatus[]> = {
  rascunho: ["em_revisao", "arquivada"],
  em_revisao: ["aprovada", "rascunho", "arquivada"],
  aprovada: ["em_revisao", "arquivada"],
  arquivada: ["rascunho"],
};

/** True quando a transição de status é permitida. */
export function podeTransicionar(de: ComunicacaoStatus, para: ComunicacaoStatus): boolean {
  return TRANSICOES[de]?.includes(para) ?? false;
}

export interface ComunicacaoInput {
  titulo?: string | null;
  tipo?: string | null;
  mensagem?: string | null;
}

/** Valida o conteúdo mínimo de uma comunicação institucional. */
export function validarComunicacao(input: ComunicacaoInput): string | null {
  if (!input.titulo || input.titulo.trim().length < 3) {
    return "Informe um título (mínimo 3 caracteres).";
  }
  if (!input.mensagem || input.mensagem.trim().length < 10) {
    return "Escreva a mensagem (mínimo 10 caracteres).";
  }
  if (input.mensagem.trim().length > MENSAGEM_MAX) {
    return `A mensagem deve ter no máximo ${MENSAGEM_MAX} caracteres.`;
  }
  return null;
}

/** Apenas comunicações aprovadas e com público elegível poderão ser enviadas (5B). */
export function prontaParaEnvio(c: Pick<ComunicacaoInstitucional, "status" | "publico_estimado">): boolean {
  return normalizarStatus(c.status) === "aprovada" && (c.publico_estimado ?? 0) > 0;
}
