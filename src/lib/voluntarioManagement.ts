// Pure, testable business rules for volunteer lifecycle management.
// The authoritative enforcement lives in the `gerenciar_voluntario` database
// function; this module mirrors the rules so they can be unit-tested and reused.

export const DELETE_CONFIRM_WORD = "EXCLUIR";

export function isDeleteConfirmed(input: string): boolean {
  return input.trim().toUpperCase() === DELETE_CONFIRM_WORD;
}

export interface VoluntarioDeletionContext {
  /** Number of função/atuação links referencing the volunteer. */
  funcoesCount: number;
  /** Whether the volunteer has a signed adesão term (data_adesao_voluntariado). */
  hasTermo: boolean;
}

export interface VoluntarioDeletionDecision {
  canDelete: boolean;
  blockers: string[];
}

/**
 * Decide whether a volunteer can be physically deleted.
 * Deletion is allowed ONLY when there are no relevant historical links.
 */
export function evaluateVoluntarioDeletion(
  ctx: VoluntarioDeletionContext,
): VoluntarioDeletionDecision {
  const blockers: string[] = [];
  if (ctx.funcoesCount > 0) blockers.push("vínculos com funções/atuações");
  if (ctx.hasTermo) blockers.push("termo de adesão assinado");
  return { canDelete: blockers.length === 0, blockers };
}

/** Whether a volunteer status counts as "active" for operational eligibility. */
export function isVoluntarioAtivo(status: string): boolean {
  return status === "ativo";
}
