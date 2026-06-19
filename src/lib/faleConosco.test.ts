import { describe, it, expect } from "vitest";
import {
  normalizarTelefoneWhatsapp,
  montarLinkWhatsapp,
  montarSaudacaoFaleConosco,
  saudacaoPorHorario,
  primeiroNomeSeguro,
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

describe("saudacaoPorHorario", () => {
  it("retorna a saudação correta por período", () => {
    expect(saudacaoPorHorario(8)).toBe("Bom dia");
    expect(saudacaoPorHorario(14)).toBe("Boa tarde");
    expect(saudacaoPorHorario(21)).toBe("Boa noite");
    expect(saudacaoPorHorario(2)).toBe("Boa noite");
  });
});

describe("primeiroNomeSeguro", () => {
  it("extrai e capitaliza o primeiro nome", () => {
    expect(primeiroNomeSeguro("lucas silva")).toBe("Lucas");
    expect(primeiroNomeSeguro("  Maria  Souza ")).toBe("Maria");
  });

  it("retorna null quando não há nome confiável", () => {
    expect(primeiroNomeSeguro(null)).toBeNull();
    expect(primeiroNomeSeguro("")).toBeNull();
    expect(primeiroNomeSeguro("a")).toBeNull();
    expect(primeiroNomeSeguro("user@mail.com")).toBeNull();
  });
});

describe("montarSaudacaoFaleConosco", () => {
  it("usa nome e saudação contextual quando disponível", () => {
    const msg = montarSaudacaoFaleConosco({ nomeCompleto: "Lucas Silva", hora: 14 });
    expect(msg).toContain("Boa tarde, Lucas.");
    expect(msg).toContain("Daniel, assistente virtual da FER");
    expect(msg).toContain("horário comercial");
  });

  it("usa fallback neutro sem nome confiável", () => {
    const msg = montarSaudacaoFaleConosco({ nomeCompleto: null, hora: 9 });
    expect(msg.startsWith("Bom dia. Sou o Daniel")).toBe(true);
    expect(msg).not.toContain(", .");
  });
});
