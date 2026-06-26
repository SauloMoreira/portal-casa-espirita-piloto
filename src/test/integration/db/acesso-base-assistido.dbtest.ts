import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * Etapa 1 — Acesso básico automático de "assistido" (papel base do sistema).
 *
 * Invariantes provadas no banco REAL (gatilho + idempotência):
 *  - INV-ACC-BASE-001: toda conta nasce com o papel base `assistido`.
 *  - INV-ACC-BASE-002: a concessão é idempotente (segura para reexecução/backfill).
 *  - INV-ACC-BASE-003: o papel base é cumulativo — papéis elevados NÃO o substituem.
 *
 * Fonte única: gatilho AFTER INSERT em public.profiles. Para exercitar o gatilho
 * sem inserir em auth.users (fora do alcance do runner), usamos uma conta auth
 * já existente que tenha papel elevado e ainda NÃO possua profile nem base.
 */
const d = HAS_DB ? describe : describe.skip;

afterAll(async () => {
  await closePool();
});

/** Conta auth existente com papel elevado, sem profile e sem base `assistido`. */
async function getContaElevadaSemBaseSemProfile(c: PoolClient): Promise<string | null> {
  const r = await c.query(
    `SELECT ur.user_id
       FROM user_roles ur
      WHERE ur.role <> 'assistido'
        AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = ur.user_id)
        AND NOT EXISTS (SELECT 1 FROM user_roles b WHERE b.user_id = ur.user_id AND b.role = 'assistido')
      LIMIT 1`,
  );
  return r.rows[0]?.user_id ?? null;
}

async function rolesDe(c: PoolClient, uid: string): Promise<string[]> {
  const r = await c.query("SELECT role::text FROM user_roles WHERE user_id = $1 ORDER BY role", [uid]);
  return r.rows.map((x) => x.role);
}

d("Etapa 1 — acesso base automático de assistido (banco real)", () => {
  it("ao criar o profile, o papel base assistido é concedido automaticamente e é cumulativo", async () => {
    await withRollback(async (c) => {
      const uid = await getContaElevadaSemBaseSemProfile(c);
      if (!uid) return; // ambiente sem conta elegível — nada a provar aqui

      const antes = await rolesDe(c, uid);
      expect(antes).not.toContain("assistido");
      expect(antes.length).toBeGreaterThan(0); // já possui papel elevado

      // Cria a conta (profile) -> dispara o gatilho de concessão do papel base.
      await c.query("INSERT INTO public.profiles (user_id) VALUES ($1)", [uid]);

      const depois = await rolesDe(c, uid);
      // INV-ACC-BASE-001: base concedida automaticamente.
      expect(depois).toContain("assistido");
      // INV-ACC-BASE-003: papel elevado anterior preservado (cumulativo).
      for (const r of antes) expect(depois).toContain(r);
    });
  });

  it("a concessão é idempotente — reexecutar não duplica o papel base", async () => {
    await withRollback(async (c) => {
      const uid = await getContaElevadaSemBaseSemProfile(c);
      if (!uid) return;

      await c.query("INSERT INTO public.profiles (user_id) VALUES ($1)", [uid]);
      // Reexecuta a mesma concessão (igual ao backfill) várias vezes.
      const grant = () =>
        c.query(
          `INSERT INTO public.user_roles (user_id, role)
             VALUES ($1, 'assistido'::app_role)
           ON CONFLICT (user_id, role) DO NOTHING`,
          [uid],
        );
      await grant();
      await grant();

      const r = await c.query(
        "SELECT count(*)::int n FROM user_roles WHERE user_id = $1 AND role = 'assistido'",
        [uid],
      );
      expect(r.rows[0].n).toBe(1);
    });
  });

  it("depois de ter a base, receber novo papel elevado não substitui o assistido", async () => {
    await withRollback(async (c) => {
      const uid = await getContaElevadaSemBaseSemProfile(c);
      if (!uid) return;

      await c.query("INSERT INTO public.profiles (user_id) VALUES ($1)", [uid]);
      expect(await rolesDe(c, uid)).toContain("assistido");

      // Concede um papel elevado adicional ainda não presente.
      await c.query(
        `INSERT INTO public.user_roles (user_id, role)
           SELECT $1, 'tarefeiro'::app_role
         WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id=$1 AND role='tarefeiro')`,
        [uid],
      );

      const depois = await rolesDe(c, uid);
      expect(depois).toContain("assistido"); // base persiste
      expect(depois).toContain("tarefeiro"); // elevado coexiste
    });
  });

  it("backfill: nenhuma conta com profile pode ficar sem o papel base", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT count(*)::int n
           FROM profiles p
          WHERE NOT EXISTS (
            SELECT 1 FROM user_roles ur WHERE ur.user_id = p.user_id AND ur.role = 'assistido'
          )`,
      );
      expect(r.rows[0].n).toBe(0);
    });
  });
});
