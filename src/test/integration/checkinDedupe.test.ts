import { describe, it, expect } from "vitest";
import { normalizeNome, normalizeCelular } from "@/lib/normalize";

/**
 * Integration-style test mirroring the duplicate-detection rules used by the
 * `checkin-publico` edge function. Ensures the same person is not registered
 * twice in a session via name/phone variants.
 */
describe("Check-in público — deduplicação", () => {
  function isDuplicate(
    existing: { nome: string; celular?: string | null }[],
    incoming: { nome: string; celular?: string | null },
  ): boolean {
    const inCel = normalizeCelular(incoming.celular);
    const inNome = normalizeNome(incoming.nome);
    return existing.some((e) => {
      if (inCel && normalizeCelular(e.celular) === inCel) return true;
      if (!inCel && normalizeNome(e.nome) === inNome) return true;
      return false;
    });
  }

  it("detecta duplicidade por celular independente da máscara", () => {
    const existing = [{ nome: "Maria", celular: "11912345678" }];
    expect(isDuplicate(existing, { nome: "Outra", celular: "(11) 91234-5678" })).toBe(true);
  });

  it("detecta duplicidade por nome quando não há celular", () => {
    const existing = [{ nome: "José da Silva", celular: null }];
    expect(isDuplicate(existing, { nome: "JOSÉ  DA SILVA", celular: null })).toBe(true);
  });

  it("permite participante distinto", () => {
    const existing = [{ nome: "Maria", celular: "11912345678" }];
    expect(isDuplicate(existing, { nome: "Ana", celular: "11999998888" })).toBe(false);
  });
});
