import { describe, it, expect } from "vitest";
import {
  normalizarTelefoneWhatsapp,
  montarLinkWhatsapp,
  FALE_CONOSCO_MENSAGEM_PADRAO,
} from "./faleConosco";

describe("normalizarTelefoneWhatsapp", () => {
  it("retorna null para entrada vazia ou inválida", () => {
    expect(normalizarTelefoneWhatsapp(null)).toBeNull();
    expect(normalizarTelefoneWhatsapp("")).toBeNull();
    expect(normalizarTelefoneWhatsapp("123")).toBeNull();
  });

  it("prefixa o DDI 55 em número local com DDD", () => {
    expect(normalizarTelefoneWhatsapp("(11) 99999-8888")).toBe("5511999998888");
    expect(normalizarTelefoneWhatsapp("11 3333-4444")).toBe("551133334444");
  });

  it("mantém número que já tem DDI", () => {
    expect(normalizarTelefoneWhatsapp("+55 (11) 99999-8888")).toBe("5511999998888");
    expect(normalizarTelefoneWhatsapp("005511999998888")).toBe("5511999998888");
  });
});

describe("montarLinkWhatsapp", () => {
  it("retorna null sem telefone usável", () => {
    expect(montarLinkWhatsapp({ telefone: null })).toBeNull();
    expect(montarLinkWhatsapp({ telefone: "x" })).toBeNull();
  });

  it("monta link com a mensagem padrão de origem app", () => {
    const link = montarLinkWhatsapp({ telefone: "(11) 99999-8888" });
    expect(link).toContain("https://wa.me/5511999998888");
    expect(link).toContain(encodeURIComponent(FALE_CONOSCO_MENSAGEM_PADRAO));
  });

  it("respeita mensagem customizada", () => {
    const link = montarLinkWhatsapp({ telefone: "11999998888", mensagem: "Oi" });
    expect(link).toBe("https://wa.me/5511999998888?text=Oi");
  });
});

describe("FALE_CONOSCO_MENSAGEM_PADRAO", () => {
  it("é uma saudação curta e neutra (sem texto longo do assistido)", () => {
    expect(FALE_CONOSCO_MENSAGEM_PADRAO.length).toBeLessThan(80);
    expect(FALE_CONOSCO_MENSAGEM_PADRAO.toLowerCase()).toContain("olá");
  });

  it("não dispara intenções que desviem da saudação (sem 'app'/'dúvida')", () => {
    const txt = FALE_CONOSCO_MENSAGEM_PADRAO.toLowerCase();
    expect(txt).not.toContain("app");
    expect(txt).not.toContain("dúvida");
    expect(txt).not.toContain("duvida");
  });
});
