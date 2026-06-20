import { describe, it, expect } from "vitest";
import { traduzirErroAuth } from "./authErrors";

describe("traduzirErroAuth", () => {
  it("traduz credenciais inválidas", () => {
    expect(traduzirErroAuth("Invalid login credentials")).toBe("E-mail ou senha incorretos.");
  });

  it("traduz e-mail não confirmado", () => {
    expect(traduzirErroAuth("Email not confirmed")).toBe("E-mail ainda não confirmado.");
  });

  it("traduz usuário não encontrado", () => {
    expect(traduzirErroAuth("User not found")).toBe("Usuário não encontrado.");
  });

  it("traduz rate limit", () => {
    expect(traduzirErroAuth("Email rate limit exceeded")).toBe(
      "Muitas tentativas. Aguarde alguns instantes e tente novamente."
    );
    expect(traduzirErroAuth("Too many requests")).toBe(
      "Muitas tentativas. Aguarde alguns instantes e tente novamente."
    );
  });

  it("usa fallback genérico para erro desconhecido", () => {
    expect(traduzirErroAuth("Some weird backend error")).toBe(
      "Não foi possível entrar. Verifique suas credenciais e tente novamente."
    );
  });

  it("trata undefined/null com fallback", () => {
    expect(traduzirErroAuth(undefined)).toBe(
      "Não foi possível entrar. Verifique suas credenciais e tente novamente."
    );
    expect(traduzirErroAuth(null)).toBe(
      "Não foi possível entrar. Verifique suas credenciais e tente novamente."
    );
  });
});
