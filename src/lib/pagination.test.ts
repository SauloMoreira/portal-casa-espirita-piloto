import { describe, it, expect } from "vitest";
import { getPageCount, clampPage, getRange, getRangeLabel, DEFAULT_PAGE_SIZE } from "./pagination";

describe("pagination", () => {
  describe("getPageCount", () => {
    it("arredonda para cima", () => {
      expect(getPageCount(0, 25)).toBe(1);
      expect(getPageCount(1, 25)).toBe(1);
      expect(getPageCount(25, 25)).toBe(1);
      expect(getPageCount(26, 25)).toBe(2);
      expect(getPageCount(100, 25)).toBe(4);
      expect(getPageCount(101, 25)).toBe(5);
    });
    it("nunca retorna menos de 1", () => {
      expect(getPageCount(-5, 25)).toBe(1);
      expect(getPageCount(10, 0)).toBe(1);
    });
  });

  describe("clampPage", () => {
    it("mantém dentro do intervalo válido", () => {
      expect(clampPage(0, 100, 25)).toBe(1);
      expect(clampPage(3, 100, 25)).toBe(3);
      expect(clampPage(99, 100, 25)).toBe(4); // só 4 páginas
      expect(clampPage(-1, 100, 25)).toBe(1);
    });
  });

  describe("getRange", () => {
    it("calcula from/to base 0 inclusivo", () => {
      expect(getRange(1, 25)).toEqual({ from: 0, to: 24 });
      expect(getRange(2, 25)).toEqual({ from: 25, to: 49 });
      expect(getRange(3, 10)).toEqual({ from: 20, to: 29 });
    });
    it("trata página inválida como 1", () => {
      expect(getRange(0, 25)).toEqual({ from: 0, to: 24 });
      expect(getRange(-3, 25)).toEqual({ from: 0, to: 24 });
    });
    it("usa tamanho padrão quando inválido", () => {
      expect(getRange(1, 0)).toEqual({ from: 0, to: DEFAULT_PAGE_SIZE - 1 });
    });
  });

  describe("getRangeLabel", () => {
    it("descreve o intervalo exibido", () => {
      expect(getRangeLabel(1, 25, 100)).toBe("1–25 de 100");
      expect(getRangeLabel(4, 25, 90)).toBe("76–90 de 90");
      expect(getRangeLabel(1, 25, 0)).toBe("0 de 0");
    });
  });
});
