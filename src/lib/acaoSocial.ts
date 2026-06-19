import type { Tables } from "@/integrations/supabase/types";

export type AlimentoAcaoSocial = Tables<"acao_social_alimentos">;

/** Unidades sugeridas para a lista de alimentos da ação social. */
export const UNIDADES_ALIMENTO = [
  "kg",
  "unidade",
  "pacote",
  "litro",
  "caixa",
  "fardo",
  "dúzia",
] as const;

/**
 * Itens visíveis para o assistido: somente ativos, ordenados pela
 * prioridade definida pela administração (ordem asc) e depois por nome.
 */
export function alimentosVisiveis(itens: AlimentoAcaoSocial[]): AlimentoAcaoSocial[] {
  return [...itens]
    .filter((i) => i.ativo)
    .sort((a, b) => {
      if (a.ordem !== b.ordem) return a.ordem - b.ordem;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
}

/** Ordenação para a área administrativa: ativos primeiro, depois ordem/nome. */
export function alimentosAdmin(itens: AlimentoAcaoSocial[]): AlimentoAcaoSocial[] {
  return [...itens].sort((a, b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/** Texto curto da quantidade faltante para exibição (ex.: "5 kg"). */
export function formatFaltante(item: Pick<AlimentoAcaoSocial, "quantidade_faltante" | "unidade">): string {
  if (item.quantidade_faltante == null) return "—";
  const qtd = Number(item.quantidade_faltante);
  const unidade = item.unidade?.trim();
  return unidade ? `${qtd} ${unidade}` : `${qtd}`;
}

/** Valida o payload mínimo de um item antes de salvar. */
export function validarAlimento(input: { nome?: string | null }): string | null {
  if (!input.nome || input.nome.trim().length < 2) {
    return "Informe o nome do alimento (mínimo 2 caracteres).";
  }
  return null;
}
