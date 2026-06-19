import { describe, it, expect } from "vitest";
import {
  validarUploadImagem,
  montarPromptGeracao,
  montarPromptOtimizacao,
  podeGerarComIa,
  origemLabel,
  formatoSize,
  formatoAspect,
  formatoAspectClass,
  normalizarFormato,
  formatoLabel,
  resolverOrigem,
  formatarAtualizacao,
  UPLOAD_TAMANHO_MAX,
} from "./conteudoImagem";

describe("validarUploadImagem", () => {
  it("aceita JPG/PNG/WEBP dentro do tamanho", () => {
    expect(validarUploadImagem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validarUploadImagem({ type: "image/png", size: 1000 })).toBeNull();
    expect(validarUploadImagem({ type: "image/webp", size: 1000 })).toBeNull();
  });

  it("rejeita tipo não permitido", () => {
    expect(validarUploadImagem({ type: "image/gif", size: 1000 })).toMatch(/Formato inválido/);
    expect(validarUploadImagem({ type: "application/pdf", size: 1000 })).toMatch(/Formato inválido/);
  });

  it("rejeita arquivo grande demais", () => {
    expect(validarUploadImagem({ type: "image/png", size: UPLOAD_TAMANHO_MAX + 1 })).toMatch(/muito grande/);
  });

  it("rejeita arquivo vazio", () => {
    expect(validarUploadImagem({ type: "image/png", size: 0 })).toMatch(/inválido/);
  });
});

describe("montarPromptGeracao", () => {
  it("usa os dados de campanha", () => {
    const p = montarPromptGeracao("campanha", {
      titulo: "Cesta Básica",
      subtitulo: "Ajude famílias",
      descricao_curta: "Doe alimentos",
    });
    expect(p).toContain("campanha institucional");
    expect(p).toContain("Cesta Básica");
    expect(p).toContain("Ajude famílias");
    expect(p).toContain("Doe alimentos");
    expect(p).toContain("Sem texto sobreposto");
  });

  it("usa os dados de evento incluindo local", () => {
    const p = montarPromptGeracao("evento", { titulo: "Palestra", local: "Salão Principal" }, "banner_horizontal");
    expect(p).toContain("evento");
    expect(p).toContain("Palestra");
    expect(p).toContain("Salão Principal");
    expect(p.toLowerCase()).toContain("banner horizontal");
  });

  it("não inclui local quando ausente", () => {
    const p = montarPromptGeracao("campanha", { titulo: "X", local: "Y" });
    expect(p).not.toContain("Local:");
  });
});

describe("podeGerarComIa", () => {
  it("exige título mínimo", () => {
    expect(podeGerarComIa({ titulo: "Ab" })).toBe(true);
    expect(podeGerarComIa({ titulo: "A" })).toBe(false);
    expect(podeGerarComIa({})).toBe(false);
  });
});

describe("montarPromptOtimizacao", () => {
  it("inclui o objetivo do formato", () => {
    expect(montarPromptOtimizacao("destaque").toLowerCase()).toContain("destaque da home");
    expect(montarPromptOtimizacao("card")).toContain("Melhore iluminação");
  });
});

describe("origemLabel / formatoSize / resolverOrigem", () => {
  it("rotula origens", () => {
    expect(origemLabel("ai")).toMatch(/IA/);
    expect(origemLabel("upload")).toMatch(/arquivo/);
    expect(origemLabel("url")).toMatch(/URL/);
    expect(origemLabel(null)).toMatch(/Sem origem/);
  });
  it("retorna dimensão por formato", () => {
    expect(formatoSize("card")).toBe("1024x1024");
    expect(formatoSize("banner_horizontal")).toBe("1536x1024");
  });
  it("resolve origem informada", () => {
    expect(resolverOrigem("ai")).toBe("ai");
    expect(resolverOrigem("upload")).toBe("upload");
  });
});

describe("formato alvo — proporções e normalização", () => {
  it("cada formato tem proporção distinta e coerente", () => {
    expect(formatoAspect("card")).toBe(1);
    expect(formatoAspect("banner_horizontal")).toBeCloseTo(1.5);
    expect(formatoAspect("banner_vertical")).toBeCloseTo(2 / 3);
    expect(formatoAspect("destaque")).toBeCloseTo(16 / 9);
    // horizontal, vertical e destaque devem diferir entre si (não é só "card esticado")
    const horiz = formatoAspect("banner_horizontal");
    const vert = formatoAspect("banner_vertical");
    const dest = formatoAspect("destaque");
    expect(horiz).not.toBeCloseTo(vert);
    expect(horiz).not.toBeCloseTo(dest);
    expect(vert).toBeLessThan(1);
    expect(horiz).toBeGreaterThan(1);
    expect(dest).toBeGreaterThan(horiz);
  });

  it("destaque tem tamanho widescreen próprio", () => {
    expect(formatoSize("destaque")).toBe("1600x900");
  });

  it("classe de aspecto reflete o formato", () => {
    expect(formatoAspectClass("card")).toBe("aspect-square");
    expect(formatoAspectClass("banner_horizontal")).toBe("aspect-[3/2]");
    expect(formatoAspectClass("banner_vertical")).toBe("aspect-[2/3]");
    expect(formatoAspectClass("destaque")).toBe("aspect-video");
  });

  it("normaliza valores inválidos/nulos para card", () => {
    expect(normalizarFormato(null)).toBe("card");
    expect(normalizarFormato(undefined)).toBe("card");
    expect(normalizarFormato("inexistente")).toBe("card");
    expect(normalizarFormato("destaque")).toBe("destaque");
  });

  it("formatoLabel devolve rótulo legível e seguro", () => {
    expect(formatoLabel("banner_vertical")).toMatch(/vertical/i);
    expect(formatoLabel(null)).toMatch(/card/i);
  });
});

describe("formatarAtualizacao", () => {
  it("retorna vazio para nulo/ inválido", () => {
    expect(formatarAtualizacao(null)).toBe("");
    expect(formatarAtualizacao("xx")).toBe("");
  });
  it("formata data válida", () => {
    expect(formatarAtualizacao("2026-01-15T10:30:00Z")).toMatch(/2026/);
  });
});
