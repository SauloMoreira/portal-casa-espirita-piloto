import { describe, it, expect } from "vitest";
import {
  isValidTotpCode,
  normalizeRecoveryCode,
  isValidRecoveryCodeFormat,
  formatRecoveryCode,
  canDisableMfa,
  canAdminResetMfa,
  isSecondFactorPending,
  RECOVERY_CODE_COUNT,
} from "./mfa";

describe("TOTP code validation", () => {
  it("accepts 6 digits", () => {
    expect(isValidTotpCode("123456")).toBe(true);
    expect(isValidTotpCode(" 654321 ")).toBe(true);
  });
  it("rejects malformed codes", () => {
    expect(isValidTotpCode("12345")).toBe(false);
    expect(isValidTotpCode("1234567")).toBe(false);
    expect(isValidTotpCode("12a456")).toBe(false);
  });
});

describe("recovery code formatting", () => {
  it("normalizes dashes/spaces and uppercases", () => {
    expect(normalizeRecoveryCode("ab2cd-3efg9")).toBe("AB2CD3EFG9");
    expect(normalizeRecoveryCode(" a b 2 ")).toBe("AB2");
  });
  it("validates the 10-char base32-like format", () => {
    expect(isValidRecoveryCodeFormat("ABCDE-23456")).toBe(true);
    expect(isValidRecoveryCodeFormat("ABCDE23456")).toBe(true);
    expect(isValidRecoveryCodeFormat("ABC")).toBe(false);
    expect(isValidRecoveryCodeFormat("ABCDE-2345O")).toBe(false); // O not allowed
  });
  it("formats as XXXXX-XXXXX", () => {
    expect(formatRecoveryCode("ABCDE23456")).toBe("ABCDE-23456");
  });
  it("generates a sensible default count", () => {
    expect(RECOVERY_CODE_COUNT).toBeGreaterThanOrEqual(8);
  });
});

describe("canDisableMfa", () => {
  const base = { passwordConfirmed: true, secondFactorProvided: true, isMaster: false, masterConfirmed: false };
  it("allows a normal admin with password + second factor", () => {
    expect(canDisableMfa(base).allowed).toBe(true);
  });
  it("requires password", () => {
    expect(canDisableMfa({ ...base, passwordConfirmed: false }).allowed).toBe(false);
  });
  it("requires a second factor", () => {
    expect(canDisableMfa({ ...base, secondFactorProvided: false }).allowed).toBe(false);
  });
  it("requires extra confirmation for masters", () => {
    expect(canDisableMfa({ ...base, isMaster: true, masterConfirmed: false }).allowed).toBe(false);
    expect(canDisableMfa({ ...base, isMaster: true, masterConfirmed: true }).allowed).toBe(true);
  });
});

describe("canAdminResetMfa", () => {
  it("allows a master resetting another user", () => {
    expect(canAdminResetMfa({ callerIsMaster: true, isSelf: false }).allowed).toBe(true);
  });
  it("blocks non-masters", () => {
    expect(canAdminResetMfa({ callerIsMaster: false, isSelf: false }).allowed).toBe(false);
  });
  it("blocks self-reset via admin flow", () => {
    expect(canAdminResetMfa({ callerIsMaster: true, isSelf: true }).allowed).toBe(false);
  });
});

describe("isSecondFactorPending", () => {
  it("is true when aal1 but aal2 available", () => {
    expect(isSecondFactorPending("aal1", "aal2")).toBe(true);
  });
  it("is false without MFA", () => {
    expect(isSecondFactorPending("aal1", "aal1")).toBe(false);
  });
  it("is false once verified", () => {
    expect(isSecondFactorPending("aal2", "aal2")).toBe(false);
  });
});
