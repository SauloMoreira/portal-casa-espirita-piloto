import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01-R1.b — Governança dos scripts SQL de rollback.
 *
 * Garante que os três scripts em docs/sql/rollback-stab10-c12a-*.sql são
 * autônomos: não referenciam migrations pelo nome/timestamp, não deixam
 * placeholders "..." dentro de corpos de função, e trazem os blocos completos
 * das RPCs que precisam recriar.
 */

const ROOT = resolve(__dirname, "../../..");
const FIX01 = resolve(ROOT, "docs/sql/rollback-stab10-c12a-fix01.sql");
const A1 = resolve(ROOT, "docs/sql/rollback-stab10-c12a-a1.sql");
const TOTAL = resolve(ROOT, "docs/sql/rollback-stab10-c12a-total.sql");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("STAB10-FIX01-R1.b — rollback scripts são autônomos", () => {
  it("scripts começam com BEGIN e terminam com COMMIT", () => {
    for (const path of [FIX01, A1, TOTAL]) {
      const sql = read(path);
      expect(sql, path).toMatch(/^\s*(?:--[^\n]*\n|\s)*BEGIN;/);
      expect(sql.trimEnd().endsWith("COMMIT;"), path).toBe(true);
    }
  });

  it("nenhum script referencia migrations por nome ou timestamp", () => {
    for (const path of [FIX01, A1, TOTAL]) {
      const sql = read(path);
      // Timestamps de migration têm 14 dígitos (YYYYMMDDHHMMSS).
      expect(sql, `${path} contém timestamp de migration`).not.toMatch(/\b2026\d{10}\b/);
      expect(sql, `${path} referencia diretório de migrations`).not.toMatch(
        /supabase\/migrations/i,
      );
    }
  });

  it("nenhum script contém placeholder de corpo omitido", () => {
    // Detecta reticências dentro de blocos $fn$...$fn$, que indicariam corpo omitido.
    for (const path of [FIX01, A1, TOTAL]) {
      const sql = read(path);
      const dollarBodies = sql.match(/\$fn\$[\s\S]*?\$fn\$/g) ?? [];
      for (const body of dollarBodies) {
        expect(body.includes("..."), `${path} contém "..." em corpo de função`).toBe(false);
      }
    }
  });

  it("rollback FIX01 recria as três RPCs afetadas e restaura o índice A1", () => {
    const sql = read(FIX01);
    expect(sql).toMatch(/CREATE UNIQUE INDEX ux_autocadastro_idem_user_ativo/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_autocadastro_marcar_auth_criado/);
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.fn_autocadastro_marcar_resultado_falha/,
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_autocadastro_assistido_publico/);
    // Não deve tocar em fn_autocadastro_reservar (FIX01 não a alterou).
    expect(sql).not.toMatch(/fn_autocadastro_reservar/);
  });

  it("rollback A1 recria as quatro RPCs C1.2-A e remove o índice A1", () => {
    const sql = read(A1);
    expect(sql).toMatch(/DROP INDEX IF EXISTS public\.ux_autocadastro_idem_user_ativo/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.fn_autocadastro_reservar/);
    expect(sql).toMatch(
      /CREATE FUNCTION public\.fn_autocadastro_reservar\([^)]*\)[\s\S]*RETURNS TABLE/,
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_autocadastro_marcar_auth_criado/);
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.fn_autocadastro_marcar_resultado_falha/,
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_autocadastro_assistido_publico/);
  });

  it("rollback Total dropa as quatro RPCs, o índice, o CHECK e a tabela", () => {
    const sql = read(TOTAL);
    expect(sql).toMatch(/DROP INDEX IF EXISTS public\.ux_autocadastro_idem_user_ativo/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS autocadastro_idem_estado_user_check/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.fn_autocadastro_reservar/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.fn_autocadastro_marcar_auth_criado/);
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.fn_autocadastro_marcar_resultado_falha/,
    );
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.fn_autocadastro_assistido_publico/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS public\.autocadastro_idempotencia/);
  });

  it("todas as RPCs recriadas terminam com REVOKE PUBLIC e GRANT service_role", () => {
    for (const path of [FIX01, A1]) {
      const sql = read(path);
      const rpcs = sql.match(/CREATE (?:OR REPLACE )?FUNCTION public\.(fn_autocadastro_\w+)/g) ?? [];
      expect(rpcs.length, `${path} sem RPCs recriadas`).toBeGreaterThan(0);
      for (const decl of rpcs) {
        const name = decl.match(/fn_autocadastro_\w+/)?.[0] as string;
        const revokeRe = new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}[\\s\\S]*?FROM PUBLIC`);
        const grantRe = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}[\\s\\S]*?TO service_role`);
        expect(sql, `${path} sem REVOKE PUBLIC para ${name}`).toMatch(revokeRe);
        expect(sql, `${path} sem GRANT service_role para ${name}`).toMatch(grantRe);
      }
    }
  });
});
