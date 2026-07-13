/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01 — E2E das correções do hardening A1:
 *
 *   - Retomada canônica (canonical_request_id) após crash antes da finalização.
 *   - Concorrência real via Promise.all em `fn_autocadastro_marcar_auth_criado`.
 *   - Índice único bloqueia reuso do mesmo user_id em `concluido` e
 *     `rollback_falhou`.
 *   - `AUTH_DELETE_NAO_CONFIRMADO` antes do delete real; transição válida
 *     depois que a Admin API remove o usuário e a FK ON DELETE SET NULL
 *     limpa `user_id`.
 *   - anon / authenticated permanecem sem execução.
 *   - Cleanup namespaced sem resíduos.
 *
 * FIX01-R1 — Cleanup cirúrgico:
 *   - `audit_logs` só é removido por `audit_logs.id`, previamente localizado
 *     pela combinação (ação, registro_id) rastreada por assistido.
 *   - `autocadastro_idempotencia` só é removida por `idempotency_key` rastreada.
 *   - Auth é removido por último, sempre depois das auditorias.
 *   - Nenhum DELETE roda com tracker vazio.
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

  // Trackers cirúrgicos (FIX01-R1).
  const idempotencyKeys: string[] = [];
  const auditIds = new Set<string>();
  let auditosRemovidos = 0;

  beforeAll(async () => {
    const inst = await seedInstituicaoEfemera(tracker, `fix01-${runId}`);
    instId = inst.id;
    await habilitarInst(instId);
  }, 60_000);

  afterAll(async () => {
    const hdr = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

    // 1) audit_logs — coletar IDs por (ação, registro_id) por assistido rastreado
    //    e DELETE somente por audit_logs.id.
    for (const aid of tracker.assistidos) {
      const r = await svcRow<{ id: string }>(
        `audit_logs?acao=eq.AUTOCADASTRO_PUBLICO_ASSISTIDO&registro_id=eq.${aid}&select=id`,
      );
      for (const row of r) auditIds.add(row.id);
    }
    for (const auditId of auditIds) {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs?id=eq.${auditId}`, {
        method: "DELETE",
        headers: hdr,
      });
      if (del.ok) auditosRemovidos++;
    }

    // 2) autocadastro_idempotencia — DELETE somente por idempotency_key rastreada.
    for (const key of idempotencyKeys) {
      await fetch(`${SUPABASE_URL}/rest/v1/autocadastro_idempotencia?idempotency_key=eq.${key}`, {
        method: "DELETE",
        headers: hdr,
      });
    }

    try { await cleanupTracked(tracker); } finally {
      try {
        const res = await residuosFinais(tracker);
        for (const [k, n] of Object.entries(res)) {
          if (!/instituicoes\.prefix|assistidos\.prefix/.test(k)) {
            expect(n, `resíduo em ${k}`).toBe(0);
          }
        }
      } finally {
        await closeStab10A3Pool();
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[fix01] auditosRemovidos=${auditosRemovidos}`);
  }, 60_000);

  it("retomada canônica: crash antes de finalizar; nova reserva devolve canonical_request_id=R1", async () => {
    const email = emailFor("fix01-retomada", runId);
    const pwd = `Fx1!${crypto.randomUUID().slice(0, 8)}`;
    const uid = await adminCreateAuthUser(email, pwd);
    tracker.authUsers.push(uid);
    tracker.emails.push(email);

    const key = crypto.randomUUID();
    idempotencyKeys.push(key);
    const R1 = crypto.randomUUID();
    const fp = `fp-fix01-${runId}`;
    const exp = new Date(Date.now() + 10 * 60_000).toISOString();

    // Reserva R1
    const r1 = await rpc("fn_autocadastro_reservar", {
      p_idempotency_key: key,
      p_request_fingerprint: fp,
      p_request_id: R1,
      p_instituicao_id: instId,
      p_expires_at: exp,
    });
    expect(r1.ok).toBe(true);
    expect(r1.body[0].result_code).toBe("RESERVADO_NOVO");

    // Marca auth_criado
    const r2 = await rpc("fn_autocadastro_marcar_auth_criado", {
      p_idempotency_key: key,
      p_request_fingerprint: fp,
      p_request_id: R1,
      p_user_id: uid,
    });
    expect(r2.ok).toBe(true);
    expect(r2.body[0].result_code).toBe("AUTH_CRIADO");

    // "Crash": não finaliza. Nova reserva com R2 sobre a mesma key.
    const R2 = crypto.randomUUID();
    const r3 = await rpc("fn_autocadastro_reservar", {
      p_idempotency_key: key,
      p_request_fingerprint: fp,
      p_request_id: R2,
      p_instituicao_id: instId,
      p_expires_at: exp,
    });
    expect(r3.ok, JSON.stringify(r3.body)).toBe(true);
    const row = r3.body[0];
    expect(row.canonical_request_id).toBe(R1);

    // Finaliza usando R1
    const r4 = await rpc("fn_autocadastro_assistido_publico", {
      p_request_id: R1,
      p_idempotency_key: key,
      p_request_fingerprint: fp,
      p_instituicao_id: instId,
      p_user_id: uid,
      p_email_normalizado: email,
      p_nome_completo: `FIX01 Retomada ${runId}`,
      p_cpf_normalizado: "",
      p_celular_normalizado: "11" + Math.floor(900000000 + Math.random() * 99999999).toString().slice(0, 9),
      p_termos_versao: "v1.0",
      p_privacidade_versao: "v1.0",
      p_aceito_em: new Date().toISOString(),
    });
    expect(r4.ok, JSON.stringify(r4.body)).toBe(true);
    expect(r4.body[0].result_code).toBe("SUCESSO");
    tracker.assistidos.push(r4.body[0].assistido_id);

    // Uma única criação em cada tabela
    const [p, ur, a, iu, aud] = await Promise.all([
      svcRow(`profiles?user_id=eq.${uid}&select=user_id`),
      svcRow(`user_roles?user_id=eq.${uid}&role=eq.assistido&select=id`),
      svcRow(`assistidos?user_id=eq.${uid}&instituicao_id=eq.${instId}&select=id`),
      svcRow(`instituicao_usuarios?user_id=eq.${uid}&instituicao_id=eq.${instId}&select=id`),
      svcRow<{ id: string }>(
        `audit_logs?acao=eq.AUTOCADASTRO_PUBLICO_ASSISTIDO&registro_id=eq.${r4.body[0].assistido_id}&select=id`,
      ),
    ]);
    expect(p.length).toBe(1);
    expect(ur.length).toBe(1);
    expect(a.length).toBe(1);
    expect(iu.length).toBe(1);
    expect(aud.length).toBe(1);
    for (const row of aud) auditIds.add(row.id);
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
    idempotencyKeys.push(kA, kB);

    // Duas reservas independentes
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

    // Duas chamadas concorrentes de marcar_auth_criado com o mesmo user_id
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
    idempotencyKeys.push(k1, k2);

    await rpc("fn_autocadastro_reservar", {
      p_idempotency_key: k1, p_request_fingerprint: fp, p_request_id: r1,
      p_instituicao_id: instId, p_expires_at: exp,
    });
    const ac = await rpc("fn_autocadastro_marcar_auth_criado", {
      p_idempotency_key: k1, p_request_fingerprint: fp, p_request_id: r1, p_user_id: uid,
    });
    expect(ac.body[0].result_code).toBe("AUTH_CRIADO");

    // AUTH_DELETE_NAO_CONFIRMADO: p_auth_delete_ok=true antes do delete real
    const fail1 = await rpc("fn_autocadastro_marcar_resultado_falha", {
      p_idempotency_key: k1, p_request_fingerprint: fp, p_request_id: r1,
      p_resultado: "TIMEOUT", p_auth_delete_ok: true,
    });
    expect(fail1.ok).toBe(false);
    expect(JSON.stringify(fail1.body)).toContain("AUTH_DELETE_NAO_CONFIRMADO");

    // Linha permanece inalterada (status auth_criado + user_id preservado)
    const linha = (await svcRow<any>(`autocadastro_idempotencia?idempotency_key=eq.${k1}&select=status,user_id,result_code`))[0];
    expect(linha.status).toBe("auth_criado");
    expect(linha.user_id).toBe(uid);
    expect(linha.result_code).toBe("AUTH_CRIADO");

    // Rollback falhou (p_auth_delete_ok=false) — preserva user_id
    const fail2 = await rpc("fn_autocadastro_marcar_resultado_falha", {
      p_idempotency_key: k1, p_request_fingerprint: fp, p_request_id: r1,
      p_resultado: "ROLLBACK_APP", p_auth_delete_ok: false,
    });
    expect(fail2.ok).toBe(true);
    expect(fail2.body[0].result_code).toBe("rollback_falhou");

    // Nova key tentando associar mesmo user_id → USER_ID_JA_EM_USO (bloqueado pelo índice)
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
    // NÃO push em authUsers — vamos deletar aqui mesmo.

    const fp = `fp-fix01-del-${runId}`;
    const exp = new Date(Date.now() + 10 * 60_000).toISOString();
    const k = crypto.randomUUID();
    const req = crypto.randomUUID();
    idempotencyKeys.push(k);

    await rpc("fn_autocadastro_reservar", {
      p_idempotency_key: k, p_request_fingerprint: fp, p_request_id: req,
      p_instituicao_id: instId, p_expires_at: exp,
    });
    await rpc("fn_autocadastro_marcar_auth_criado", {
      p_idempotency_key: k, p_request_fingerprint: fp, p_request_id: req, p_user_id: uid,
    });

    // Delete real via Admin API
    await adminDeleteAuthUser(uid);
    // FK ON DELETE SET NULL zerou user_id?
    const linha = (await svcRow<any>(`autocadastro_idempotencia?idempotency_key=eq.${k}&select=status,user_id`))[0];
    expect(linha.status).toBe("auth_criado");
    expect(linha.user_id).toBe(null);
    // Confirma que Auth foi realmente removido
    expect(await adminGetAuthUser(uid)).toBe(null);

    // Agora sim, auth_criado → falhou é permitido
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

    // anon — usa key aleatória (bloqueado antes de gravar); não rastreamos.
    const anon = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_autocadastro_marcar_resultado_falha`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_idempotency_key: crypto.randomUUID(), p_request_fingerprint: "x",
        p_request_id: crypto.randomUUID(), p_resultado: "x", p_auth_delete_ok: false,
      }),
    });
    expect([401, 403, 404]).toContain(anon.status);

    // authenticated
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
