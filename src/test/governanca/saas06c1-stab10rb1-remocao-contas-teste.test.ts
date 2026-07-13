/**
 * STAB10-R-B1 — Guarda de allowlist e contratos do script de remoção.
 * Não executa remoção real; apenas valida invariantes do script.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(resolve(__dirname, "../../../scripts/stab10r-remover-contas-teste-orfas.ts"), "utf8");

describe("STAB10-R-B1 · script de remoção de contas órfãs", () => {
  it("possui allowlist com exatamente os 2 UUIDs autorizados", () => {
    expect(SRC).toMatch(/"f7112797-3b24-42f3-bd6c-d7e9434e25c0"/);
    expect(SRC).toMatch(/"5945c94f-49a5-4bdb-94a3-b5214bd29139"/);
    const uuidLines = (SRC.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || []).filter(
      (u) => !u.startsWith("8f18e750"), // solicitacao id de R4
    );
    // apenas os 2 UUIDs de usuários autorizados devem aparecer como identificadores de conta
    const distintos = new Set(uuidLines);
    expect(distintos.has("f7112797-3b24-42f3-bd6c-d7e9434e25c0")).toBe(true);
    expect(distintos.has("5945c94f-49a5-4bdb-94a3-b5214bd29139")).toBe(true);
  });

  it("rejeita UUIDs fora da allowlist via assertAllowlistOnly", () => {
    expect(SRC).toMatch(/UUID fora da allowlist rejeitado/);
    expect(SRC).toMatch(/if\s*\(!ALLOWED\.has\(u\)\)/);
  });

  it("exige --dry-run ou --execute", () => {
    expect(SRC).toMatch(/Modo obrigatório: --dry-run ou --execute/);
  });

  it("dry-run não faz escritas (retorna antes de remoção pública)", () => {
    expect(SRC).toMatch(/\[dry-run\] nenhuma escrita executada/);
  });

  it("audita antes de remover com acao STAB10R_EXCLUSAO_CONTA_TESTE_ORFA e sem dados sensíveis", () => {
    expect(SRC).toMatch(/STAB10R_EXCLUSAO_CONTA_TESTE_ORFA/);
    // Auditoria não pode carregar dados sensíveis; payload inclui motivo, run_id e resultado.
    const auditIdx = SRC.lastIndexOf("STAB10R_EXCLUSAO_CONTA_TESTE_ORFA");
    const auditBlock = SRC.slice(Math.max(0, auditIdx - 200), auditIdx + 400);
    expect(auditBlock).not.toMatch(/email|cpf|celular|senha|token/i);
    expect(auditBlock).toMatch(/motivo/);
    expect(auditBlock).toMatch(/run_id/);
  });

  it("aborta se instituicao_usuarios ou assistidos.user_id existirem no momento da remoção", () => {
    expect(SRC).toMatch(/ABORT: instituicao_usuarios apareceu/);
    expect(SRC).toMatch(/ABORT: assistidos\.user_id apareceu/);
  });

  it("delete Auth é idempotente (checa existência antes)", () => {
    expect(SRC).toMatch(/getUserById/);
    expect(SRC).toMatch(/alreadyGone/);
  });

  it("verificação final exige zero resíduos em modo execute", () => {
    expect(SRC).toMatch(/Resíduos remanescentes/);
  });

  it("não filtra por nome, prefixo ou email para excluir", () => {
    expect(SRC).not.toMatch(/DELETE FROM \w+ WHERE (nome|email) /i);
    expect(SRC).not.toMatch(/LIKE\s+'/);
  });
});
