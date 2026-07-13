import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool, expectReject } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01 — Testes DB reais das correções do hardening A1:
 *
 *   - Índice parcial `ux_autocadastro_idem_user_ativo` cobrindo exatamente
 *     `auth_criado`, `concluido` e `rollback_falhou`.
 *   - CHECK `autocadastro_idem_estado_user_check` (coerência status × user_id).
 *   - `fn_autocadastro_marcar_resultado_falha` exigindo `user_id IS NULL` para
 *     concluir a transição `auth_criado → falhou` (`AUTH_DELETE_NAO_CONFIRMADO`).
 *   - Literais de transição específicos (sem `TRANSICAO_INVALIDA_%` genérico).
 *   - Permissões e FORCE RLS mantidos.
 *
 * O sandbox de teste é BYPASSRLS e não pode criar `auth.users`; portanto o
 * cenário de delete real é validado pelo E2E dedicado. Aqui simulamos a
 * evidência canônica (FK ON DELETE SET NULL → user_id NULL) via UPDATE
 * direto sobre a linha de idempotência.
 */

const d = HAS_DB ? describe : describe.skip;
const ADMIN = "18f012e0-bf2a-439b-a8e9-34d5c8b9e785";

afterAll(async () => {
  await closePool();
});

async function fixtureInst(c: PoolClient, sufixo: string): Promise<string> {
  const slug = `c12a-fix01-${sufixo}-${crypto.randomUUID().slice(0, 6)}`;
  const r = await c.query(
    `INSERT INTO public.instituicoes (nome, slug, status, autocadastro_habilitado, autocadastro_listado)
     VALUES ($1,$2,'implantacao',true,true) RETURNING id`,
    [`FIX01 ${sufixo}`, slug],
  );
  return r.rows[0].id as string;
}

/** Pega dois user_ids reais e distintos com profile (auth.users existente). */
async function twoRealUsers(c: PoolClient): Promise<[string, string]> {
  const r = await c.query("SELECT user_id FROM public.profiles LIMIT 2");
  expect(r.rows.length).toBe(2);
  return [r.rows[0].user_id, r.rows[1].user_id];
}

/**
 * Insere uma linha de idempotência já em `status`. Devolve idempotency_key.
 * Bypassa RPC — usado para montar cenários dos estados finais (concluido /
 * rollback_falhou) sem exigir Auth novo.
 */
async function seedIdem(
  c: PoolClient,
  instId: string,
  status: string,
  userId: string | null,
  reqId?: string,
  fp = "fp-fix01",
): Promise<string> {
  const key = crypto.randomUUID();
  await c.query(
    `INSERT INTO public.autocadastro_idempotencia
       (idempotency_key, request_fingerprint, status, request_id,
        instituicao_id, user_id, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6, now()+interval '10 minutes')`,
    [key, fp, status, reqId ?? crypto.randomUUID(), instId, userId],
  );
  return key;
}

// ---------------- 1-2. Índice parcial correto ----------------
d("FIX01 — índice parcial", () => {
  it("cobre exatamente auth_criado, concluido e rollback_falhou", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT pg_get_indexdef(indexrelid) AS def
           FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid
          WHERE ic.relname = 'ux_autocadastro_idem_user_ativo'`,
      );
      const def = r.rows[0].def as string;
      expect(def).toMatch(/user_id IS NOT NULL/);
      expect(def).toMatch(/'auth_criado'/);
      expect(def).toMatch(/'concluido'/);
      expect(def).toMatch(/'rollback_falhou'/);
      expect(def).not.toMatch(/'reservado'/);
      expect(def).not.toMatch(/'falhou'/);
    });
  });

  it("aceita duas linhas em estados fora do índice (reservado sem user_id)", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "fora-indice");
      // Duas reservas concorrentes: user_id NULL, status reservado — não violam o índice.
      await seedIdem(c, inst, "reservado", null);
      await seedIdem(c, inst, "reservado", null);
      // OK — nenhum erro esperado.
    });
  });
});

// ---------------- 3-6. CHECK autocadastro_idem_estado_user_check ----------------
d("FIX01 — CHECK status × user_id", () => {
  const cases: Array<[string, string, boolean, RegExp]> = [
    ["reservado + user_id preenchido → rejeita", "reservado", true, /autocadastro_idem_estado_user_check/],
    ["reservado + user_id NULL → aceita", "reservado", false, /^$/],
    ["concluido + user_id NULL → rejeita", "concluido", false, /autocadastro_idem_estado_user_check/],
    ["rollback_falhou + user_id NULL → rejeita", "rollback_falhou", false, /autocadastro_idem_estado_user_check/],
    ["falhou + user_id preenchido → rejeita", "falhou", true, /autocadastro_idem_estado_user_check/],
    ["auth_criado + user_id preenchido → aceita", "auth_criado", true, /^$/],
    ["auth_criado + user_id NULL → aceita (pós FK ON DELETE SET NULL)", "auth_criado", false, /^$/],
  ];
  for (const [label, status, withUser, expectPattern] of cases) {
    it(label, async () => {
      await withRollback(async (c) => {
        const inst = await fixtureInst(c, "check-" + status);
        const [u] = await twoRealUsers(c);
        const uid = withUser ? u : null;
        if (expectPattern.source === "^$") {
          await seedIdem(c, inst, status, uid);
        } else {
          await expectReject(
            c,
            expectPattern,
            `INSERT INTO public.autocadastro_idempotencia
              (idempotency_key, request_fingerprint, status, request_id,
               instituicao_id, user_id, expires_at)
             VALUES ($1,'fp',$2,$3,$4,$5, now()+interval '10 minutes')`,
            [crypto.randomUUID(), status, crypto.randomUUID(), inst, uid],
          );
        }
      });
    });
  }
});

// ---------------- 7-8. Índice bloqueia duplicidade em estados finais ----------------
d("FIX01 — índice bloqueia user_id duplicado em estados ativos", () => {
  it("concluido: segunda linha com mesmo user_id viola índice único", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "dup-concluido");
      const [u] = await twoRealUsers(c);
      await seedIdem(c, inst, "concluido", u);
      await expectReject(
        c,
        /ux_autocadastro_idem_user_ativo/,
        `INSERT INTO public.autocadastro_idempotencia
          (idempotency_key, request_fingerprint, status, request_id,
           instituicao_id, user_id, expires_at)
         VALUES ($1,'fp','concluido',$2,$3,$4, now()+interval '10 minutes')`,
        [crypto.randomUUID(), crypto.randomUUID(), inst, u],
      );
    });
  });

  it("rollback_falhou: segunda linha com mesmo user_id viola índice único", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "dup-rf");
      const [u] = await twoRealUsers(c);
      await seedIdem(c, inst, "rollback_falhou", u);
      await expectReject(
        c,
        /ux_autocadastro_idem_user_ativo/,
        `INSERT INTO public.autocadastro_idempotencia
          (idempotency_key, request_fingerprint, status, request_id,
           instituicao_id, user_id, expires_at)
         VALUES ($1,'fp','rollback_falhou',$2,$3,$4, now()+interval '10 minutes')`,
        [crypto.randomUUID(), crypto.randomUUID(), inst, u],
      );
    });
  });

  it("auth_criado + concluido do mesmo user_id violam índice", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "dup-ac-conc");
      const [u] = await twoRealUsers(c);
      await seedIdem(c, inst, "auth_criado", u);
      await expectReject(
        c,
        /ux_autocadastro_idem_user_ativo/,
        `INSERT INTO public.autocadastro_idempotencia
          (idempotency_key, request_fingerprint, status, request_id,
           instituicao_id, user_id, expires_at)
         VALUES ($1,'fp','concluido',$2,$3,$4, now()+interval '10 minutes')`,
        [crypto.randomUUID(), crypto.randomUUID(), inst, u],
      );
    });
  });
});

// ---------------- 9-11. AUTH_DELETE_NAO_CONFIRMADO ----------------
d("FIX01 — fn_autocadastro_marcar_resultado_falha (delete real)", () => {
  it("auth_criado + p_auth_delete_ok=true com user_id ainda preenchido → AUTH_DELETE_NAO_CONFIRMADO", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "delnok");
      const [u] = await twoRealUsers(c);
      const req = crypto.randomUUID();
      const key = await seedIdem(c, inst, "auth_criado", u, req);
      const antes = (await c.query(
        "SELECT status, result_code, updated_at, user_id FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [key],
      )).rows[0];

      await expectReject(
        c,
        /AUTH_DELETE_NAO_CONFIRMADO/,
        "SELECT * FROM public.fn_autocadastro_marcar_resultado_falha($1,$2,$3,$4,$5)",
        [key, "fp-fix01", req, "TIMEOUT_APOS_AUTH", true],
      );

      const depois = (await c.query(
        "SELECT status, result_code, updated_at, user_id FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [key],
      )).rows[0];
      // Linha estritamente inalterada
      expect(depois.status).toBe(antes.status);
      expect(depois.result_code).toBe(antes.result_code);
      expect(depois.updated_at.getTime()).toBe(antes.updated_at.getTime());
      expect(depois.user_id).toBe(antes.user_id);
    });
  });

  it("após simular ON DELETE SET NULL (user_id=NULL), auth_criado → falhou é aceito", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "delok");
      const req = crypto.randomUUID();
      // Seed já no estado pós-FK: auth_criado + user_id NULL (evidência canônica
      // de que o delete real no Auth ocorreu e a FK ON DELETE SET NULL limpou).
      const key = await seedIdem(c, inst, "auth_criado", null, req);
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_resultado_falha($1,$2,$3,$4,$5)",
        [key, "fp-fix01", req, "AUTH_DELETADO_OK", true],
      );
      expect(r.rows[0].result_code).toBe("falhou");
      const linha = (await c.query(
        "SELECT status, result_code, user_id FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [key],
      )).rows[0];
      expect(linha.status).toBe("falhou");
      expect(linha.user_id).toBe(null);
      expect(linha.result_code).toBe("AUTH_DELETADO_OK");
    });
  });

  it("rollback_falhou preserva user_id e cria auditoria com registro_id=<auth-uuid>", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "rf-audit");
      const [u] = await twoRealUsers(c);
      const req = crypto.randomUUID();
      const key = await seedIdem(c, inst, "auth_criado", u, req);
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_resultado_falha($1,$2,$3,$4,$5)",
        [key, "fp-fix01", req, "FALHA_APOS_AUTH", false],
      );
      expect(r.rows[0].result_code).toBe("rollback_falhou");
      const linha = (await c.query(
        "SELECT status, user_id FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [key],
      )).rows[0];
      expect(linha.status).toBe("rollback_falhou");
      expect(linha.user_id).toBe(u);
      const aud = (await c.query(
        `SELECT user_id, registro_id FROM public.audit_logs
          WHERE acao='AUTOCADASTRO_ROLLBACK_FALHOU'
            AND (dados_novos->>'idempotency_key')::uuid = $1`,
        [key],
      )).rows[0];
      expect(aud.user_id).toBe(null);
      expect(aud.registro_id).toBe(u);
    });
  });
});

// ---------------- 12-13. Literais de transição + ROW_COUNT ----------------
d("FIX01 — literais de transição específicos", () => {
  it("marcar_auth_criado sobre linha não-reservado → TRANSICAO_INVALIDA_RESERVADO_AUTH_CRIADO", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "lit-auth");
      const [u, u2] = await twoRealUsers(c);
      const req = crypto.randomUUID();
      const key = await seedIdem(c, inst, "concluido", u, req);
      await expectReject(
        c,
        /^.*TRANSICAO_INVALIDA_RESERVADO_AUTH_CRIADO.*$/,
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [key, "fp-fix01", req, u2],
      );
    });
  });

  it("assistido_publico sobre linha reservado → TRANSICAO_INVALIDA_AUTH_CRIADO_CONCLUIDO", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "lit-conc");
      const req = crypto.randomUUID();
      const key = await seedIdem(c, inst, "reservado", null, req);
      await expectReject(
        c,
        /TRANSICAO_INVALIDA_AUTH_CRIADO_CONCLUIDO/,
        `SELECT * FROM public.fn_autocadastro_assistido_publico(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          req, key, "fp-fix01", inst,
          (await twoRealUsers(c))[0],
          "x@x.com", "Nome Fix01", "", "11999990000",
          "v1", "v1", new Date().toISOString(),
        ],
      );
    });
  });

  it("marcar_resultado_falha sobre linha rollback_falhou → literal específico por p_auth_delete_ok", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "lit-rf");
      const [u] = await twoRealUsers(c);
      const req = crypto.randomUUID();
      const key = await seedIdem(c, inst, "rollback_falhou", u, req);
      await expectReject(
        c,
        /TRANSICAO_INVALIDA_AUTH_CRIADO_FALHOU/,
        "SELECT * FROM public.fn_autocadastro_marcar_resultado_falha($1,$2,$3,$4,$5)",
        [key, "fp-fix01", req, "x", true],
      );
    });

    await withRollback(async (c) => {
      const inst = await fixtureInst(c, "lit-rf2");
      const [u] = await twoRealUsers(c);
      const req = crypto.randomUUID();
      const key = await seedIdem(c, inst, "rollback_falhou", u, req);
      await expectReject(
        c,
        /TRANSICAO_INVALIDA_AUTH_CRIADO_ROLLBACK_FALHOU/,
        "SELECT * FROM public.fn_autocadastro_marcar_resultado_falha($1,$2,$3,$4,$5)",
        [key, "fp-fix01", req, "x", false],
      );
    });
  });
});

// ---------------- 14-15. Permissões e FORCE RLS ----------------
d("FIX01 — permissões e FORCE RLS", () => {
  it("has_function_privilege confirma PUBLIC/anon/authenticated=false, service_role=true", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT
           has_function_privilege('anon',          'public.fn_autocadastro_marcar_resultado_falha(uuid,text,uuid,text,boolean)', 'EXECUTE') anon_x,
           has_function_privilege('authenticated', 'public.fn_autocadastro_marcar_resultado_falha(uuid,text,uuid,text,boolean)', 'EXECUTE') auth_x,
           has_function_privilege('service_role',  'public.fn_autocadastro_marcar_resultado_falha(uuid,text,uuid,text,boolean)', 'EXECUTE') svc_x,
           has_function_privilege('anon',          'public.fn_autocadastro_marcar_auth_criado(uuid,text,uuid,uuid)', 'EXECUTE') anon_ac,
           has_function_privilege('service_role',  'public.fn_autocadastro_marcar_auth_criado(uuid,text,uuid,uuid)', 'EXECUTE') svc_ac`,
      );
      expect(r.rows[0].anon_x).toBe(false);
      expect(r.rows[0].auth_x).toBe(false);
      expect(r.rows[0].svc_x).toBe(true);
      expect(r.rows[0].anon_ac).toBe(false);
      expect(r.rows[0].svc_ac).toBe(true);
    });
  });

  it("autocadastro_idempotencia continua FORCE RLS e sem policies", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT relrowsecurity, relforcerowsecurity,
                (SELECT count(*) FROM pg_policies
                  WHERE schemaname='public' AND tablename='autocadastro_idempotencia') pol
           FROM pg_class WHERE oid='public.autocadastro_idempotencia'::regclass`,
      );
      expect(r.rows[0].relrowsecurity).toBe(true);
      expect(r.rows[0].relforcerowsecurity).toBe(true);
      expect(Number(r.rows[0].pol)).toBe(0);
    });
  });
});
