/**
 * SAAS-06-C1-FIX08 — Cobre a padronização de mensagens amigáveis para erros
 * técnicos no cadastro de assistido (RLS, campo obrigatório, duplicidade,
 * tenant ausente e erro inesperado), garantindo que termos como
 * "row-level security" e nomes crus de tabelas jamais atinjam o usuário.
 */
import { describe, expect, it } from "vitest";
import {
  toFriendlyError,
  formatSupportDetails,
  TENANT_AUSENTE_ERROR,
} from "@/lib/supabaseFriendlyErrors";

const CTX = {
  operacao: "cadastrar_assistido",
  entidade: "assistidos",
  acao: "INSERT" as const,
  instituicaoId: "11111111-1111-1111-1111-111111111111",
};

describe("SAAS-06-C1-FIX08 — mensagens amigáveis (assistidos)", () => {
  it("mapeia erro RLS (42501) sem vazar termos técnicos", () => {
    const err = {
      code: "42501",
      message: 'new row violates row-level security policy for table "assistidos"',
    };
    const friendly = toFriendlyError(err, CTX);
    expect(friendly.message).toBe(
      "Você não possui permissão para cadastrar assistidos nesta instituição.",
    );
    expect(friendly.message.toLowerCase()).not.toContain("row-level");
    expect(friendly.message.toLowerCase()).not.toContain("policy");
    expect(friendly.message.toLowerCase()).not.toContain("assistidos\"");
    expect(friendly.code).toBe("ASSISTIDOS_INSERT_DENIED");
  });

  it("mapeia RLS pela mensagem, mesmo sem SQLSTATE explícito", () => {
    const err = { message: "violates policy for relation" };
    const friendly = toFriendlyError(err, CTX);
    expect(friendly.code).toBe("ASSISTIDOS_INSERT_DENIED");
  });

  it("mapeia duplicidade (23505)", () => {
    const friendly = toFriendlyError({ code: "23505", message: "dup" }, CTX);
    expect(friendly.message).toBe("Já existe um cadastro com essas informações.");
    expect(friendly.code).toBe("ASSISTIDOS_INSERT_DUPLICATE");
  });

  it("mapeia campo obrigatório (23502)", () => {
    const friendly = toFriendlyError({ code: "23502", message: "null" }, CTX);
    expect(friendly.message).toBe(
      "Preencha os campos obrigatórios antes de continuar.",
    );
    expect(friendly.code).toBe("ASSISTIDOS_INSERT_REQUIRED");
  });

  it("marca tenant ausente com mensagem dedicada", () => {
    const friendly = toFriendlyError(
      { code: TENANT_AUSENTE_ERROR.code, message: "sem tenant" },
      CTX,
    );
    expect(friendly.message).toBe(TENANT_AUSENTE_ERROR.message);
    expect(friendly.code).toBe(TENANT_AUSENTE_ERROR.code);
  });

  it("erro desconhecido cai em mensagem inesperada + orientação de suporte", () => {
    const friendly = toFriendlyError({ code: "XX999", message: "boom" }, CTX);
    expect(friendly.message).toContain("administrador geral");
    expect(friendly.code).toBe("ASSISTIDOS_INSERT_UNEXPECTED");
  });

  it("formatSupportDetails inclui código, operação e entidade — nunca SQL cru", () => {
    const friendly = toFriendlyError(
      { code: "42501", message: "row-level security" },
      CTX,
    );
    const details = formatSupportDetails(friendly);
    expect(details).toContain("Código: ASSISTIDOS_INSERT_DENIED");
    expect(details).toContain("Operação: cadastrar_assistido");
    expect(details).toContain("Entidade: assistidos");
    expect(details.toLowerCase()).not.toContain("row-level");
    expect(details.toLowerCase()).not.toContain("sqlstate");
  });
});
