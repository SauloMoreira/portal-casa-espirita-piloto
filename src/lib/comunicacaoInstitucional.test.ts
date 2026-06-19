import { describe, it, expect } from "vitest";
import {
  normalizarTipo,
  normalizarStatus,
  podeTransicionar,
  validarComunicacao,
  prontaParaEnvio,
  MENSAGEM_MAX,
} from "./comunicacaoInstitucional";

describe("normalizarTipo", () => {
  it("mantém tipos conhecidos", () => {
    expect(normalizarTipo("campanha")).toBe("campanha");
    expect(normalizarTipo("evento")).toBe("evento");
  });
  it("default comunicado", () => {
    expect(normalizarTipo("xpto")).toBe("comunicado");
    expect(normalizarTipo(null)).toBe("comunicado");
  });
});

describe("normalizarStatus", () => {
  it("default rascunho", () => {
    expect(normalizarStatus(null)).toBe("rascunho");
    expect(normalizarStatus("aprovada")).toBe("aprovada");
  });
});

describe("podeTransicionar", () => {
  it("permite fluxo padrão", () => {
    expect(podeTransicionar("rascunho", "em_revisao")).toBe(true);
    expect(podeTransicionar("em_revisao", "aprovada")).toBe(true);
    expect(podeTransicionar("aprovada", "arquivada")).toBe(true);
  });
  it("bloqueia saltos inválidos", () => {
    expect(podeTransicionar("rascunho", "aprovada")).toBe(false);
    expect(podeTransicionar("arquivada", "aprovada")).toBe(false);
  });
});

describe("validarComunicacao", () => {
  it("rejeita título curto", () => {
    expect(validarComunicacao({ titulo: "oi", mensagem: "mensagem suficiente aqui" })).not.toBeNull();
  });
  it("rejeita mensagem curta", () => {
    expect(validarComunicacao({ titulo: "Título ok", mensagem: "curta" })).not.toBeNull();
  });
  it("rejeita mensagem longa", () => {
    expect(validarComunicacao({ titulo: "Título ok", mensagem: "a".repeat(MENSAGEM_MAX + 1) })).not.toBeNull();
  });
  it("aceita conteúdo válido", () => {
    expect(validarComunicacao({ titulo: "Festa Junina", mensagem: "Convidamos todos para a festa." })).toBeNull();
  });
});

describe("prontaParaEnvio", () => {
  it("exige aprovada e público > 0", () => {
    expect(prontaParaEnvio({ status: "aprovada", publico_estimado: 10 })).toBe(true);
    expect(prontaParaEnvio({ status: "aprovada", publico_estimado: 0 })).toBe(false);
    expect(prontaParaEnvio({ status: "rascunho", publico_estimado: 10 })).toBe(false);
  });
});
