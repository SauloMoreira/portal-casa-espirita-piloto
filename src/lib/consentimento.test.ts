import { describe, it, expect } from "vitest";
import {
  VERSAO_TERMO_CONSENTIMENTO,
  normalizarStatus,
  consentimentoAtivo,
  precisaRenovarConsentimento,
  rotuloStatus,
  snapshotDaAcao,
  type ConsentimentoSnapshot,
} from "./consentimento";

const snap = (over: Partial<ConsentimentoSnapshot>): ConsentimentoSnapshot => ({
  consentimento_status: over.consentimento_status ?? null,
  consentimento_at: over.consentimento_at ?? null,
  consentimento_versao: over.consentimento_versao ?? null,
});

describe("normalizarStatus", () => {
  it("mantém valores conhecidos", () => {
    expect(normalizarStatus("concedido")).toBe("concedido");
    expect(normalizarStatus("revogado")).toBe("revogado");
  });
  it("default para pendente", () => {
    expect(normalizarStatus(null)).toBe("pendente");
    expect(normalizarStatus("qualquer")).toBe("pendente");
  });
});

describe("consentimentoAtivo", () => {
  it("falso quando nulo", () => {
    expect(consentimentoAtivo(null)).toBe(false);
  });
  it("falso quando pendente ou revogado", () => {
    expect(consentimentoAtivo(snap({ consentimento_status: "pendente" }))).toBe(false);
    expect(consentimentoAtivo(snap({ consentimento_status: "revogado", consentimento_versao: VERSAO_TERMO_CONSENTIMENTO }))).toBe(false);
  });
  it("verdadeiro quando concedido na versão vigente", () => {
    expect(consentimentoAtivo(snap({ consentimento_status: "concedido", consentimento_versao: VERSAO_TERMO_CONSENTIMENTO }))).toBe(true);
  });
  it("falso quando concedido em versão antiga", () => {
    expect(consentimentoAtivo(snap({ consentimento_status: "concedido", consentimento_versao: "0.9" }))).toBe(false);
  });
});

describe("precisaRenovarConsentimento", () => {
  it("verdadeiro quando inativo", () => {
    expect(precisaRenovarConsentimento(null)).toBe(true);
    expect(precisaRenovarConsentimento(snap({ consentimento_status: "concedido", consentimento_versao: "0.9" }))).toBe(true);
  });
  it("falso quando ativo e vigente", () => {
    expect(precisaRenovarConsentimento(snap({ consentimento_status: "concedido", consentimento_versao: VERSAO_TERMO_CONSENTIMENTO }))).toBe(false);
  });
});

describe("rotuloStatus", () => {
  it("rotula cada estado", () => {
    expect(rotuloStatus("concedido")).toMatch(/concedido/i);
    expect(rotuloStatus("revogado")).toMatch(/revogado/i);
    expect(rotuloStatus(null)).toMatch(/pendente/i);
  });
});

describe("snapshotDaAcao", () => {
  const agora = new Date("2026-06-19T12:00:00Z");
  it("gera snapshot de concessão", () => {
    const s = snapshotDaAcao("concedido", VERSAO_TERMO_CONSENTIMENTO, agora);
    expect(s.consentimento_status).toBe("concedido");
    expect(s.consentimento_versao).toBe(VERSAO_TERMO_CONSENTIMENTO);
    expect(s.consentimento_at).toBe(agora.toISOString());
  });
  it("gera snapshot de revogação", () => {
    const s = snapshotDaAcao("revogado", VERSAO_TERMO_CONSENTIMENTO, agora);
    expect(s.consentimento_status).toBe("revogado");
  });
});
