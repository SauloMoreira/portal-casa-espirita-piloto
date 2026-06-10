import { describe, it, expect } from "vitest";
import { normalizeNome, normalizeCelular } from "./normalize";

describe("normalizeNome", () => {
  it("strips accents, lowercases and collapses spaces", () => {
    expect(normalizeNome("  José   da  Silva ")).toBe("jose da silva");
    expect(normalizeNome("MARIA ÁVILA")).toBe("maria avila");
  });
  it("returns null for empty/blank input", () => {
    expect(normalizeNome("")).toBeNull();
    expect(normalizeNome("   ")).toBeNull();
    expect(normalizeNome(null)).toBeNull();
  });
  it("treats accented/cased variants as duplicates", () => {
    expect(normalizeNome("João Pereira")).toBe(normalizeNome("joao  pereira"));
  });
});

describe("normalizeCelular", () => {
  it("keeps digits only", () => {
    expect(normalizeCelular("(11) 91234-5678")).toBe("11912345678");
  });
  it("returns null when no digits", () => {
    expect(normalizeCelular("abc")).toBeNull();
    expect(normalizeCelular(null)).toBeNull();
  });
});
