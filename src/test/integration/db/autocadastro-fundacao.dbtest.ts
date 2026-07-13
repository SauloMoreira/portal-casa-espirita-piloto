import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, getPool, closePool, expectReject } from "./_dbClient";

/**
 * STAB10-C1.1 — Fundação segura do autocadastro tenant-aware.
 *
 * Valida somente o schema criado nesta etapa (flags institucionais, tabela
 * `autocadastro_idempotencia` fechada, índice único do assistido por
 * instituição+usuário ativo) e a integridade dos dados críticos preservados
 * (FER Piloto, R1/R2/R3-A).
 */
const d = HAS_DB ? describe : describe.skip;

const FER = "e3818702-cfac-47ae-b751-cb6a05babd4f";
const R_UIDS = [
  "18e2dceb-48ba-471d-ae9d-da52ef23865a", // R1
  "2a11e218-ea17-4e67-b92a-c1b1fdfdb3d7", // R2
  "a8e77eff-0e83-48aa-9f0e-a41c8c28f0c6", // R3-A
];

afterAll(async () => {
  await closePool();
});

d("STAB10-C1.1 — flags institucionais", () => {
  it("colunas existem com DEFAULT false", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        `SELECT column_name, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name='instituicoes'
            AND column_name IN ('autocadastro_habilitado','autocadastro_listado')
          ORDER BY column_name`,
      );
      expect(r.rowCount).toBe(2);
      for (const row of r.rows) {
        expect(row.is_nullable).toBe("NO");
        expect(row.column_default).toBe("false");
      }
    } finally {
      c.release();
    }
  });

  it("nenhuma instituição foi habilitada pela migration", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        "SELECT count(*)::int n FROM public.instituicoes WHERE autocadastro_habilitado OR autocadastro_listado",
      );
      expect(r.rows[0].n).toBe(0);
    } finally {
      c.release();
    }
  });

  it("FER Piloto permanece em implantacao com ambas as flags false", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        "SELECT status, autocadastro_habilitado, autocadastro_listado FROM public.instituicoes WHERE id=$1",
        [FER],
      );
      expect(r.rows[0].status).toBe("implantacao");
      expect(r.rows[0].autocadastro_habilitado).toBe(false);
      expect(r.rows[0].autocadastro_listado).toBe(false);
    } finally {
      c.release();
    }
  });
});

d("STAB10-C1.1 — tabela de idempotência", () => {
  it("idempotency_key aceita somente UUID", async () => {
    await withRollback(async (c) => {
      await expectReject(
        c,
        /invalid input syntax for type uuid/i,
        `INSERT INTO public.autocadastro_idempotencia
           (idempotency_key, request_fingerprint, status, request_id, instituicao_id, expires_at)
         VALUES ('not-a-uuid','fp','reservado', gen_random_uuid(), $1, now()+interval '1 hour')`,
        [FER],
      );
    });
  });

  it("status inválido é rejeitado pelo CHECK", async () => {
    await withRollback(async (c) => {
      await expectReject(
        c,
        /autocadastro_idempotencia_status_check/i,
        `INSERT INTO public.autocadastro_idempotencia
           (idempotency_key, request_fingerprint, status, request_id, instituicao_id, expires_at)
         VALUES (gen_random_uuid(),'fp','estado_invalido', gen_random_uuid(), $1, now()+interval '1 hour')`,
        [FER],
      );
    });
  });

  it("expires_at <= created_at é rejeitado", async () => {
    await withRollback(async (c) => {
      await expectReject(
        c,
        /expira_apos_criacao/i,
        `INSERT INTO public.autocadastro_idempotencia
           (idempotency_key, request_fingerprint, status, request_id, instituicao_id, created_at, expires_at)
         VALUES (gen_random_uuid(),'fp','reservado', gen_random_uuid(), $1, now(), now())`,
        [FER],
      );
    });
  });

  it("nenhuma policy para anon/authenticated; RLS habilitada e forçada", async () => {
    const c = await getPool().connect();
    try {
      const rls = await c.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE relname='autocadastro_idempotencia' AND relnamespace='public'::regnamespace`,
      );
      expect(rls.rows[0].relrowsecurity).toBe(true);
      expect(rls.rows[0].relforcerowsecurity).toBe(true);
      const pol = await c.query(
        "SELECT count(*)::int n FROM pg_policies WHERE schemaname='public' AND tablename='autocadastro_idempotencia'",
      );
      expect(pol.rows[0].n).toBe(0);
      const gr = await c.query(
        `SELECT grantee, privilege_type FROM information_schema.role_table_grants
          WHERE table_schema='public' AND table_name='autocadastro_idempotencia'
            AND grantee IN ('anon','authenticated','PUBLIC')`,
      );
      expect(gr.rowCount).toBe(0);
    } finally {
      c.release();
    }
  });

  it("request_fingerprint NÃO possui índice UNIQUE", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname='public' AND tablename='autocadastro_idempotencia'`,
      );
      const uniqueFp = r.rows.some(
        (row) => /unique/i.test(row.indexdef) && /request_fingerprint/i.test(row.indexdef),
      );
      expect(uniqueFp).toBe(false);
    } finally {
      c.release();
    }
  });
});

d("STAB10-C1.1 — índice institucional do assistido", () => {
  it("índice único parcial existe (ativo, user_id not null)", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname='public' AND tablename='assistidos'
            AND indexname='ix_assistidos_inst_user_ativo'`,
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].indexdef).toMatch(/UNIQUE/i);
      expect(r.rows[0].indexdef).toMatch(/user_id IS NOT NULL/i);
      expect(r.rows[0].indexdef).toMatch(/deleted_at IS NULL/i);
    } finally {
      c.release();
    }
  });

  it("não existe UNIQUE global em assistidos.user_id", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname='public' AND tablename='assistidos'`,
      );
      const globalUniqueUserId = r.rows.some(
        (row) =>
          /UNIQUE/i.test(row.indexdef) &&
          /\(user_id\)/i.test(row.indexdef) &&
          !/WHERE/i.test(row.indexdef),
      );
      expect(globalUniqueUserId).toBe(false);
    } finally {
      c.release();
    }
  });

  it("dois assistidos ativos com mesmo (instituicao_id,user_id) é rejeitado", async () => {
    await withRollback(async (c) => {
      // Escolhe um assistido ativo existente como base para o INSERT sintético.
      const base = await c.query(
        `SELECT instituicao_id, user_id FROM public.assistidos
          WHERE user_id IS NOT NULL AND deleted_at IS NULL LIMIT 1`,
      );
      if (base.rowCount === 0) return; // banco sem dados suficientes; teste é no-op
      const { instituicao_id, user_id } = base.rows[0];
      await expectReject(
        c,
        /ix_assistidos_inst_user_ativo/i,
        `INSERT INTO public.assistidos (instituicao_id, user_id, nome)
         VALUES ($1, $2, 'DUP TESTE C1.1')`,
        [instituicao_id, user_id],
      );
    });
  });

  it("mesmo user_id em instituições diferentes continua permitido", async () => {
    await withRollback(async (c) => {
      const base = await c.query(
        `SELECT user_id FROM public.assistidos
          WHERE user_id IS NOT NULL AND deleted_at IS NULL LIMIT 1`,
      );
      if (base.rowCount === 0) return;
      const outra = await c.query(
        `SELECT id FROM public.instituicoes
          WHERE id NOT IN (SELECT instituicao_id FROM public.assistidos WHERE user_id=$1) LIMIT 1`,
        [base.rows[0].user_id],
      );
      if (outra.rowCount === 0) return;
      const ins = await c.query(
        `INSERT INTO public.assistidos (instituicao_id, user_id, nome)
         VALUES ($1,$2,'CROSS TENANT C1.1') RETURNING id`,
        [outra.rows[0].id, base.rows[0].user_id],
      );
      expect(ins.rowCount).toBe(1);
    });
  });

  it("linha soft-deleted não bloqueia novo vínculo ativo", async () => {
    await withRollback(async (c) => {
      // Usa um user_id já presente em profiles para não depender de acesso ao schema auth.
      const inst = await c.query("SELECT id FROM public.instituicoes LIMIT 1");
      const usr = await c.query(
        `SELECT p.user_id FROM public.profiles p
          WHERE NOT EXISTS (
            SELECT 1 FROM public.assistidos a
             WHERE a.user_id = p.user_id AND a.instituicao_id = $1 AND a.deleted_at IS NULL
          ) LIMIT 1`,
        [inst.rows[0].id],
      );
      if (usr.rowCount === 0) return;
      const uid = usr.rows[0].user_id;
      await c.query(
        `INSERT INTO public.assistidos (instituicao_id, user_id, nome, deleted_at)
         VALUES ($1,$2,'SOFT DELETADO C1.1', now())`,
        [inst.rows[0].id, uid],
      );
      const ins = await c.query(
        `INSERT INTO public.assistidos (instituicao_id, user_id, nome)
         VALUES ($1,$2,'NOVO ATIVO C1.1') RETURNING id`,
        [inst.rows[0].id, uid],
      );
      expect(ins.rowCount).toBe(1);
    });
  });
});

d("STAB10-C1.1 — integridade de dados críticos", () => {
  it("R1/R2/R3-A permanecem com vínculo ativo em FER Piloto (papel assistido)", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        `SELECT count(*)::int n FROM public.instituicao_usuarios
          WHERE instituicao_id=$1 AND user_id = ANY($2::uuid[])
            AND papel_local='assistido' AND status='ativo'`,
        [FER, R_UIDS],
      );
      expect(r.rows[0].n).toBe(3);
    } finally {
      c.release();
    }
  });

  it("R3-A mantém nome canônico 'Assistido 03' pós-STAB10-R-A1", async () => {
    const c = await getPool().connect();
    try {
      const r = await c.query(
        "SELECT nome_completo FROM public.profiles WHERE user_id=$1",
        [R_UIDS[2]],
      );
      expect(r.rows[0].nome_completo).toBe("Assistido 03");
    } finally {
      c.release();
    }
  });
});
