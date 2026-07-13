import { describe, it, expect, afterAll } from "vitest";
import { HAS_DB, withRollback, closePool, expectReject, actAs } from "./_dbClient";
import type { PoolClient } from "pg";

/**
 * SAAS-06-C1-STAB10-C1.2-A — Testes reais das RPCs internas do autocadastro
 * tenant-aware. Cobrem:
 *
 *   - Permissões (anon/authenticated não executam; service_role executa)
 *   - FORCE ROW LEVEL SECURITY continua ativo em autocadastro_idempotencia
 *   - fn_autocadastro_reservar (reserva atômica, conflitos e transições)
 *   - fn_autocadastro_marcar_auth_criado (transições, idempotência, user_id em uso)
 *   - fn_autocadastro_marcar_resultado_falha (transições, rollback_falhou + auditoria)
 *   - fn_autocadastro_assistido_publico (rejeições de finalização — instituição
 *     sem flag, email divergente, transição inválida, profile/vínculo existente,
 *     idempotência concluída reutilizada)
 *
 * Não podemos exercitar o caminho feliz completo aqui: o sandbox não cria
 * `auth.users` novos. O happy path é validado pelo E2E dedicado que usa a Auth
 * Admin API. O que exigimos aqui é que nenhuma rejeição escreva estado público.
 *
 * IMPORTANTÍSSIMO: a suíte roda inteiramente dentro de `withRollback`, jamais
 * persistindo dados. Nenhuma instituição real é habilitada; usamos fixtures
 * efêmeras namespaced (`c12a-…`).
 */

const d = HAS_DB ? describe : describe.skip;

const FER = "e3818702-cfac-47ae-b751-cb6a05babd4f";
const ADMIN = "18f012e0-bf2a-439b-a8e9-34d5c8b9e785";

afterAll(async () => {
  await closePool();
});

/** Cria uma instituição efêmera habilitada, dentro da transação. */
async function fixtureInstituicao(c: PoolClient, sufixo: string): Promise<string> {
  const slug = `c12a-${sufixo}-${crypto.randomUUID().slice(0, 6)}`;
  const r = await c.query(
    `INSERT INTO public.instituicoes (nome, slug, status, autocadastro_habilitado, autocadastro_listado)
     VALUES ($1, $2, 'implantacao', true, true) RETURNING id`,
    [`C12A ${sufixo}`, slug],
  );
  return r.rows[0].id as string;
}

/** Pega um user_id real com profile associado (para testes de rejeição). */
async function existingUserId(c: PoolClient): Promise<string> {
  const r = await c.query("SELECT user_id FROM public.profiles LIMIT 1");
  return r.rows[0].user_id as string;
}

/** Cria um assistido fixture para o instituicao dado (retorna assistido.id real). */
async function seedAssistidoFixture(c: PoolClient, instId: string): Promise<string> {
  const r = await c.query(
    `INSERT INTO public.assistidos (nome, instituicao_id, created_by, celular)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [
      "C12A fixture " + crypto.randomUUID().slice(0, 6),
      instId,
      ADMIN,
      "119" + Math.floor(10000000 + Math.random() * 89999999).toString(),
    ],
  );
  return r.rows[0].id as string;
}

const FP = "fp-teste-hex";
const REQ = () => crypto.randomUUID();
const KEY = () => crypto.randomUUID();
const FUT = () => new Date(Date.now() + 5 * 60_000).toISOString();

// ---------------- Permissões / FORCE RLS ----------------
d("STAB10-C1.2-A — permissões das RPCs", () => {
  const fns: Array<[string, string]> = [
    ["fn_autocadastro_reservar", "uuid,text,uuid,uuid,timestamptz"],
    ["fn_autocadastro_marcar_auth_criado", "uuid,text,uuid,uuid"],
    [
      "fn_autocadastro_assistido_publico",
      "uuid,uuid,text,uuid,uuid,text,text,text,text,text,text,timestamptz",
    ],
    ["fn_autocadastro_marcar_resultado_falha", "uuid,text,uuid,text,boolean"],
  ];

  it("anon e authenticated NÃO possuem EXECUTE em nenhuma RPC", async () => {
    await withRollback(async (c) => {
      for (const [fn, sig] of fns) {
        const r = await c.query(
          `SELECT
             has_function_privilege('anon',          'public.${fn}(${sig})', 'EXECUTE') anon_x,
             has_function_privilege('authenticated', 'public.${fn}(${sig})', 'EXECUTE') auth_x,
             has_function_privilege('service_role',  'public.${fn}(${sig})', 'EXECUTE') svc_x`,
        );
        expect(r.rows[0].anon_x, `${fn} anon`).toBe(false);
        expect(r.rows[0].auth_x, `${fn} authenticated`).toBe(false);
        expect(r.rows[0].svc_x, `${fn} service_role`).toBe(true);
      }
    });
  });

  it("autocadastro_idempotencia continua com FORCE RLS e sem policies", async () => {
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

// ---------------- fn_autocadastro_reservar ----------------
d("STAB10-C1.2-A — fn_autocadastro_reservar", () => {
  it("fingerprint vazio é rejeitado", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "fp-vazio");
      await expectReject(
        c,
        /PARAMETROS_INVALIDOS/,
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [KEY(), "", REQ(), inst, FUT()],
      );
    });
  });

  it("expires_at no passado é rejeitado", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "exp-passado");
      const passado = new Date(Date.now() - 1000).toISOString();
      await expectReject(
        c,
        /EXPIRACAO_INVALIDA/,
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [KEY(), FP, REQ(), inst, passado],
      );
    });
  });

  it("instituição inexistente é rejeitada", async () => {
    await withRollback(async (c) => {
      await expectReject(
        c,
        /INSTITUICAO_INEXISTENTE/,
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [KEY(), FP, REQ(), crypto.randomUUID(), FUT()],
      );
    });
  });

  it("reserva nova retorna RESERVADO_NOVO e grava linha reservado", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "reserva-nova");
      const k = KEY();
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, REQ(), inst, FUT()],
      );
      expect(r.rows[0].result_code).toBe("RESERVADO_NOVO");
      const row = await c.query(
        "SELECT status, tentativas FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [k],
      );
      expect(row.rows[0].status).toBe("reservado");
      expect(row.rows[0].tentativas).toBe(1);
    });
  });

  it("mesma chave + fingerprint devolve EM_ANDAMENTO e incrementa tentativas + updated_at", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "mesma-key");
      const k = KEY();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, REQ(), inst, FUT()],
      );
      const t1 = await c.query(
        "SELECT tentativas, updated_at FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [k],
      );
      // pequena pausa para garantir mudança de updated_at
      await new Promise((r) => setTimeout(r, 15));
      const r2 = await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, REQ(), inst, FUT()],
      );
      expect(r2.rows[0].result_code).toBe("EM_ANDAMENTO");
      const t2 = await c.query(
        "SELECT tentativas, updated_at FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [k],
      );
      expect(t2.rows[0].tentativas).toBe(2);
      expect(new Date(t2.rows[0].updated_at).getTime()).toBeGreaterThan(
        new Date(t1.rows[0].updated_at).getTime(),
      );
    });
  });

  it("mesma chave com fingerprint diferente rejeita IDEMPOTENCY_KEY_REUTILIZADA", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "fp-diff");
      const k = KEY();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, REQ(), inst, FUT()],
      );
      await expectReject(
        c,
        /IDEMPOTENCY_KEY_REUTILIZADA/,
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, "outro-fp", REQ(), inst, FUT()],
      );
    });
  });

  it("chave concluída retorna CONCLUIDO com user_id/assistido_id/instituicao_id", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "concluido");
      const k = KEY();
      const uid = await existingUserId(c);
      const assId = await seedAssistidoFixture(c, inst);
      await c.query(
        `INSERT INTO public.autocadastro_idempotencia
           (idempotency_key, request_fingerprint, status, request_id,
            instituicao_id, user_id, assistido_id, result_code, expires_at)
         VALUES ($1,$2,'concluido',$3,$4,$5,$6,'SUCESSO',$7)`,
        [k, FP, REQ(), inst, uid, assId, FUT()],
      );
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, REQ(), inst, FUT()],
      );
      expect(r.rows[0].result_code).toBe("CONCLUIDO");
      expect(r.rows[0].user_id).toBe(uid);
      expect(r.rows[0].assistido_id).toBe(assId);
      expect(r.rows[0].instituicao_id).toBe(inst);
    });
  });
});

// ---------------- fn_autocadastro_marcar_auth_criado ----------------
d("STAB10-C1.2-A — fn_autocadastro_marcar_auth_criado", () => {
  it("idempotência inexistente é rejeitada", async () => {
    await withRollback(async (c) => {
      await expectReject(
        c,
        /IDEMPOTENCIA_INEXISTENTE/,
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [KEY(), FP, REQ(), await existingUserId(c)],
      );
    });
  });

  it("fingerprint divergente é rejeitado", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "auth-fp");
      const k = KEY();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, REQ(), inst, FUT()],
      );
      await expectReject(
        c,
        /FINGERPRINT_DIVERGENTE/,
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, "outro", REQ(), await existingUserId(c)],
      );
    });
  });

  it("auth user inexistente é rejeitado", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "auth-nao-exi");
      const k = KEY();
      const req = REQ();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, req, inst, FUT()],
      );
      await expectReject(
        c,
        /AUTH_USER_INEXISTENTE/,
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, crypto.randomUUID()],
      );
    });
  });

  it("transição reservado → auth_criado grava user_id e result_code", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "trans-ok");
      const k = KEY();
      const req = REQ();
      const uid = await existingUserId(c);
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, req, inst, FUT()],
      );
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid],
      );
      expect(r.rows[0].result_code).toBe("AUTH_CRIADO");
      const row = await c.query(
        "SELECT status, user_id, result_code FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [k],
      );
      expect(row.rows[0].status).toBe("auth_criado");
      expect(row.rows[0].user_id).toBe(uid);
      expect(row.rows[0].result_code).toBe("AUTH_CRIADO");
    });
  });

  it("reexecução com o mesmo user_id é idempotente", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "auth-idem");
      const k = KEY();
      const req = REQ();
      const uid = await existingUserId(c);
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, req, inst, FUT()],
      );
      await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid],
      );
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid],
      );
      expect(r.rows[0].result_code).toBe("AUTH_CRIADO_IDEMPOTENTE");
    });
  });

  it("user_id divergente após auth_criado aborta", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "auth-div");
      const k = KEY();
      const req = REQ();
      const uid1 = await existingUserId(c);
      const uid2 = (
        await c.query("SELECT user_id FROM public.profiles WHERE user_id <> $1 LIMIT 1", [uid1])
      ).rows[0].user_id;
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, req, inst, FUT()],
      );
      await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid1],
      );
      await expectReject(
        c,
        /TRANSICAO_INVALIDA/,
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid2],
      );
    });
  });

  it("user_id já em outra idempotência ativa é rejeitado", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "user-em-uso");
      const uid = await existingUserId(c);
      const k1 = KEY();
      const r1 = REQ();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k1, FP, r1, inst, FUT()],
      );
      await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k1, FP, r1, uid],
      );
      const k2 = KEY();
      const r2 = REQ();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k2, FP, r2, inst, FUT()],
      );
      await expectReject(
        c,
        /USER_ID_JA_EM_USO/,
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k2, FP, r2, uid],
      );
    });
  });
});

// ---------------- fn_autocadastro_marcar_resultado_falha ----------------
d("STAB10-C1.2-A — fn_autocadastro_marcar_resultado_falha", () => {
  it("reservado → falhou (independente do flag auth_delete_ok)", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "res-falhou");
      const k = KEY();
      const req = REQ();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, req, inst, FUT()],
      );
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_resultado_falha($1,$2,$3,$4,$5)",
        [k, FP, req, "ERRO_X", true],
      );
      expect(r.rows[0].result_code).toBe("falhou");
    });
  });

  it("auth_criado + auth_delete_ok=true → falhou", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "auth-falhou");
      const uid = await existingUserId(c);
      const k = KEY();
      const req = REQ();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, req, inst, FUT()],
      );
      await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid],
      );
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_resultado_falha($1,$2,$3,$4,$5)",
        [k, FP, req, "ERRO_Y", true],
      );
      expect(r.rows[0].result_code).toBe("falhou");
    });
  });

  it("auth_criado + auth_delete_ok=false → rollback_falhou + auditoria com user_id NULL", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "rb-falhou");
      const uid = await existingUserId(c);
      const k = KEY();
      const req = REQ();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, req, inst, FUT()],
      );
      await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid],
      );
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_resultado_falha($1,$2,$3,$4,$5)",
        [k, FP, req, "ERRO_Z", false],
      );
      expect(r.rows[0].result_code).toBe("rollback_falhou");
      const aud = await c.query(
        `SELECT user_id, dados_novos FROM public.audit_logs
          WHERE acao='AUTOCADASTRO_ROLLBACK_FALHOU'
            AND (dados_novos->>'idempotency_key')::uuid = $1`,
        [k],
      );
      expect(aud.rowCount).toBe(1);
      expect(aud.rows[0].user_id).toBeNull();
      expect(aud.rows[0].dados_novos.result_code).toBe("ERRO_Z");
      // Sem PII
      const keys = Object.keys(aud.rows[0].dados_novos);
      for (const forbidden of ["email", "cpf", "celular", "nome", "senha", "ip", "captcha"]) {
        expect(keys.includes(forbidden), `PII proibida: ${forbidden}`).toBe(false);
      }
    });
  });

  it("concluído NUNCA pode voltar para falhou", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "concl-lock");
      const k = KEY();
      const req = REQ();
      const uid = await existingUserId(c);
      const assId = await seedAssistidoFixture(c, inst);
      await c.query(
        `INSERT INTO public.autocadastro_idempotencia
           (idempotency_key, request_fingerprint, status, request_id,
            instituicao_id, user_id, assistido_id, result_code, expires_at)
         VALUES ($1,$2,'concluido',$3,$4,$5,$6,'SUCESSO',$7)`,
        [k, FP, req, inst, uid, assId, FUT()],
      );
      await expectReject(
        c,
        /CONCLUIDO_NAO_REVERSIVEL/,
        "SELECT * FROM public.fn_autocadastro_marcar_resultado_falha($1,$2,$3,$4,$5)",
        [k, FP, req, "ERRO", true],
      );
    });
  });
});

// ---------------- fn_autocadastro_assistido_publico (rejeições) ----------------
d("STAB10-C1.2-A — fn_autocadastro_assistido_publico (rejeições)", () => {
  const NOME = "Fulano C12A";
  const EMAIL = "fulano-c12a@example.test";
  const CEL = "11987650000";
  const TERMOS = "v1";
  const PRIV = "v1";
  const ACEITO = new Date().toISOString();

  async function preparar(
    c: PoolClient,
    sufixo: string,
    opts: { habilitar?: boolean; status?: string; usarUid?: string } = {},
  ): Promise<{ inst: string; k: string; req: string; uid: string }> {
    const slug = `c12a-${sufixo}-${crypto.randomUUID().slice(0, 6)}`;
    const inst = (
      await c.query(
        `INSERT INTO public.instituicoes (nome, slug, status, autocadastro_habilitado)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [
          `C12A ${sufixo}`,
          slug,
          opts.status ?? "implantacao",
          opts.habilitar ?? true,
        ],
      )
    ).rows[0].id as string;
    const uid = opts.usarUid ?? (await existingUserId(c));
    const k = KEY();
    const req = REQ();
    await c.query(
      "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
      [k, FP, req, inst, FUT()],
    );
    return { inst, k, req, uid };
  }

  it("instituição sem autocadastro_habilitado é rejeitada", async () => {
    await withRollback(async (c) => {
      const { inst, k, req, uid } = await preparar(c, "inst-off", { habilitar: false });
      // Precisamos ainda passar por auth_criado; o fingerprint/req já estão setados.
      await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid],
      );
      await expectReject(
        c,
        /INSTITUICAO_NAO_ELEGIVEL/,
        `SELECT * FROM public.fn_autocadastro_assistido_publico(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [req, k, FP, inst, uid, EMAIL, NOME, "", CEL, TERMOS, PRIV, ACEITO],
      );
    });
  });

  it("transição inválida (ainda reservado) é rejeitada", async () => {
    await withRollback(async (c) => {
      const { inst, k, req, uid } = await preparar(c, "trans-inv");
      await expectReject(
        c,
        /TRANSICAO_INVALIDA/,
        `SELECT * FROM public.fn_autocadastro_assistido_publico(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [req, k, FP, inst, uid, EMAIL, NOME, "", CEL, TERMOS, PRIV, ACEITO],
      );
    });
  });

  it("email divergente de auth.users é rejeitado sem escrever nada em profiles/assistidos", async () => {
    await withRollback(async (c) => {
      const { inst, k, req, uid } = await preparar(c, "email-div");
      await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid],
      );
      const antesProf = (
        await c.query("SELECT count(*)::int n FROM public.profiles WHERE user_id=$1", [uid])
      ).rows[0].n;
      const antesAss = (
        await c.query(
          "SELECT count(*)::int n FROM public.assistidos WHERE user_id=$1 AND instituicao_id=$2",
          [uid, inst],
        )
      ).rows[0].n;
      await expectReject(
        c,
        /AUTH_EMAIL_DIVERGENTE/,
        `SELECT * FROM public.fn_autocadastro_assistido_publico(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [req, k, FP, inst, uid, EMAIL, NOME, "", CEL, TERMOS, PRIV, ACEITO],
      );
      const depoisProf = (
        await c.query("SELECT count(*)::int n FROM public.profiles WHERE user_id=$1", [uid])
      ).rows[0].n;
      const depoisAss = (
        await c.query(
          "SELECT count(*)::int n FROM public.assistidos WHERE user_id=$1 AND instituicao_id=$2",
          [uid, inst],
        )
      ).rows[0].n;
      expect(depoisProf).toBe(antesProf);
      expect(depoisAss).toBe(antesAss);
    });
  });

  it("profile já existente (para user real) leva a CADASTRO_JA_EXISTENTE", async () => {
    // O usuário real já tem profile → esperamos que a checagem de estado
    // virgem rejeite antes mesmo da verificação de email (que também
    // rejeitaria em produção; aqui exercitamos o guard defensivo).
    await withRollback(async (c) => {
      const { inst, k, req, uid } = await preparar(c, "prof-exi");
      await c.query(
        "SELECT * FROM public.fn_autocadastro_marcar_auth_criado($1,$2,$3,$4)",
        [k, FP, req, uid],
      );
      // Descobre o email real (via RPC admin-only) para pular AUTH_EMAIL_DIVERGENTE
      // e cair no CADASTRO_JA_EXISTENTE por profile existente.
      await actAs(c, ADMIN);
      const email = (
        await c.query(
          "SELECT email FROM public.lista_usuarios_email() WHERE user_id=$1",
          [uid],
        )
      ).rows[0]?.email;
      if (!email) return; // ambiente sem RPC → skip silencioso
      await expectReject(
        c,
        /CADASTRO_JA_EXISTENTE/,
        `SELECT * FROM public.fn_autocadastro_assistido_publico(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [req, k, FP, inst, uid, email, NOME, "", CEL, TERMOS, PRIV, ACEITO],
      );
    });
  });

  it("chave concluída retorna SUCESSO idempotente sem reescrever", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "concl-idem");
      const uid = await existingUserId(c);
      const assId = await seedAssistidoFixture(c, inst);
      const k = KEY();
      const req = REQ();
      await c.query(
        `INSERT INTO public.autocadastro_idempotencia
           (idempotency_key, request_fingerprint, status, request_id,
            instituicao_id, user_id, assistido_id, result_code, expires_at)
         VALUES ($1,$2,'concluido',$3,$4,$5,$6,'SUCESSO',$7)`,
        [k, FP, req, inst, uid, assId, FUT()],
      );
      const r = await c.query(
        `SELECT * FROM public.fn_autocadastro_assistido_publico(
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [req, k, FP, inst, uid, EMAIL, NOME, "", CEL, TERMOS, PRIV, ACEITO],
      );
      expect(r.rows[0].result_code).toBe("SUCESSO");
      expect(r.rows[0].assistido_id).toBe(assId);
    });
  });
});

// ---------------- Preservação de dados críticos ----------------
d("STAB10-C1.2-A — dados críticos permanecem inalterados", () => {
  it("FER continua em implantacao com autocadastro desabilitado", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        "SELECT status, autocadastro_habilitado, autocadastro_listado FROM public.instituicoes WHERE id=$1",
        [FER],
      );
      expect(r.rows[0].status).toBe("implantacao");
      expect(r.rows[0].autocadastro_habilitado).toBe(false);
      expect(r.rows[0].autocadastro_listado).toBe(false);
    });
  });

  it("nenhuma instituição foi habilitada por esta etapa", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        "SELECT count(*)::int n FROM public.instituicoes WHERE autocadastro_habilitado OR autocadastro_listado",
      );
      expect(r.rows[0].n).toBe(0);
    });
  });
});

// ============================================================
// SAAS-06-C1-STAB10-C1.2-A1 — Hardening: retomada canônica,
// concorrência de user_id (índice único parcial) e transições
// com ROW_COUNT.
// ============================================================
d("STAB10-C1.2-A1 — retomada canônica devolve request_id original", () => {
  it("RESERVADO_NOVO devolve canonical_request_id igual ao enviado", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "canon-novo");
      const k = KEY();
      const req = REQ();
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, req, inst, FUT()],
      );
      expect(r.rows[0].result_code).toBe("RESERVADO_NOVO");
      expect(r.rows[0].canonical_request_id).toBe(req);
    });
  });

  it("retentativa devolve o request_id original mesmo com p_request_id diferente", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "canon-em-and");
      const k = KEY();
      const reqOriginal = REQ();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, reqOriginal, inst, FUT()],
      );
      const reqNovo = REQ();
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, reqNovo, inst, FUT()],
      );
      expect(r.rows[0].result_code).toBe("EM_ANDAMENTO");
      expect(r.rows[0].canonical_request_id).toBe(reqOriginal);
    });
  });

  it("CONCLUIDO devolve canonical_request_id da linha original", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "canon-conc");
      const k = KEY();
      const reqOriginal = REQ();
      const uid = await existingUserId(c);
      const assId = await seedAssistidoFixture(c, inst);
      await c.query(
        `INSERT INTO public.autocadastro_idempotencia
           (idempotency_key, request_fingerprint, status, request_id,
            instituicao_id, user_id, assistido_id, result_code, expires_at)
         VALUES ($1,$2,'concluido',$3,$4,$5,$6,'SUCESSO',$7)`,
        [k, FP, reqOriginal, inst, uid, assId, FUT()],
      );
      const r = await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, REQ(), inst, FUT()],
      );
      expect(r.rows[0].result_code).toBe("CONCLUIDO");
      expect(r.rows[0].canonical_request_id).toBe(reqOriginal);
    });
  });
});

d("STAB10-C1.2-A1 — instituição divergente aborta sem alterar linha", () => {
  it("segundo chamado com instituicao_id diferente devolve INSTITUICAO_DIVERGENTE e mantém tentativas/updated_at", async () => {
    await withRollback(async (c) => {
      const instA = await fixtureInstituicao(c, "div-a");
      const instB = await fixtureInstituicao(c, "div-b");
      const k = KEY();
      await c.query(
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, REQ(), instA, FUT()],
      );
      const antes = await c.query(
        "SELECT tentativas, updated_at, instituicao_id FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [k],
      );
      await new Promise((r) => setTimeout(r, 10));
      await expectReject(
        c,
        /INSTITUICAO_DIVERGENTE/,
        "SELECT * FROM public.fn_autocadastro_reservar($1,$2,$3,$4,$5)",
        [k, FP, REQ(), instB, FUT()],
      );
      const depois = await c.query(
        "SELECT tentativas, updated_at, instituicao_id FROM public.autocadastro_idempotencia WHERE idempotency_key=$1",
        [k],
      );
      expect(depois.rows[0].tentativas).toBe(antes.rows[0].tentativas);
      expect(new Date(depois.rows[0].updated_at).getTime()).toBe(
        new Date(antes.rows[0].updated_at).getTime(),
      );
      expect(depois.rows[0].instituicao_id).toBe(instA);
    });
  });
});

d("STAB10-C1.2-A1 — índice único parcial de user_id ativo", () => {
  it("existe índice único parcial em user_id para estados ativos", async () => {
    await withRollback(async (c) => {
      const r = await c.query(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname='public'
            AND tablename='autocadastro_idempotencia'
            AND indexname='ux_autocadastro_idem_user_ativo'`,
      );
      expect(r.rowCount).toBe(1);
      expect(r.rows[0].indexdef).toMatch(/UNIQUE INDEX/);
      expect(r.rows[0].indexdef).toMatch(/user_id/);
      expect(r.rows[0].indexdef).toMatch(/reservado/);
      expect(r.rows[0].indexdef).toMatch(/auth_criado/);
    });
  });

  it("INSERT direto violando o índice é bloqueado pelo próprio banco", async () => {
    await withRollback(async (c) => {
      const inst = await fixtureInstituicao(c, "idx-user");
      const uid = await existingUserId(c);
      await c.query(
        `INSERT INTO public.autocadastro_idempotencia
           (idempotency_key, request_fingerprint, status, request_id,
            instituicao_id, user_id, expires_at)
         VALUES ($1,$2,'auth_criado',$3,$4,$5,$6)`,
        [KEY(), FP, REQ(), inst, uid, FUT()],
      );
      await expectReject(
        c,
        /ux_autocadastro_idem_user_ativo|unique/i,
        `INSERT INTO public.autocadastro_idempotencia
           (idempotency_key, request_fingerprint, status, request_id,
            instituicao_id, user_id, expires_at)
         VALUES ($1,$2,'reservado',$3,$4,$5,$6)`,
        [KEY(), FP, REQ(), inst, uid, FUT()],
      );
    });
  });
});
