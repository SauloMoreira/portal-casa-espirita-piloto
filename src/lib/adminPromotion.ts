// Pure, testable business rules for the administrative privilege approval flow.
// Authoritative enforcement lives in the database RPCs
// (solicitar_promocao_admin / decidir_promocao_admin); this module mirrors the
// same rules so they can be unit-tested and reused by the UI.

export type AdminPromotionRole = "admin" | "administrador_master";

export type PromotionStatus =
  | "pendente"
  | "aprovado_parcialmente"
  | "aprovado"
  | "rejeitado"
  | "expirado";

export const PROMOTION_STATUS_LABELS: Record<PromotionStatus, string> = {
  pendente: "Pendente",
  aprovado_parcialmente: "Aprovado parcialmente",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
  expirado: "Expirado",
};

export const PROMOTION_ROLE_LABELS: Record<AdminPromotionRole, string> = {
  admin: "Administrador",
  administrador_master: "Administrador Master",
};

/**
 * How many distinct approvals are required to conclude a promotion.
 * - 2 or more active masters -> dupla aprovação (2 distinct approvers).
 * - 1 (or 0) active master    -> aprovação única excepcional do master.
 */
export function computeRequiredApprovals(activeMasters: number): number {
  return activeMasters >= 2 ? 2 : 1;
}

/** Whether the current scenario is the exceptional single-master flow. */
export function isExceptionFlow(activeMasters: number): boolean {
  return activeMasters <= 1;
}

export interface ApprovalContext {
  /** User attempting to approve/reject. */
  approverId: string;
  /** User who created the request. */
  requestedBy: string;
  /** User being promoted. */
  targetUserId: string;
  /** Approvals already required to conclude. */
  requiredApprovals: number;
  /** Whether the approver is an active administrator (apt to approve). */
  approverIsActiveAdmin: boolean;
  /** Whether the approver is an active master (needed in the exception flow). */
  approverIsActiveMaster: boolean;
  /** Ids that have already registered a decision for this request. */
  alreadyDecidedBy: string[];
  /** Current request status. */
  status: PromotionStatus;
  /** Total number of active (apt) administrators in the whole system. */
  aptAdmins: number;
}

export interface ApprovalCheck {
  allowed: boolean;
  reason?: string;
}

/** Decide whether a given approver may register an approval for a request. */
export function canApprove(ctx: ApprovalContext): ApprovalCheck {
  if (ctx.status !== "pendente" && ctx.status !== "aprovado_parcialmente") {
    return { allowed: false, reason: "Solicitação já finalizada." };
  }
  if (!ctx.approverIsActiveAdmin) {
    return { allowed: false, reason: "Apenas administradores ativos podem aprovar." };
  }
  // Bootstrap exception: when the approver is the sole active administrator of
  // the system, the "requester cannot self-approve" rule would deadlock the
  // flow (nobody else exists to approve). Allow self-approval only then.
  if (ctx.approverId === ctx.requestedBy && ctx.aptAdmins > 1) {
    return { allowed: false, reason: "O solicitante não pode aprovar a própria solicitação." };
  }
  if (ctx.approverId === ctx.targetUserId) {
    return { allowed: false, reason: "O usuário indicado não pode aprovar a própria promoção." };
  }
  if (ctx.alreadyDecidedBy.includes(ctx.approverId)) {
    return { allowed: false, reason: "Você já registrou uma decisão para esta solicitação." };
  }
  if (ctx.requiredApprovals === 1 && !ctx.approverIsActiveMaster) {
    return {
      allowed: false,
      reason: "No fluxo excepcional (1 master), somente o Administrador Master pode aprovar.",
    };
  }
  return { allowed: true };
}

/**
 * Given the count of distinct approving decisions, returns the resulting status.
 */
export function resolveStatusAfterApproval(
  approvalsCount: number,
  requiredApprovals: number,
): PromotionStatus {
  return approvalsCount >= requiredApprovals ? "aprovado" : "aprovado_parcialmente";
}

export function isPromotionOpen(status: PromotionStatus): boolean {
  return status === "pendente" || status === "aprovado_parcialmente";
}
