/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01 — E2E das correções do hardening A1.
 *
 * FIX01-R1.b — Cleanup ESTRITO:
 *   - Trackers cirúrgicos (auditRefs, auditIds, idempotencyKeys, userRoles,
 *     instituicaoUsuarios, assistidos, authUsers, instituicoes).
 *   - Cleanup exclusivo via `cleanupTracked(tracker, { strict: true })`.
 *   - Auditorias resolvidas por (ação + registro_id + idempotency_key) antes
 *     do DELETE por audit_logs.id.
 *   - Zero resíduos estrutural (falha se qualquer linha rastreada permanecer).
 *   - Nada de DELETE por instituição, ação isolada, filtro JSON ou user_id
 *     em tabelas com id técnico rastreável.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  HAS_STAB10A3,
  newTracker,
  emailFor,
  adminCreateAuthUser,
  adminDeleteAuthUser,
  adminGetAuthUser,
  seedInstituicaoEfemera,
  cleanupTracked,
  residuosFinais,
  closeStab10A3Pool,
  type CreatedIds,
} from "./_stab10a3Fixtures";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function rpc<T = any>(fn: string, body: Record<string, unknown>): Promise<{ status: number; ok: boolean; body: T }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const b = (await r.json().catch(() => null)) as T;
  return { status: r.status, ok: r.ok, body: b };
}

async function svcRow<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  return ((await r.json().catch(() => null)) as T[]) ?? [];
}

async function habilitarInst(id: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/instituicoes?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ autocadastro_habilitado: true }),
  });
  expect(r.ok).toBe(true);
}

const d = HAS_STAB10A3 ? describe : describe.skip;

d("STAB10-C1.2-A1-FIX01 — E2E correções do hardening A1", () => {
  const tracker: CreatedIds = newTracker();
  const runId = crypto.randomUUID().slice(0, 8);
  let instId = "";

  beforeAll(async () => {
    const inst = await seedInstituicaoEfemera(tracker, `fix01-${runId}`);
    instId = inst.id;
    await habilitarInst(instId);
  }, 60_000);

  afterAll(async () => {
    try {
      // FIX01-R1.c-FIX01 — cleanup strict NUNCA lança.
      const { auditIssues, cleanupErrors } = await cleanupTracked(tracker, { strict: true });

      // Zero resíduos ESTRUTURAL — verificado ANTES de qualquer erro agregado.
      const residuos = await residuosFinais(tracker);
      for (const [chave, quantidade] of Object.entries(residuos)) {
        expect(quantidade, `residuo ${chave}`).toBe(0);
      }

      // Erro agregado somente APÓS a comprovação de zero resíduos.
      const erros = [
        ...cleanupErrors,
        ...auditIssues.map(
          (issue) =>
            `${issue.code} acao=${issue.acao} ` +
            `registro_id=${issue.registroId} ` +
            `idempotency_key=${issue.idempotencyKey} ` +
            `quantidade=${issue.quantidade}`,
        ),
      ];
      if (erros.length > 0) {
        throw new Error(`[cleanup strict] ${erros.join(" | ")}`);
      }
    } finally {
      await closeStab10A3Pool();
    }
  }, 60_000);

  it("retomada canônica: crash antes de finalizar; nova reserva devolve canonical_request_id=R1", async () => {
    const email = emailFor("fix01-retomada", runId);
    const pwd = `Fx1!${crypto.randomUUID().slice(0, 8)}`;
    const uid = await adminCreateAuthUser(email, pwd);
    tracker.authUsers.push(uid);
    tracker.emails.push(email);

    const key = crypto.randomUUID();
    tracker.idempotencyKeys.push(key);
    const R1 = crypto.randomUUID();
    const fp = `fp-fix01-${runId}`;
    const exp = new Date(Date.now() + 10 * 60_000).toISOString();

    const r1 = await rpc("fn_autocadastro_reservar", {
      p_idempotency_key: key, p_request_fingerprint: fp, p_request_id: R1,
      p_instituicao_id: instId, p_expires_at: exp,
    });
    expect(r1.ok).toBe(true);
    expect(r1.body[0].result_code).toBe("RESERVADO_NOVO");

    const r2 = await rpc("fn_autocadastro_marcar_auth_criado", {
      p_idempotency_key: key, p_request_fingerprint: fp, p_request_id: R1, p_user_id: uid,
    });
    expect(r2.ok).toBe(true);
    expect(r2.body[0].result_code).toBe("AUTH_CRIADO");

    const R2 = crypto.randomUUID();
    const r3 = await rpc("fn_autocadastro_reservar", {
      p_idempotency_key: key, p_request_fingerprint: fp, p_request_id: R2,
      p_instituicao_id: instId, p_expires_at: exp,
    });
    expect(r3.ok, JSON.stringify(r3.body)).toBe(true);
    expect(r3.body[0].canonical_request_id).toBe(R1);

    const r4 = await rpc<any>("fn_autocadastro_assistido_publico", {
      p_request_id: R1, p_idempotency_key: key, p_request_fingerprint: fp,
      p_instituicao_id: instId, p_user_id: uid, p_email_normalizado: email,
      p_nome_completo: `FIX01 Retomada ${runId}`, p_cpf_normalizado: "",
      p_celular_normalizado: "11" + Math.floor(900000000 + Math.random() * 99999999).toString().slice(0, 9),
      p_termos_versao: "v1.0", p_privacidade_versao: "v1.0",
      p_aceito_em: new Date().toISOString(),
    });
    // FIX01-R1.c-FIX01 — normalizar payload PostgREST e registrar tracking
    // ANTES de qualquer expect sobre a resposta.
    const r4raw: any = r4.body;
    const r4row = Array.isArray(r4raw)
      ? r4raw[0]
      : Array.isArray(r4raw?.data)
        ? r4raw.data[0]
        : r4raw?.data ?? r4raw ?? {};
    const assistidoId = r4row?.assistido_id;
    if (assistidoId) {
      if (!tracker.assistidos.includes(assistidoId)) tracker.assistidos.push(assistidoId);
      tracker.auditRefs.push({
        acao: "AUTOCADASTRO_PUBLICO_ASSISTIDO",
        registroId: assistidoId,
        idempotencyKey: key,
      });
    }
    expect(r4.ok, JSON.stringify(r4.body)).toBe(true);
    expect(r4row?.result_code).toBe("SUCESSO");
    expect(assistidoId).toBeTruthy();

    const [p, ur, a, iu, aud] = await Promise.all([
      svcRow(`profiles?user_id=eq.${uid}&select=user_id`),
      svcRow<{ id: string }>(`user_roles?user_id=eq.${uid}&role=eq.assistido&select=id`),
      svcRow(`assistidos?user_id=eq.${uid}&instituicao_id=eq.${instId}&select=id`),
      svcRow<{ id: string }>(`instituicao_usuarios?user_id=eq.${uid}&instituicao_id=eq.${instId}&select=id`),
      svcRow<{ id: string }>(
        `audit_logs?acao=eq.AUTOCADASTRO_PUBLICO_ASSISTIDO&registro_id=eq.${assistidoId}&select=id`,
      ),
    ]);
    expect(p.length).toBe(1);
    expect(ur.length).toBe(1);
    expect(a.length).toBe(1);
    expect(iu.length).toBe(1);
    expect(aud.length).toBe(1);
    tracker.userRoles.push(ur[0].id);
    tracker.instituicaoUsuarios.push(iu[0].id);
  }, 45_000);

  it("concorrência real: duas keys em Promise.all disputam o mesmo Auth user; 1 vencedora, 1 USER_ID_JA_EM_USO", async () => {
    const email = emailFor("fix01-conc", runId);
    const pwd = `Fx1!${crypto.randomUUID().slice(0, 8)}`;
    const uid = await adminCreateAuthUser(email, pwd);
    tracker.authUsers.push(uid);
    tracker.emails.push(email);

    const fp = `fp-fix01-conc-${runId}`;
    const exp = new Date(Date.now() + 10 * 60_000).toISOString();
    const kA = crypto.randomUUID();
    const rA = crypto.randomUUID();
    const kB = crypto.randomUUID();
    const rB = crypto.randomUUID();
    tracker.idempotencyKeys.push(kA, kB);

    await Promise.all([
      rpc("fn_autocadastro_reservar", {
        p_idempotency_key: kA, p_request_fingerprint: fp, p_request_id: rA,
        p_instituicao_id: instId, p_expires_at: exp,
      }),
      rpc("fn_autocadastro_reservar", {
        p_idempotency_key: kB, p_request_fingerprint: fp, p_request_id: rB,
        p_instituicao_id: instId, p_expires_at: exp,
      }),
    ]);

    const [resA, resB] = await Promise.all([
      rpc("fn_autocadastro_marcar_auth_criado", {
        p_idempotency_key: kA, p_request_fingerprint: fp, p_request_id: rA, p_user_id: uid,
      }),
      rpc("fn_autocadastro_marcar_auth_criado", {
        p_idempotency_key: kB, p_request_fingerprint: fp, p_request_id: rB, p_user_id: uid,
      }),
    ]);

    const results = [resA, resB];
    const winners = results.filter((r) => r.ok && r.body?.[0]?.result_code === "AUTH_CRIADO");
    const losers = results.filter((r) => !r.ok && JSON.stringify(r.body).includes("USER_ID_JA_EM_USO"));
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
  }, 45_000);

  it("rollback_falhou bloqueia nova associação do mesmo user_id; AUTH_DELETE_NAO_CONFIRMADO respeita evidência", async () => {
    const email = emailFor("fix01-rf", runId);
    const pwd = `Fx1!${crypto.randomUUID().slice(0, 8)}`;
    const uid = await adminCreateAuthUser(email, pwd);
    tracker.authUsers.push(uid);
    tracker.emails.push(email);

    const fp = `fp-fix01-rf-${runId}`;
    const exp = new Date(Date.now() + 10 * 60_000).toISOString();
    const k1 = crypto.randomUUID();
    const r1 = crypto.randomUUID();
    const k2 = crypto.randomUUID();
    const r2 = crypto.randomUUID();
    tracker.idempotencyKeys.push(k1, k2);

    await rpc("fn_autocadastro_reservar", {
      p_idempotency_key: k1, p_request_fingerprint: fp, p_request_id: r1,
      p_instituicao_id: instId, p_expires_at: exp,
    });
    const ac = await rpc("fn_autocadastro_marcar_auth_criado", {
      p_idempotency_key: k1, p_request_fingerprint: fp, p_request_id: r1, p_user_id: uid,
    });
    expect(ac.body[0].result_code).toBe("AUTH_CRIADO");

    const fail1 = await rpc("fn_autocadastro_marcar_resultado_falha", {
      p_idempotency_key: k1, p_request_fingerprint: fp, p_request_id: r1,
      p_resultado: "TIMEOUT", p_auth_delete_ok: true,
    });
    expect(fail1.ok).toBe(false);
    expect(JSON.stringify(fail1.body)).toContain("AUTH_DELETE_NAO_CONFIRMADO");

    const linha = (await svcRow<any>(`autocadastro_idempotencia?idempotency_key=eq.${k1}&select=status,user_id,result_code`))[0];
    expect(linha.status).toBe("auth_criado");
    expect(linha.user_id).toBe(uid);
    expect(linha.result_code).toBe("AUTH_CRIADO");

    // FIX01-R1.c — tracking fail-safe: registrar auditRef ANTES da RPC.
    // acao, registro_id (uid Auth) e idempotency_key (k1) já são conhecidos.
    tracker.auditRefs.push({
      acao: "AUTOCADASTRO_ROLLBACK_FALHOU",
      registroId: uid,
      idempotencyKey: k1,
    });
    const fail2 = await rpc("fn_autocadastro_marcar_resultado_falha", {
      p_idempotency_key: k1, p_request_fingerprint: fp, p_request_id: r1,
      p_resultado: "ROLLBACK_APP", p_auth_delete_ok: false,
    });
    expect(fail2.ok).toBe(true);
    expect(fail2.body[0].result_code).toBe("rollback_falhou");

    await rpc("fn_autocadastro_reservar", {
      p_idempotency_key: k2, p_request_fingerprint: fp, p_request_id: r2,
      p_instituicao_id: instId, p_expires_at: exp,
    });
    const bloq = await rpc("fn_autocadastro_marcar_auth_criado", {
      p_idempotency_key: k2, p_request_fingerprint: fp, p_request_id: r2, p_user_id: uid,
    });
    expect(bloq.ok).toBe(false);
    expect(JSON.stringify(bloq.body)).toContain("USER_ID_JA_EM_USO");
  }, 45_000);

  it("delete real via Admin API → FK zera user_id → auth_criado → falhou permitido", async () => {
    const email = emailFor("fix01-del", runId);
    const pwd = `Fx1!${crypto.randomUUID().slice(0, 8)}`;
    const uid = await adminCreateAuthUser(email, pwd);
    tracker.emails.push(email);
    // NÃO push em authUsers — vamos deletar aqui mesmo (Auth removido antes do afterAll).

    const fp = `fp-fix01-del-${runId}`;
    const exp = new Date(Date.now() + 10 * 60_000).toISOString();
    const k = crypto.randomUUID();
    const req = crypto.randomUUID();
    tracker.idempotencyKeys.push(k);

    await rpc("fn_autocadastro_reservar", {
      p_idempotency_key: k, p_request_fingerprint: fp, p_request_id: req,
      p_instituicao_id: instId, p_expires_at: exp,
    });
    await rpc("fn_autocadastro_marcar_auth_criado", {
      p_idempotency_key: k, p_request_fingerprint: fp, p_request_id: req, p_user_id: uid,
    });

    await adminDeleteAuthUser(uid);
    const linha = (await svcRow<any>(`autocadastro_idempotencia?idempotency_key=eq.${k}&select=status,user_id`))[0];
    expect(linha.status).toBe("auth_criado");
    expect(linha.user_id).toBe(null);
    expect(await adminGetAuthUser(uid)).toBe(null);

    const ok = await rpc("fn_autocadastro_marcar_resultado_falha", {
      p_idempotency_key: k, p_request_fingerprint: fp, p_request_id: req,
      p_resultado: "AUTH_DELETADO_OK", p_auth_delete_ok: true,
    });
    expect(ok.ok, JSON.stringify(ok.body)).toBe(true);
    expect(ok.body[0].result_code).toBe("falhou");
  }, 60_000);

  it("anon e authenticated continuam sem executar as RPCs", async () => {
    const email = emailFor("fix01-perm", runId);
    const pwd = `Fx1!${crypto.randomUUID().slice(0, 8)}`;
    const uid = await adminCreateAuthUser(email, pwd);
    tracker.authUsers.push(uid);
    tracker.emails.push(email);

    const anon = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_autocadastro_marcar_resultado_falha`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_idempotency_key: crypto.randomUUID(), p_request_fingerprint: "x",
        p_request_id: crypto.randomUUID(), p_resultado: "x", p_auth_delete_ok: false,
      }),
    });
    expect([401, 403, 404]).toContain(anon.status);

    const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pwd }),
    });
    const jwt = (await login.json()).access_token as string;
    const authed = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_autocadastro_marcar_resultado_falha`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_idempotency_key: crypto.randomUUID(), p_request_fingerprint: "x",
        p_request_id: crypto.randomUUID(), p_resultado: "x", p_auth_delete_ok: false,
      }),
    });
    expect([401, 403, 404]).toContain(authed.status);
  }, 30_000);
});
