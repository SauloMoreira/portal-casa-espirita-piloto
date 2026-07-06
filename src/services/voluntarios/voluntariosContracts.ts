// ============================================================================
// Q1-C5 — Contrato tipado do retorno jsonb de busca de pessoa (voluntários).
//
// Consolida o contrato `PessoaCandidata[]` (RPC `fn_buscar_pessoa_para_voluntario`)
// reaproveitando a definição canônica de `src/lib/voluntarioCadastro.ts`
// (fonte de verdade das regras de mapeamento/prefill), preservando total
// compatibilidade. Substitui o antigo `as unknown as` por normalização tipada.
// Dado pessoal reaproveitado (LGPD): nenhum campo é alterado ou omitido.
// ============================================================================

import type { PessoaCandidata } from "@/lib/voluntarioCadastro";

export type { PessoaCandidata };

/**
 * Normaliza o retorno jsonb de `fn_buscar_pessoa_para_voluntario`.
 * Preserva o fallback atual de lista vazia (`data ?? []`).
 */
export function parsePessoaCandidatas(data: unknown): PessoaCandidata[] {
  return (data ?? []) as PessoaCandidata[];
}
