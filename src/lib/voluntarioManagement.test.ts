import { describe, it, expect } from "vitest";
import {
  isDeleteConfirmed,
  evaluateVoluntarioDeletion,
  isVoluntarioAtivo,
} from "./voluntarioManagement";

describe("voluntarioManagement", () => {
  describe("isDeleteConfirmed", () => {
    it("accepts the exact confirm word ignoring case/space", () => {
      expect(isDeleteConfirmed("EXCLUIR")).toBe(true);
      expect(isDeleteConfirmed("  excluir  ")).toBe(true);
    });
    it("rejects anything else", () => {
      expect(isDeleteConfirmed("exclui")).toBe(false);
      expect(isDeleteConfirmed("")).toBe(false);
    });
  });

  describe("evaluateVoluntarioDeletion", () => {
    it("allows deletion when there are no relevant links", () => {
      const d = evaluateVoluntarioDeletion({ funcoesCount: 0, hasTermo: false });
      expect(d.canDelete).toBe(true);
      expect(d.blockers).toHaveLength(0);
    });
    it("blocks deletion when the volunteer has função links", () => {
      const d = evaluateVoluntarioDeletion({ funcoesCount: 2, hasTermo: false });
      expect(d.canDelete).toBe(false);
      expect(d.blockers).toContain("vínculos com funções/atuações");
    });
    it("blocks deletion when the volunteer has a signed term", () => {
      const d = evaluateVoluntarioDeletion({ funcoesCount: 0, hasTermo: true });
      expect(d.canDelete).toBe(false);
      expect(d.blockers).toContain("termo de adesão assinado");
    });
    it("lists all blockers when several apply", () => {
      const d = evaluateVoluntarioDeletion({ funcoesCount: 1, hasTermo: true });
      expect(d.canDelete).toBe(false);
      expect(d.blockers).toHaveLength(2);
    });
  });

  describe("isVoluntarioAtivo", () => {
    it("only 'ativo' counts as active", () => {
      expect(isVoluntarioAtivo("ativo")).toBe(true);
      expect(isVoluntarioAtivo("inativo")).toBe(false);
      expect(isVoluntarioAtivo("afastado")).toBe(false);
    });
  });
});
