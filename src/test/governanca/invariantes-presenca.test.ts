/**
 * BLOCO: Invariantes de presença (classificação geral × operacional).
 *
 * Garante que a semântica operacional de cada `status_presenca` venha de UMA
 * fonte (espelho `presencaClassificacao.ts`, contraparte de
 * `fn_presenca_classificacao`), e que `justificado` seja apenas histórico.
 *
 * Invariantes protegidas:
 *  - INV-PRES-001 — classificação geral é separada da operacional
 *  - INV-PRES-002 — fonte única; justificado é só histórico (não conta falta)
 */
import { describe, it, expect } from "vitest";
import {
  classificarPresenca,
  contaComoPresenca,
  contaComoAusencia,
  ehSomenteHistorico,
} from "@/lib/presencaClassificacao";

describe("INV-PRES-002 — presente avança o tratamento e notifica presença", () => {
  it("presente conta presença, avança sessão e notifica", () => {
    const c = classificarPresenca("presente");
    expect(c.contaPresenca).toBe(true);
    expect(c.avancaSessao).toBe(true);
    expect(c.disparaRemarcacao).toBe(false);
    expect(c.eventoNotificacao).toBe("presenca_registrada");
  });
});

describe("INV-PRES-002 — ausente conta falta, dispara remarcação e notifica falta", () => {
  it("ausente conta ausência e dispara remarcação", () => {
    const c = classificarPresenca("ausente");
    expect(c.contaAusencia).toBe(true);
    expect(c.contaPresenca).toBe(false);
    expect(c.disparaRemarcacao).toBe(true);
    expect(c.eventoNotificacao).toBe("falta_registrada");
  });
});

describe("INV-PRES-001/002 — justificado é SOMENTE histórico", () => {
  it("justificado não conta presença nem ausência, não remarca, não notifica", () => {
    const c = classificarPresenca("justificado");
    expect(c.contaPresenca).toBe(false);
    expect(c.contaAusencia).toBe(false);
    expect(c.disparaRemarcacao).toBe(false);
    expect(c.avancaSessao).toBe(false);
    expect(c.somenteHistorico).toBe(true);
    expect(c.eventoNotificacao).toBeNull();
  });

  it("atalhos refletem a mesma semântica", () => {
    expect(contaComoAusencia("justificado")).toBe(false);
    expect(contaComoPresenca("justificado")).toBe(false);
    expect(ehSomenteHistorico("justificado")).toBe(true);
  });
});

describe("INV-PRES-002 — status desconhecido cai em fallback seguro (só histórico)", () => {
  it("fallback não dispara efeito operacional", () => {
    const c = classificarPresenca("status_inexistente");
    expect(c.somenteHistorico).toBe(true);
    expect(c.contaPresenca).toBe(false);
    expect(c.contaAusencia).toBe(false);
    expect(c.eventoNotificacao).toBeNull();
  });
});
