import { describe, it, expect } from "vitest";
import {
  alimentosVisiveis,
  alimentosAdmin,
  formatFaltante,
  validarAlimento,
  type AlimentoAcaoSocial,
} from "./acaoSocial";

const make = (over: Partial<AlimentoAcaoSocial>): AlimentoAcaoSocial =>
  ({
    id: over.id ?? crypto.randomUUID(),
    nome: over.nome ?? "Arroz",
    unidade: over.unidade ?? null,
    quantidade_necessaria: over.quantidade_necessaria ?? null,
    quantidade_faltante: over.quantidade_faltante ?? null,
    observacao: over.observacao ?? null,
    ordem: over.ordem ?? 0,
    ativo: over.ativo ?? true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    created_by: null,
    updated_by: null,
  }) as AlimentoAcaoSocial;

describe("alimentosVisiveis", () => {
  it("oculta itens inativos", () => {
    const out = alimentosVisiveis([make({ nome: "A", ativo: false }), make({ nome: "B" })]);
    expect(out.map((i) => i.nome)).toEqual(["B"]);
  });

  it("respeita a ordem/prioridade definida", () => {
    const out = alimentosVisiveis([
      make({ nome: "Feijão", ordem: 2 }),
      make({ nome: "Arroz", ordem: 1 }),
    ]);
    expect(out.map((i) => i.nome)).toEqual(["Arroz", "Feijão"]);
  });

  it("desempata por nome quando a ordem é igual", () => {
    const out = alimentosVisiveis([
      make({ nome: "Óleo", ordem: 1 }),
      make({ nome: "Açúcar", ordem: 1 }),
    ]);
    expect(out.map((i) => i.nome)).toEqual(["Açúcar", "Óleo"]);
  });
});

describe("alimentosAdmin", () => {
  it("lista ativos antes dos inativos", () => {
    const out = alimentosAdmin([make({ nome: "Inativo", ativo: false }), make({ nome: "Ativo" })]);
    expect(out.map((i) => i.nome)).toEqual(["Ativo", "Inativo"]);
  });
});

describe("formatFaltante", () => {
  it("exibe quantidade com unidade", () => {
    expect(formatFaltante({ quantidade_faltante: 5, unidade: "kg" })).toBe("5 kg");
  });
  it("exibe somente quantidade quando sem unidade", () => {
    expect(formatFaltante({ quantidade_faltante: 3, unidade: null })).toBe("3");
  });
  it("usa traço quando não há quantidade", () => {
    expect(formatFaltante({ quantidade_faltante: null, unidade: "kg" })).toBe("—");
  });
});

describe("validarAlimento", () => {
  it("rejeita nome vazio", () => {
    expect(validarAlimento({ nome: "" })).not.toBeNull();
  });
  it("aceita nome válido", () => {
    expect(validarAlimento({ nome: "Arroz" })).toBeNull();
  });
});
