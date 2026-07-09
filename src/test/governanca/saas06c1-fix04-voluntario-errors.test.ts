/**
 * SAAS-06-C1-FIX04 — tradução amigável de erros do cadastro de voluntário.
 * Nunca deve expor erro técnico de RLS/Postgres ao usuário final.
 */
import { describe, expect, it } from "vitest";
import { friendlyVoluntarioError } from "@/lib/voluntarioErrors";

describe("friendlyVoluntarioError", () => {
  it("traduz erro de RLS (code 42501) para mensagem de permissão", () => {
    const err = { code: "42501", message: 'new row violates row-level security policy for table "voluntarios"' };
    expect(friendlyVoluntarioError(err)).toBe(
      "Você não possui permissão para cadastrar voluntários nesta instituição.",
    );
  });

  it("traduz mensagem 'row-level security' sem code para permissão", () => {
    const err = new Error("new row violates row-level security policy for table voluntarios");
    expect(friendlyVoluntarioError(err)).toMatch(/permissão/i);
  });

  it("traduz fail-closed de tenant (SAAS-05-D) para orientação de instituição", () => {
    const err = new Error("[SAAS-05-D] Nenhuma instituição ativa selecionada. Operação bloqueada (fail-closed).");
    expect(friendlyVoluntarioError(err)).toBe(
      "Não foi possível identificar a instituição atual. Selecione uma instituição e tente novamente.",
    );
  });

  it("traduz violação de unicidade para mensagem de duplicidade amigável", () => {
    const err = { code: "23505", message: "duplicate key value violates unique constraint" };
    expect(friendlyVoluntarioError(err)).toMatch(/já existe/i);
  });

  it("cai no fallback genérico para erros desconhecidos", () => {
    expect(friendlyVoluntarioError(new Error("boom xyz"))).toBe(
      "Não foi possível salvar o voluntário no momento. Tente novamente ou fale com o suporte.",
    );
  });

  it("nunca vaza a mensagem crua de RLS para o usuário final", () => {
    const raw = 'new row violates row-level security policy for table "voluntarios"';
    const err = { code: "42501", message: raw };
    expect(friendlyVoluntarioError(err)).not.toContain("row-level security");
    expect(friendlyVoluntarioError(err)).not.toContain("voluntarios");
  });
});
