import { describe, it, expect } from "vitest";
import {
  MARKDOWN_ALLOWED_ELEMENTS,
  MENSAGEM_INSTITUCIONAL_MAX,
  safeUrlTransform,
  limparMensagemInstitucional,
  temMensagemInstitucional,
} from "./markdownInstitucional";

describe("markdownInstitucional", () => {
  describe("whitelist", () => {
    it("permite apenas elementos leves", () => {
      expect([...MARKDOWN_ALLOWED_ELEMENTS]).toEqual([
        "p", "strong", "em", "ul", "ol", "li", "h4", "a", "br",
      ]);
    });
    it("não permite img, table, iframe, script", () => {
      for (const proibido of ["img", "table", "iframe", "script", "h1", "code", "blockquote"]) {
        expect(MARKDOWN_ALLOWED_ELEMENTS).not.toContain(proibido);
      }
    });
  });

  describe("safeUrlTransform", () => {
    it("aceita http, https e mailto", () => {
      expect(safeUrlTransform("https://fermarica.com.br")).toBe("https://fermarica.com.br");
      expect(safeUrlTransform("http://x.com")).toBe("http://x.com");
      expect(safeUrlTransform("mailto:a@b.com")).toBe("mailto:a@b.com");
    });
    it("bloqueia javascript:, data: e relativos", () => {
      expect(safeUrlTransform("javascript:alert(1)")).toBe("");
      expect(safeUrlTransform("data:text/html,<script>")).toBe("");
      expect(safeUrlTransform("/admin")).toBe("");
      expect(safeUrlTransform("")).toBe("");
    });
  });

  describe("limparMensagemInstitucional", () => {
    it("aplica trim e retorna null quando vazio", () => {
      expect(limparMensagemInstitucional("  \n ")).toBeNull();
      expect(limparMensagemInstitucional(null)).toBeNull();
      expect(limparMensagemInstitucional("**Olá**")).toBe("**Olá**");
    });
    it("remove caracteres de controle perigosos", () => {
      expect(limparMensagemInstitucional("a\u0000b\u001Fc")).toBe("abc");
    });
    it("preserva quebras de linha e tab", () => {
      expect(limparMensagemInstitucional("a\nb\tc")).toBe("a\nb\tc");
    });
    it("respeita o limite máximo", () => {
      const longo = "x".repeat(MENSAGEM_INSTITUCIONAL_MAX + 500);
      expect(limparMensagemInstitucional(longo)?.length).toBe(MENSAGEM_INSTITUCIONAL_MAX);
    });
  });

  describe("temMensagemInstitucional", () => {
    it("reflete presença de conteúdo", () => {
      expect(temMensagemInstitucional("texto")).toBe(true);
      expect(temMensagemInstitucional("   ")).toBe(false);
      expect(temMensagemInstitucional(undefined)).toBe(false);
    });
  });
});
