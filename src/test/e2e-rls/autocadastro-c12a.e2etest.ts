/**
 * SAAS-06-C1-STAB10-C1.2-A — E2E do backend transacional do autocadastro
 * tenant-aware. Cobre o caminho feliz e a reexecução idempotente da
 * finalização, executando as três RPCs internas via service_role REST.
 *
 * O E2E depende do mesmo conjunto de credenciais dos demais testes E2E
 * (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY,
 * PG*). Cria SEMPRE uma instituição efêmera habilitada + um Auth user novo
 * via Admin API; ao final remove tudo por IDs rastreados.
 *
 * FIX01-R1 — Cleanup cirúrgico:
 *   - `audit_logs` só é removido por `id`, previamente localizado pela
 *     combinação (ação, registro_id) rastreada; jamais por user_id, tabela,
 *     ou filtro amplo.
 *   - `autocadastro_idempotencia` só é removida por `idempotency_key` rastreada.
 *   - Auth é removido por último, sempre depois das auditorias.
 *   - Nenhum DELETE é emitido com tracker vazio.
 *
 * Restrições: NÃO invoca Edge Function pública (que não existe nesta etapa),
 * NÃO habilita a FER, NÃO usa contas reais.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  HAS_STAB10A3,
  newTracker,
  emailFor,
  adminCreateAuthUser,
  seedInstituicaoEfemera,
  cleanupTracked,
  residuosFinais,
  closeStab10A3Pool,
  type CreatedIds,
} from "./_stab10a3Fixtures";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function rpcSvc<T = any>(fn: string, body: Record<string, unknown>): Promise<{ status: number; ok: boolean; body: T }> {
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

async function restSvcGet<T = any>(path: string): Promise<{ status: number; body: T }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const b = (await r.json().catch(() => null)) as T;
  return { status: r.status, body: b };
}

/** Chama uma RPC autenticado como usuário comum — deve falhar. */
async function rpcAsAuthenticated(fn: string, body: Record<string, unknown>, jwt: string): Promise<number> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return r.status;
}

const d = HAS_STAB10A3 ? describe : describe.skip;

d("STAB10-C1.2-A — E2E backend transacional do autocadastro", () => {
  const tracker: CreatedIds = newTracker();
  const runId = crypto.randomUUID().slice(0, 8);
  let instId = "";
  let userId = "";
  let email = "";
  const password = `Auto!C12A!${crypto.randomUUID().slice(0, 8)}`;
  const idempKey = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  const fingerprint = `fp-${runId}`;

  // Trackers cirúrgicos (FIX01-R1) — cleanup por chave/id rastreado.
  const idempotencyKeys: string[] = [idempKey];
  const auditIds = new Set<string>();
  let auditosRemovidos = 0;

  beforeAll(async () => {
    const inst = await seedInstituicaoEfemera(tracker, `c12a-${runId}`);
    instId = inst.id;
    // Habilita autocadastro na instituição efêmera (única deste run).
    const patch = await fetch(`${SUPABASE_URL}/rest/v1/instituicoes?id=eq.${instId}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ autocadastro_habilitado: true }),
    });
    expect(patch.ok).toBe(true);

    email = emailFor("c12a-autocad", `${runId}`);
    userId = await adminCreateAuthUser(email, password);
    tracker.authUsers.push(userId);
    tracker.emails.push(email);
  }, 60_000);

  afterAll(async () => {
    const svcHdr = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

    // 1) audit_logs — coletar IDs por (ação, registro_id) rastreados; DELETE só por id.
    for (const aid of tracker.assistidos) {
      const r = await restSvcGet<Array<{ id: string }>>(
        `audit_logs?acao=eq.AUTOCADASTRO_PUBLICO_ASSISTIDO&registro_id=eq.${aid}&select=id`,
      );
      for (const row of r.body ?? []) auditIds.add(row.id);
    }
    for (const auditId of auditIds) {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/audit_logs?id=eq.${auditId}`, {
        method: "DELETE",
        headers: svcHdr,
      });
      if (del.ok) auditosRemovidos++;
    }

    // 2) autocadastro_idempotencia — DELETE somente por idempotency_key rastreada.
    for (const key of idempotencyKeys) {
      await fetch(`${SUPABASE_URL}/rest/v1/autocadastro_idempotencia?idempotency_key=eq.${key}`, {
        method: "DELETE",
        headers: svcHdr,
      });
    }

    // 3) Estruturas públicas + Auth por último via cleanupTracked (por IDs).
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
    // Diagnóstico: quantidade de audit_logs removidos por id.
    // eslint-disable-next-line no-console
    console.log(`[c12a] auditosRemovidos=${auditosRemovidos}`);
  }, 60_000);

  it("caminho feliz: reservar → auth criado → finalizar cria estado consistente", async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    // 1) reservar
    const r1 = await rpcSvc("fn_autocadastro_reservar", {
      p_idempotency_key: idempKey,
      p_request_fingerprint: fingerprint,
      p_request_id: requestId,
      p_instituicao_id: instId,
      p_expires_at: expiresAt,
    });
    expect(r1.ok, JSON.stringify(r1.body)).toBe(true);
    expect(r1.body[0].result_code).toBe("RESERVADO_NOVO");

    // 2) marcar auth_criado
    const r2 = await rpcSvc("fn_autocadastro_marcar_auth_criado", {
      p_idempotency_key: idempKey,
      p_request_fingerprint: fingerprint,
      p_request_id: requestId,
      p_user_id: userId,
    });
    expect(r2.ok, JSON.stringify(r2.body)).toBe(true);
    expect(r2.body[0].result_code).toBe("AUTH_CRIADO");

    // 3) finalizar
    const r3 = await rpcSvc<Array<{ result_code: string; assistido_id: string; instituicao_id: string }>>(
      "fn_autocadastro_assistido_publico",
      {
        p_request_id: requestId,
        p_idempotency_key: idempKey,
        p_request_fingerprint: fingerprint,
        p_instituicao_id: instId,
        p_user_id: userId,
        p_email_normalizado: email,
        p_nome_completo: `Autocadastro C12A ${runId}`,
        p_cpf_normalizado: "",
        p_celular_normalizado: "11" + Math.floor(900000000 + Math.random() * 99999999).toString().slice(0, 9),
        p_termos_versao: "v1.0",
        p_privacidade_versao: "v1.0",
        p_aceito_em: new Date().toISOString(),
      },
    );
    expect(r3.ok, JSON.stringify(r3.body)).toBe(true);
    const row = r3.body[0];
    expect(row.result_code).toBe("SUCESSO");
    expect(row.instituicao_id).toBe(instId);
    expect(row.assistido_id).toBeTruthy();
    tracker.assistidos.push(row.assistido_id);

    // Asserções — exatamente 1 de cada
    const [prof, roles, ass, vin, aud, idem] = await Promise.all([
      restSvcGet<any[]>(`profiles?user_id=eq.${userId}&select=user_id,nome_completo,status`),
      restSvcGet<any[]>(`user_roles?user_id=eq.${userId}&role=eq.assistido&select=id`),
      restSvcGet<any[]>(`assistidos?id=eq.${row.assistido_id}&select=id,user_id,instituicao_id,status,email,celular`),
      restSvcGet<any[]>(`instituicao_usuarios?user_id=eq.${userId}&instituicao_id=eq.${instId}&select=id,papel_local,status`),
      restSvcGet<any[]>(`audit_logs?registro_id=eq.${row.assistido_id}&acao=eq.AUTOCADASTRO_PUBLICO_ASSISTIDO&select=id,user_id,dados_novos`),
      restSvcGet<any[]>(`autocadastro_idempotencia?idempotency_key=eq.${idempKey}&select=status,assistido_id,result_code,user_id`),
    ]);
    expect(prof.body).toHaveLength(1);
    expect(prof.body[0].status).toBe("ativo");
    expect(roles.body).toHaveLength(1);
    expect(ass.body).toHaveLength(1);
    expect(ass.body[0].instituicao_id).toBe(instId);
    expect(ass.body[0].user_id).toBe(userId);
    expect(ass.body[0].status).toBe("aguardando_palestras");
    expect(vin.body).toHaveLength(1);
    expect(vin.body[0].papel_local).toBe("assistido");
    expect(vin.body[0].status).toBe("ativo");
    expect(aud.body).toHaveLength(1);
    expect(aud.body[0].user_id).toBe(userId);
    // Rastrear audit para cleanup por id.
    for (const a of aud.body) auditIds.add(a.id);
    // Sem PII
    const dados = aud.body[0].dados_novos as Record<string, unknown>;
    for (const k of ["email", "cpf", "celular", "nome", "senha", "ip", "captcha"]) {
      expect(Object.keys(dados).includes(k), `PII proibida em audit: ${k}`).toBe(false);
    }
    expect(idem.body).toHaveLength(1);
    expect(idem.body[0].status).toBe("concluido");
    expect(idem.body[0].result_code).toBe("SUCESSO");
    expect(idem.body[0].assistido_id).toBe(row.assistido_id);
  }, 30_000);

  it("reexecução da finalização é idempotente e não duplica escrita", async () => {
    // Snapshot antes
    const antes = await restSvcGet<any[]>(
      `assistidos?user_id=eq.${userId}&instituicao_id=eq.${instId}&select=id`,
    );
    const before = antes.body.length;

    const r = await rpcSvc<Array<{ result_code: string; assistido_id: string }>>(
      "fn_autocadastro_assistido_publico",
      {
        p_request_id: requestId,
        p_idempotency_key: idempKey,
        p_request_fingerprint: fingerprint,
        p_instituicao_id: instId,
        p_user_id: userId,
        p_email_normalizado: email,
        p_nome_completo: `Autocadastro C12A ${runId}`,
        p_cpf_normalizado: "",
        p_celular_normalizado: "11999990000",
        p_termos_versao: "v1.0",
        p_privacidade_versao: "v1.0",
        p_aceito_em: new Date().toISOString(),
      },
    );
    expect(r.ok).toBe(true);
    expect(r.body[0].result_code).toBe("SUCESSO");

    const depois = await restSvcGet<any[]>(
      `assistidos?user_id=eq.${userId}&instituicao_id=eq.${instId}&select=id`,
    );
    expect(depois.body.length).toBe(before);

    const audCount = await restSvcGet<any[]>(
      `audit_logs?acao=eq.AUTOCADASTRO_PUBLICO_ASSISTIDO&registro_id=eq.${r.body[0].assistido_id}&select=id`,
    );
    expect(audCount.body.length).toBe(1);
    for (const a of audCount.body) auditIds.add(a.id);
  }, 30_000);

  it("anon e authenticated NÃO conseguem chamar as RPCs via PostgREST", async () => {
    // anon
    const kAnon = crypto.randomUUID();
    idempotencyKeys.push(kAnon);
    const anon = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_autocadastro_reservar`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_idempotency_key: kAnon,
        p_request_fingerprint: "x",
        p_request_id: crypto.randomUUID(),
        p_instituicao_id: instId,
        p_expires_at: new Date(Date.now() + 60_000).toISOString(),
      }),
    });
    expect([401, 403, 404]).toContain(anon.status);

    // authenticated (JWT do próprio usuário criado)
    const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const jwt = (await login.json()).access_token as string;
    const kAuthed = crypto.randomUUID();
    idempotencyKeys.push(kAuthed);
    const s = await rpcAsAuthenticated(
      "fn_autocadastro_reservar",
      {
        p_idempotency_key: kAuthed,
        p_request_fingerprint: "x",
        p_request_id: crypto.randomUUID(),
        p_instituicao_id: instId,
        p_expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      jwt,
    );
    expect([401, 403, 404]).toContain(s);
  }, 30_000);
});
