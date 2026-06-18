// Pure, testable helpers and business rules for the MFA (second factor) feature.
//
// The cryptographic enrollment/verification of TOTP is handled natively and
// securely by Supabase Auth (`supabase.auth.mfa.*`), which stores the TOTP
// secret server-side and never exposes it after enrollment. This module only
// covers the parts WE own: recovery-code formatting/validation and the
// security decision rules around enabling/disabling/resetting MFA.

/** Number of single-use recovery codes generated on activation. */
export const RECOVERY_CODE_COUNT = 10;

/** Length (characters, excluding the separator) of each recovery code. */
export const RECOVERY_CODE_LENGTH = 10;

/** A TOTP code is always 6 numeric digits. */
export function isValidTotpCode(code: string): boolean {
  return /^\d{6}$/.test((code || "").trim());
}

/**
 * Normalize a recovery code for comparison: strip spaces/dashes and uppercase.
 * Recovery codes are compared against stored hashes after normalization, so the
 * client and server must normalize identically.
 */
export function normalizeRecoveryCode(code: string): string {
  return (code || "").replace(/[\s-]/g, "").toUpperCase();
}

/** A recovery code is 10 chars from an unambiguous base32-like alphabet. */
export function isValidRecoveryCodeFormat(code: string): boolean {
  const n = normalizeRecoveryCode(code);
  return new RegExp(`^[A-Z2-9]{${RECOVERY_CODE_LENGTH}}$`).test(n);
}

/** Present a normalized code as "XXXXX-XXXXX" for display/copy. */
export function formatRecoveryCode(code: string): string {
  const n = normalizeRecoveryCode(code);
  if (n.length !== RECOVERY_CODE_LENGTH) return n;
  return `${n.slice(0, 5)}-${n.slice(5)}`;
}

export interface DisableMfaContext {
  /** Current password was confirmed. */
  passwordConfirmed: boolean;
  /** A valid TOTP code OR a valid recovery code was provided. */
  secondFactorProvided: boolean;
  /** Target account is an Administrador Master. */
  isMaster: boolean;
  /** Master-only extra confirmation acknowledged (stricter rule). */
  masterConfirmed: boolean;
}

export interface DecisionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Decide whether a user may disable their own MFA.
 * Always requires password + a second factor. Masters require an additional
 * explicit confirmation (stricter rule for critical accounts).
 */
export function canDisableMfa(ctx: DisableMfaContext): DecisionResult {
  if (!ctx.passwordConfirmed) return { allowed: false, reason: "Confirme sua senha atual." };
  if (!ctx.secondFactorProvided) {
    return { allowed: false, reason: "Informe um código do autenticador ou um código de recuperação." };
  }
  if (ctx.isMaster && !ctx.masterConfirmed) {
    return { allowed: false, reason: "Administrador Master exige confirmação reforçada para desativar o MFA." };
  }
  return { allowed: true };
}

export interface AdminResetContext {
  /** Caller is an active Administrador Master. */
  callerIsMaster: boolean;
  /** Caller is resetting their own account. */
  isSelf: boolean;
}

/**
 * Administrative reset of another user's MFA is highly controlled: only an
 * Administrador Master may execute it, and never against their own account
 * (self-reset must use the normal disable flow with a second factor).
 */
export function canAdminResetMfa(ctx: AdminResetContext): DecisionResult {
  if (!ctx.callerIsMaster) {
    return { allowed: false, reason: "Apenas o Administrador Master pode resetar o MFA de outro usuário." };
  }
  if (ctx.isSelf) {
    return { allowed: false, reason: "Use a desativação normal (com segundo fator) para sua própria conta." };
  }
  return { allowed: true };
}

export type AalLevel = "aal1" | "aal2";

/**
 * Whether the current session must still complete the second factor.
 * True when the account has a verified factor (nextLevel aal2) but the session
 * is only aal1. Users without MFA have next === current === aal1 -> false.
 */
export function isSecondFactorPending(current: AalLevel | null, next: AalLevel | null): boolean {
  return current === "aal1" && next === "aal2";
}
