import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, getPool, closePool, expectReject } from "./_dbClient";

/**
 * STAB10-C1.2-B1 — Fundação persistente de rate-limit do autocadastro.
 *
 * Valida:
 *  - Schema/CHECKs/índice/segurança de `autocadastro_rate_limit`.
 *  - RPC `fn_autocadastro_rate_limit_hit`: escopo/limites internos fixos
 *    (ip=5, email=3, instituicao=30), janela fixa 10 min, incremento
 *    atômico, Retry-After coerente, cleanup limitado, ausência de
 *    grants para anon/authenticated/PUBLIC.
 *  - Nenhuma instituição foi habilitada por esta etapa.
 */
const d = HAS_DB ? describe : describe.skip;

afterAll(async () => { await closePool(); });

// Janela agora calculada internamente pela RPC (FIX01).


d("STAB10-C1.2-B1 — tabela de rate-limit", () => {
  it("existe com PK composta e CHECKs obrigatórios", async () => {
    const c = await getPool().connect();
    try {
      const cols = await c.query(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name='autocadastro_rate_limit'`,
      );
      const names = cols.rows.map((r) => r.column_name).sort();
      for (const n of ["scope","bucket_key","window_start","contador","expires_at","created_at","updated_at"]) {
        expect(names).toContain(n);
      }

      const checks = await c.query(
        `SELECT conname FROM pg_constraint
          WHERE conrelid='public.autocadastro_rate_limit'::regclass AND contype='c'`,
      );
      const cnames = checks.rows.map((r) => r.conname);
      expect(cnames).toEqual(expect.arrayContaining([
        "autocadastro_rate_limit_scope_check",
        "autocadastro_rate_limit_contador_check",
        "autocadastro_rate_limit_window_check",
        "autocadastro_rate_limit_bucket_key_check",
      ]));
    } finally { c.release(); }
  });

  it("RLS ENABLE + FORCE e sem policies", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE relname='autocadastro_rate_limit' AND relnamespace='public'::regnamespace`,
      );
      expect(r.rows[0].relrowsecurity).toBe(true);
      expect(r.rows[0].relforcerowsecurity).toBe(true);

      const p = await c.query(
        "SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND tablename='autocadastro_rate_limit'",
      );
      expect(p.rows[0].n).toBe(0);
    } finally { c.release(); }
  });

  it("nenhum grant para anon/authenticated/PUBLIC", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        `SELECT grantee, privilege_type FROM information_schema.role_table_grants
          WHERE table_schema='public' AND table_name='autocadastro_rate_limit'
            AND grantee IN ('anon','authenticated','PUBLIC')`,
      );
      expect(r.rowCount).toBe(0);
    } finally { c.release(); }
  });

  it("índice por expires_at existe", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname='public' AND tablename='autocadastro_rate_limit'
            AND indexname='ix_autocadastro_rate_limit_expires'`,
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].indexdef).toMatch(/expires_at/);
    } finally { c.release(); }
  });

  it("scope inválido rejeitado pelo CHECK", async () => {
    await withRollback(async (c) => {
      await expectReject(
        c,
        /autocadastro_rate_limit_scope_check/i,
        `INSERT INTO public.autocadastro_rate_limit
           (scope,bucket_key,window_start,contador,expires_at)
         VALUES ('invalido','k', now(), 1, now()+interval '10 minutes')`,
      );
    });
  });

  it("contador <= 0 rejeitado pelo CHECK", async () => {
    await withRollback(async (c) => {
      await expectReject(
        c,
        /autocadastro_rate_limit_contador_check/i,
        `INSERT INTO public.autocadastro_rate_limit
           (scope,bucket_key,window_start,contador,expires_at)
         VALUES ('ip','k', now(), 0, now()+interval '10 minutes')`,
      );
    });
  });

  it("expires_at <= window_start rejeitado pelo CHECK", async () => {
    await withRollback(async (c) => {
      await expectReject(
        c,
        /autocadastro_rate_limit_window_check/i,
        `INSERT INTO public.autocadastro_rate_limit
           (scope,bucket_key,window_start,contador,expires_at)
         VALUES ('ip','k', now(), 1, now())`,
      );
    });
  });
});

d("STAB10-C1.2-B1 — RPC fn_autocadastro_rate_limit_hit", () => {
  it("EXECUTE fechado a anon/authenticated/PUBLIC", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        `SELECT grantee, privilege_type FROM information_schema.role_routine_grants
          WHERE routine_schema='public'
            AND routine_name='fn_autocadastro_rate_limit_hit'
            AND grantee IN ('anon','authenticated','PUBLIC')`,
      );
      expect(r.rowCount).toBe(0);
    } finally { c.release(); }
  });

  it("valida scope e retorna limites 5/3/30 (janela fixa)", async () => {
    await withRollback(async (c) => {
      const cases: Array<[string, number]> = [["ip", 5], ["email", 3], ["instituicao", 30]];
      for (const [scope, limite] of cases) {
        const r = await c.query(
          "SELECT * FROM public.fn_autocadastro_rate_limit_hit($1,$2)",
          [scope, `${scope}-bkt-${crypto.randomUUID()}`],
        );
        expect(r.rows[0].limite).toBe(limite);
        expect(r.rows[0].contador).toBe(1);
        expect(r.rows[0].permitido).toBe(true);
        expect(r.rows[0].retry_after_seconds).toBeGreaterThanOrEqual(0);
      }
      await expectReject(
        c,
        /SCOPE_INVALIDO|scope_check/i,
        "SELECT public.fn_autocadastro_rate_limit_hit('outro','k')",
      );
    });
  });

  it("incrementa atomicamente e bloqueia acima do limite (email=3)", async () => {
    await withRollback(async (c) => {
      const bkt = `email-bkt-${crypto.randomUUID()}`;
      const results: number[] = [];
      for (let i = 0; i < 4; i++) {
        const r = await c.query(
          "SELECT * FROM public.fn_autocadastro_rate_limit_hit('email',$1)",
          [bkt],
        );
        results.push(r.rows[0].contador);
        if (i < 3) expect(r.rows[0].permitido).toBe(true);
        else       expect(r.rows[0].permitido).toBe(false);
      }
      expect(results).toEqual([1, 2, 3, 4]);
    });
  });

  it("cleanup remove apenas linhas expiradas e é limitado", async () => {
    await withRollback(async (c) => {
      // FIX02: constraint canônica exige expires_at = window_start + 10min.
      await c.query(
        `INSERT INTO public.autocadastro_rate_limit
           (scope,bucket_key,window_start,contador,expires_at)
         VALUES ('ip','antiga-b1', now()-interval '30 minutes', 1, now()-interval '30 minutes' + interval '10 minutes')`,
      );
      await c.query(
        "SELECT public.fn_autocadastro_rate_limit_hit('ip',$1)",
        [`ip-nova-${crypto.randomUUID()}`],
      );
      const r = await c.query(
        "SELECT count(*)::int n FROM public.autocadastro_rate_limit WHERE bucket_key='antiga-b1'",
      );
      expect(r.rows[0].n).toBe(0);
    });
  });

  it("bucket_key vazio ou muito grande é rejeitado", async () => {
    await withRollback(async (c) => {
      await expectReject(
        c,
        /BUCKET_KEY_INVALIDA|bucket_key_check/i,
        "SELECT public.fn_autocadastro_rate_limit_hit('ip','')",
      );
      await expectReject(
        c,
        /BUCKET_KEY_INVALIDA|bucket_key_check/i,
        "SELECT public.fn_autocadastro_rate_limit_hit('ip',$1)",
        ["x".repeat(129)],
      );
    });
  });
});


d("STAB10-C1.2-B1 — preservação", () => {
  it("nenhuma instituição foi habilitada pela etapa B1", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        "SELECT count(*)::int n FROM public.instituicoes WHERE autocadastro_habilitado",
      );
      expect(r.rows[0].n).toBe(0);
    } finally { c.release(); }
  });
});
