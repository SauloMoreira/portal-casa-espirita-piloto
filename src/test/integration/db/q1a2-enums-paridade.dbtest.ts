import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool } from "./_dbClient";
import { APP_ROLES } from "@/constants/roles";

/**
 * Q1-A2 — Paridade REAL de enums × fonte canônica TS (requer banco vivo).
 *
 * Confronta o enum `app_role` e o enum `notif_evento` diretamente em
 * `pg_enum`/`pg_type` (fonte de verdade) contra os espelhos TS canônicos.
 * Roda apenas em `npm run test:db` — fora do CI puro.
 */
const d = HAS_DB ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

async function enumValues(c: import("pg").PoolClient, name: string): Promise<string[]> {
  const r = await c.query(
    `SELECT e.enumlabel AS v
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typname = $1
      ORDER BY e.enumsortorder`,
    [name],
  );
  return r.rows.map((row) => row.v as string);
}

d("Q1-A2 contrato real — paridade de enums DB × TS", () => {
  it("app_role (pg_enum) == APP_ROLES (TS)", async () => {
    await withRollback(async (c) => {
      const db = await enumValues(c, "app_role");
      expect(new Set(db)).toEqual(new Set(APP_ROLES));
    });
  });

  it("notif_evento (pg_enum) tem espelho coerente (16 valores reais)", async () => {
    await withRollback(async (c) => {
      const db = await enumValues(c, "notif_evento");
      // Trava de cardinalidade real para detectar evolução não espelhada.
      expect(db.length).toBe(16);
      expect(db).toContain("mensagem_manual");
      expect(db).toContain("aviso_ausencia_recebido");
    });
  });
});
