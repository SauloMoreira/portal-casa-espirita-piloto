import { describe, it, expect } from "vitest";
import {
  computeRequiredApprovals,
  isExceptionFlow,
  canApprove,
  resolveStatusAfterApproval,
  isPromotionOpen,
  type ApprovalContext,
} from "./adminPromotion";

const base: ApprovalContext = {
  approverId: "approver-1",
  requestedBy: "requester-1",
  targetUserId: "target-1",
  requiredApprovals: 2,
  approverIsActiveAdmin: true,
  approverIsActiveMaster: true,
  alreadyDecidedBy: [],
  status: "pendente",
  aptAdmins: 2,
};

describe("computeRequiredApprovals", () => {
  it("requires 2 approvals when 2+ masters", () => {
    expect(computeRequiredApprovals(2)).toBe(2);
    expect(computeRequiredApprovals(5)).toBe(2);
  });
  it("requires 1 approval with a single master (exception)", () => {
    expect(computeRequiredApprovals(1)).toBe(1);
    expect(computeRequiredApprovals(0)).toBe(1);
  });
});

describe("isExceptionFlow", () => {
  it("is exceptional only when there is at most one master", () => {
    expect(isExceptionFlow(1)).toBe(true);
    expect(isExceptionFlow(0)).toBe(true);
    expect(isExceptionFlow(2)).toBe(false);
  });
});

describe("canApprove", () => {
  it("allows a valid distinct approver", () => {
    expect(canApprove(base).allowed).toBe(true);
  });

  it("blocks self-approval by the requester", () => {
    const r = canApprove({ ...base, approverId: "requester-1" });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/solicitante/i);
  });

  it("blocks self-approval by the target", () => {
    const r = canApprove({ ...base, approverId: "target-1" });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/indicado/i);
  });

  it("blocks double approval by the same person", () => {
    const r = canApprove({ ...base, alreadyDecidedBy: ["approver-1"] });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/já registrou/i);
  });

  it("blocks non-admins", () => {
    const r = canApprove({ ...base, approverIsActiveAdmin: false });
    expect(r.allowed).toBe(false);
  });

  it("blocks finalized requests", () => {
    expect(canApprove({ ...base, status: "aprovado" }).allowed).toBe(false);
    expect(canApprove({ ...base, status: "rejeitado" }).allowed).toBe(false);
  });

  it("exception flow: only an active master can give the single approval", () => {
    const nonMaster = canApprove({
      ...base,
      requiredApprovals: 1,
      approverIsActiveMaster: false,
    });
    expect(nonMaster.allowed).toBe(false);
    expect(nonMaster.reason).toMatch(/master/i);

    const master = canApprove({ ...base, requiredApprovals: 1, approverIsActiveMaster: true });
    expect(master.allowed).toBe(true);
  });
});

describe("resolveStatusAfterApproval", () => {
  it("partial approval until threshold reached", () => {
    expect(resolveStatusAfterApproval(1, 2)).toBe("aprovado_parcialmente");
    expect(resolveStatusAfterApproval(2, 2)).toBe("aprovado");
    expect(resolveStatusAfterApproval(1, 1)).toBe("aprovado");
  });
});

describe("isPromotionOpen", () => {
  it("open while pending or partial", () => {
    expect(isPromotionOpen("pendente")).toBe(true);
    expect(isPromotionOpen("aprovado_parcialmente")).toBe(true);
    expect(isPromotionOpen("aprovado")).toBe(false);
    expect(isPromotionOpen("rejeitado")).toBe(false);
  });
});
