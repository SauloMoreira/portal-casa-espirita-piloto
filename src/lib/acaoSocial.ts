import type { Tables } from "@/integrations/supabase/types";

export type AlimentoAcaoSocial = Tables<"acao_social_alimentos">;

export type AcaoSocialConfig = Tables<"acao_social_config">;

/**
 * Formata uma data ISO (yyyy-mm-dd) para o padrão brasileiro dd/mm/yyyy
 * sem depender de fuso horário (evita o "voltar um dia" do new Date()).
 */
export function formatPrazoData(data?: string | null): string | null {
  if (!data) return null;
  const m = data.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, ano, mes, dia] = m;
  return `${dia}/${mes}/${ano}`;
}

/**
 * Decide se o bloco de prazo deve ser exibido ao assistido e devolve o
 * texto já formatado. Retorna null quando não há prazo cadastrado ou quando
 * a exibição está desativada.
 */
export function prazoEntregaInfo(
  config?: AcaoSocialConfig | null,
): { texto: string; observacao: string | null } | null {
  if (!config || !config.exibir_prazo) return null;
  const data = formatPrazoData(config.prazo_final_entrega);
  if (!data) return null;
  return {
    texto: `Recebimento de doações até ${data}`,
    observacao: config.observacao_prazo?.trim() || null,
  };
}

/**
 * Mensagem institucional única da Ação Social (ex.: orientação sobre prazo de
 * validade dos alimentos doados). Deve ser exibida uma só vez no card, nunca
 * repetida em cada item. Retorna null quando não houver mensagem cadastrada.
 */
export function mensagemInstitucional(config?: AcaoSocialConfig | null): string | null {
  const texto = config?.mensagem_institucional?.trim();
  return texto ? texto : null;
}

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
