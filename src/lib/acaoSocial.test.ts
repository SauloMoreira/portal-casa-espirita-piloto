import { describe, it, expect } from "vitest";
import {
  alimentosVisiveis,
  alimentosAdmin,
  formatFaltante,
  validarAlimento,
  formatPrazoData,
  prazoEntregaInfo,
  mensagemInstitucional,
  type AlimentoAcaoSocial,
  type AcaoSocialConfig,
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

describe("formatPrazoData", () => {
  it("formata data ISO para dd/mm/yyyy", () => {
    expect(formatPrazoData("2026-06-25")).toBe("25/06/2026");
  });
  it("ignora a parte de tempo", () => {
    expect(formatPrazoData("2026-06-25T00:00:00Z")).toBe("25/06/2026");
  });
  it("retorna null para vazio ou inválido", () => {
    expect(formatPrazoData(null)).toBeNull();
    expect(formatPrazoData("")).toBeNull();
    expect(formatPrazoData("abc")).toBeNull();
  });
});

const makeConfig = (over: Partial<AcaoSocialConfig>): AcaoSocialConfig =>
  ({
    id: "cfg",
    prazo_final_entrega: over.prazo_final_entrega ?? null,
    observacao_prazo: over.observacao_prazo ?? null,
    exibir_prazo: over.exibir_prazo ?? true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
  }) as AcaoSocialConfig;

describe("prazoEntregaInfo", () => {
  it("retorna texto formatado quando há prazo e exibição ativa", () => {
    const info = prazoEntregaInfo(makeConfig({ prazo_final_entrega: "2026-06-25" }));
    expect(info?.texto).toBe("Recebimento de doações até 25/06/2026");
    expect(info?.observacao).toBeNull();
  });
  it("inclui observação quando presente", () => {
    const info = prazoEntregaInfo(
      makeConfig({ prazo_final_entrega: "2026-06-25", observacao_prazo: "Na secretaria" }),
    );
    expect(info?.observacao).toBe("Na secretaria");
  });
  it("retorna null quando exibir_prazo é false", () => {
    expect(prazoEntregaInfo(makeConfig({ prazo_final_entrega: "2026-06-25", exibir_prazo: false }))).toBeNull();
  });
  it("retorna null quando não há prazo", () => {
    expect(prazoEntregaInfo(makeConfig({ prazo_final_entrega: null }))).toBeNull();
  });
  it("retorna null para config ausente", () => {
    expect(prazoEntregaInfo(null)).toBeNull();
  });
});
