/**
 * STAB10-A.3 — Fixtures isoladas para o teste E2E do provisionamento de acesso.
 *
 * Namespace textual: `stab10a3` (mais sufixo aleatório por execução).
 * Cleanup rastreia IDs criados; nunca depende apenas de prefixo para tabelas
 * cujas chaves não têm marcador textual.
 *
 * O service role é usado SOMENTE para seed / cleanup / inspeção estrutural.
 * As asserções de autorização e visibilidade tenant vão pelo JWT real do
 * operador / do assistido — nunca por este helper.
 */

import { Pool } from "pg";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const HAS_PG = !!process.env.PGHOST;

export const HAS_STAB10A3 = !!(SUPABASE_URL && ANON_KEY && SERVICE_KEY && HAS_PG);

let pgPool: Pool | null = null;
function pool(): Pool {
  if (!pgPool) {
    pgPool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: { rejectUnauthorized: false },
      max: 2,
    });
  }
  return pgPool;
}
export async function closeStab10A3Pool(): Promise<void> {
  if (pgPool) { await pgPool.end(); pgPool = null; }
}

export const NS = "stab10a3";
export const FER_ID =
  process.env.E2E_STAB10A3_INSTITUICAO_FER_ID ??
  "e3818702-cfac-47ae-b751-cb6a05babd4f";
// STAB10-A.4: sem fallback hardcoded. O tenant secundário é criado como
// instituição efêmera namespaced no beforeAll (ver seedInstituicaoEfemera).

export interface AuditRef {
  id?: string;
  acao: string;
  registroId: string;
  idempotencyKey: string;
}

export interface CreatedIds {
  authUsers: string[];
  profiles: string[];
  userRoles: string[];
  instituicaoUsuarios: string[];
  assistidos: string[];
  instituicoes: string[];
  emails: string[];
  // FIX01-R1.b — cirurgia estrita
  auditIds: string[];
  idempotencyKeys: string[];
  auditRefs: AuditRef[];
}

export function newTracker(): CreatedIds {
  return {
    authUsers: [],
    profiles: [],
    userRoles: [],
    instituicaoUsuarios: [],
    assistidos: [],
    instituicoes: [],
    emails: [],
    auditIds: [],
    idempotencyKeys: [],
    auditRefs: [],
  };
}

export function uniq(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function emailFor(kind: string, suffix: string): string {
  return `${NS}-${kind}-${suffix}@lovable.test`.toLowerCase();
}

interface RestOptions extends RequestInit {
  prefer?: string;
}

async function svc<T = unknown>(
  path: string,
  opts: RestOptions = {},
): Promise<{ status: number; ok: boolean; body: T }> {
  const headers: Record<string, string> = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
  if (opts.prefer) headers.Prefer = opts.prefer;
  if (opts.headers) Object.assign(headers, opts.headers as Record<string, string>);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers });
  const body = (await r.json().catch(() => null)) as T;
  return { status: r.status, ok: r.ok, body };
}

/** Auth Admin API — createUser. */
export async function adminCreateAuthUser(
  email: string,
  password: string,
): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.id) {
    throw new Error(`adminCreateAuthUser falhou: ${r.status} ${JSON.stringify(body)}`);
  }
  return body.id as string;
}

export async function adminDeleteAuthUser(userId: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

export async function adminGetAuthUser(
  userId: string,
): Promise<{ id: string; email: string; email_confirmed_at: string | null } | null> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) return null;
  const b = await r.json();
  return { id: b.id, email: b.email, email_confirmed_at: b.email_confirmed_at ?? null };
}

export async function adminListAuthUserByEmail(
  email: string,
): Promise<Array<{ id: string; email: string }>> {
  const r = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(`email eq "${email}"`)}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!r.ok) return [];
  const b = await r.json().catch(() => null);
  const users = (b?.users ?? []) as Array<{ id: string; email: string }>;
  return users.filter((u) => (u.email || "").toLowerCase() === email.toLowerCase());
}

/**
 * Provisiona um operador (papel admin global + admin_instituicao no tenant).
 * Retorna { userId, email, password } e registra IDs no tracker.
 */
export async function seedOperador(
  tracker: CreatedIds,
  instituicaoId: string,
  suffix: string,
): Promise<{ userId: string; email: string; password: string }> {
  const email = emailFor("op", suffix);
  const password = `Stab10A3!${crypto.randomUUID().slice(0, 8)}`;
  const userId = await adminCreateAuthUser(email, password);
  tracker.authUsers.push(userId);
  tracker.emails.push(email);

  // Profile é criado por trigger em auth.users → public.profiles.
  // Atualiza apenas o nome para carregar o marcador de namespace.
  await svc(`profiles?user_id=eq.${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ nome_completo: `${NS} operador ${suffix}` }),
  });
  tracker.profiles.push(userId);

  // user_roles.role = admin. O trigger fn_block_admin_grant exige a GUC
  // `app.allow_admin_grant='on'` (mesmo mecanismo usado pelo fluxo oficial
  // de aprovação de privilégios). Usamos conexão pg dedicada apenas para
  // essa GUC transacional; nada aqui altera código produtivo/RLS/policies.
  const c = await pool().connect();
  let insertedRoleId = "";
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL app.allow_admin_grant='on'");
    const r = await c.query(
      "INSERT INTO public.user_roles(user_id, role) VALUES ($1,'admin') RETURNING id",
      [userId],
    );
    insertedRoleId = r.rows[0].id;
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  tracker.userRoles.push(insertedRoleId);

  // instituicao_usuarios.papel_local = admin_instituicao / status = ativo
  const iu = await svc<Array<{ id: string }>>("instituicao_usuarios", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      user_id: userId,
      instituicao_id: instituicaoId,
      papel_local: "admin_instituicao",
      status: "ativo",
    }),
  });
  if (!iu.ok) throw new Error(`seedOperador iu: ${iu.status} ${JSON.stringify(iu.body)}`);
  iu.body.forEach((r) => tracker.instituicaoUsuarios.push(r.id));

  // Trigger de profile costuma criar um assistidos base para o novo user.
  // Buscamos e rastreamos para cleanup posterior.
  const aOp = await svc<Array<{ id: string }>>(
    `assistidos?user_id=eq.${userId}&select=id`,
  );
  (aOp.body ?? []).forEach((r) => tracker.assistidos.push(r.id));

  return { userId, email, password };
}

/**
 * Cria um assistido sem acesso no tenant desejado.
 */
export async function seedAssistidoSemAcesso(
  tracker: CreatedIds,
  instituicaoId: string,
  createdBy: string,
  suffix: string,
): Promise<{ assistidoId: string; nome: string }> {
  const nome = `${NS} assistido ${suffix}`;
  const r = await svc<Array<{ id: string }>>("assistidos", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({
      nome,
      instituicao_id: instituicaoId,
      created_by: createdBy,
      status: "ativo",
      celular: "11" + Math.floor(900000000 + Math.random() * 99999999).toString().slice(0, 9),
    }),
  });
  if (!r.ok || !r.body?.[0]?.id) {
    throw new Error(`seedAssistidoSemAcesso: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const id = r.body[0].id;
  tracker.assistidos.push(id);
  return { assistidoId: id, nome };
}

/** Login real via GoTrue password grant. */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<{ accessToken: string; userId: string }> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const b = await r.json().catch(() => null);
  if (!r.ok || !b?.access_token || !b?.user?.id) {
    throw new Error(`signInWithEmail falhou (${email}): ${r.status} ${JSON.stringify(b)}`);
  }
  return { accessToken: b.access_token, userId: b.user.id };
}

/** PostgREST autenticado com JWT real (para asserções tenant-aware). */
export async function restAsUser<T = unknown>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; ok: boolean; body: T }> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = (await r.json().catch(() => null)) as T;
  return { status: r.status, ok: r.ok, body };
}

/** Chamada à Edge Function com JWT real do operador. */
export async function invokeProvisionar(
  accessToken: string,
  payload: {
    assistido_id: string;
    email: string;
    password: string;
    celular: string;
    data_nascimento: string;
  },
): Promise<{ status: number; ok: boolean; body: any }> {
  const r = await fetch(
    `${SUPABASE_URL}/functions/v1/provisionar-acesso-assistido`,
    {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const body = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, body };
}

/**
 * Cria uma instituição efêmera namespaced (para cenários cross-tenant).
 */
export async function seedInstituicaoEfemera(
  tracker: CreatedIds,
  suffix: string,
): Promise<{ id: string; slug: string; nome: string }> {
  const slug = `${NS}-inst-${suffix}`.toLowerCase();
  const nome = `${NS} instituicao ${suffix}`;
  const r = await svc<Array<{ id: string }>>("instituicoes", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify({ nome, slug, status: "implantacao" }),
  });
  if (!r.ok || !r.body?.[0]?.id) {
    throw new Error(`seedInstituicaoEfemera: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const id = r.body[0].id;
  tracker.instituicoes.push(id);
  return { id, slug, nome };
}

export interface CleanupOptions {
  /**
   * FIX01-R1.b — modo estrito, exclusivo para autocadastro-*.e2etest.ts.
   * Não usa DELETE amplo por user_id/instituicao_id/ação; exclui somente:
   *   - audit_logs por auditIds rastreados (após resolver auditRefs);
   *   - autocadastro_idempotencia por idempotencyKeys;
   *   - assistidos/instituicao_usuarios/user_roles por id;
   *   - profiles pelo user_id Auth rastreado;
   *   - auth.users por UUID exato (por último entre registros do user);
   *   - instituicoes por id (por último de todos).
   */
  strict?: boolean;
}

export type AuditResolutionIssue = {
  code: "AUDITORIA_OBRIGATORIA_AUSENTE" | "AUDITORIA_DUPLICADA";
  acao: string;
  registroId: string;
  idempotencyKey: string;
  quantidade: number;
};

/**
 * FIX01-R1.c — Resolução resiliente: nunca lança.
 * Retorna issues coletadas. Duplicatas → todos os IDs vão para auditIds.
 */
async function resolveAuditRefs(
  tracker: CreatedIds,
): Promise<AuditResolutionIssue[]> {
  const issues: AuditResolutionIssue[] = [];
  for (const ref of tracker.auditRefs) {
    if (ref.id) {
      if (!tracker.auditIds.includes(ref.id)) tracker.auditIds.push(ref.id);
      continue;
    }
    const rows = await svc<Array<{ id: string; dados_novos: Record<string, unknown> | null }>>(
      `audit_logs?acao=eq.${encodeURIComponent(ref.acao)}&registro_id=eq.${ref.registroId}&select=id,dados_novos`,
    );
    const matches = (rows.body ?? []).filter((r) => {
      const key = (r.dados_novos as Record<string, unknown> | null)?.idempotency_key;
      return typeof key === "string" && key === ref.idempotencyKey;
    });
    if (matches.length === 0) {
      issues.push({
        code: "AUDITORIA_OBRIGATORIA_AUSENTE",
        acao: ref.acao,
        registroId: ref.registroId,
        idempotencyKey: ref.idempotencyKey,
        quantidade: 0,
      });
      continue;
    }
    for (const m of matches) {
      if (!tracker.auditIds.includes(m.id)) tracker.auditIds.push(m.id);
    }
    if (matches.length === 1) {
      ref.id = matches[0].id;
    } else {
      ref.id = matches[0].id;
      issues.push({
        code: "AUDITORIA_DUPLICADA",
        acao: ref.acao,
        registroId: ref.registroId,
        idempotencyKey: ref.idempotencyKey,
        quantidade: matches.length,
      });
    }
  }
  return issues;
}

/**
 * FIX01-R1.c-FIX01 — Resultado do cleanup. Modo estrito NUNCA lança;
 * expõe auditIssues e cleanupErrors para os callers agregarem depois de
 * verificar zero resíduos.
 */
export interface CleanupResult {
  auditIssues: AuditResolutionIssue[];
  cleanupErrors: string[];
}

async function safeStep(
  errors: string[],
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`${label}: ${msg}`);
  }
}

// ============================================================
// FIX01-R1.c-FIX02 — Wrappers "checked" para o modo strict e para
// residuosFinais. Não alteram o contrato legado de svc/adminDeleteAuthUser
// /adminGetAuthUser/adminListAuthUserByEmail. Qualquer resposta HTTP não-ok
// é convertida em Error (capturado por safeStep no cleanup; propagado em
// residuosFinais para os callers agregarem em verificationErrors).
// ============================================================

/** DELETE REST com validação HTTP. Lança em qualquer status não-ok. */
async function svcDeleteChecked(path: string, label: string): Promise<void> {
  const res = await svc(path, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(
      `${label} [DELETE ${path}] HTTP ${res.status} :: ${JSON.stringify(res.body)}`,
    );
  }
}

/**
 * DELETE Auth com validação HTTP. 200/204 = sucesso; 404 = idempotente
 * (usuário já removido). Qualquer outro status não-ok lança.
 */
async function adminDeleteAuthUserChecked(userId: string): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (r.ok) return;
  if (r.status === 404) return;
  const body = await r.json().catch(() => null);
  throw new Error(
    `auth.users.uid=${userId} [DELETE admin/users] HTTP ${r.status} :: ${JSON.stringify(body)}`,
  );
}

/**
 * GET REST com validação HTTP + formato. Exige body em array; qualquer
 * violação lança erro contendo o marcador FORMATO_RESPOSTA_INVALIDO.
 */
async function svcReadChecked<T = unknown>(
  path: string,
  label: string,
): Promise<T[]> {
  const res = await svc<unknown>(path);
  if (!res.ok) {
    throw new Error(
      `${label} [GET ${path}] HTTP ${res.status} :: ${JSON.stringify(res.body)}`,
    );
  }
  if (!Array.isArray(res.body)) {
    throw new Error(
      `${label} [GET ${path}] FORMATO_RESPOSTA_INVALIDO body_type=${typeof res.body} :: ${JSON.stringify(res.body)}`,
    );
  }
  return res.body as T[];
}

/**
 * GET Auth individual com validação HTTP + formato. 200 exige objeto com
 * `id` string; 404 devolve null; qualquer outro status lança.
 */
async function adminGetAuthUserChecked(
  userId: string,
): Promise<{ id: string; email: string; email_confirmed_at: string | null } | null> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (r.status === 404) return null;
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(
      `auth.users.get uid=${userId} HTTP ${r.status} :: ${JSON.stringify(body)}`,
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { id?: unknown }).id !== "string"
  ) {
    throw new Error(
      `auth.users.get uid=${userId} FORMATO_RESPOSTA_INVALIDO :: ${JSON.stringify(body)}`,
    );
  }
  const b = body as { id: string; email?: string; email_confirmed_at?: string | null };
  return { id: b.id, email: b.email ?? "", email_confirmed_at: b.email_confirmed_at ?? null };
}

/**
 * GET Auth list-by-email com validação HTTP + formato. Somente resposta ok
 * com `body.users` array é aceita. Qualquer não-ok (inclusive 404) lança.
 */
async function adminListAuthUserByEmailChecked(
  email: string,
): Promise<Array<{ id: string; email: string }>> {
  const r = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(`email eq "${email}"`)}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    throw new Error(
      `auth.users.list email=${email} HTTP ${r.status} :: ${JSON.stringify(body)}`,
    );
  }
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray((body as { users?: unknown }).users)
  ) {
    throw new Error(
      `auth.users.list email=${email} FORMATO_RESPOSTA_INVALIDO :: ${JSON.stringify(body)}`,
    );
  }
  const users = (body as { users: Array<{ id: string; email: string }> }).users;
  return users.filter((u) => (u.email || "").toLowerCase() === email.toLowerCase());
}

/**
 * Cleanup integral por IDs rastreados. Ordem: tabelas públicas primeiro,
 * auth.users por último, instituicoes por último de todos. Idempotente.
 *
 * FIX01-R1.b — modo estrito (opts.strict=true): remove exclusivamente por
 * IDs técnicos previamente rastreados; sem DELETE amplo.
 *
 * FIX01-R1.c-FIX01 — modo estrito NUNCA lança. Cada etapa é isolada; falhas
 * operacionais são acumuladas em `cleanupErrors`. As issues de auditoria são
 * devolvidas em `auditIssues` para o caller lançar o erro agregado somente
 * DEPOIS de verificar zero resíduos.
 *
 * FIX01-R1.c-FIX02 — modo estrito passa a usar wrappers checked
 * (svcDeleteChecked, adminDeleteAuthUserChecked). Respostas HTTP 4xx/5xx
 * agora são registradas em cleanupErrors em vez de silenciosamente aceitas.
 * 404 no DELETE Auth continua idempotente. Contrato legado (svc,
 * adminDeleteAuthUser) preservado — usado exclusivamente no ramo não strict.
 */
export async function cleanupTracked(
  tracker: CreatedIds,
  opts: CleanupOptions = {},
): Promise<CleanupResult> {
  if (opts.strict) {
    const cleanupErrors: string[] = [];
    // 1) Resolver auditRefs (coleta issues, NUNCA lança).
    let auditIssues: AuditResolutionIssue[] = [];
    try {
      auditIssues = await resolveAuditRefs(tracker);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      cleanupErrors.push(`resolveAuditRefs: ${msg}`);
    }
    // 2) audit_logs por id (inclui duplicatas resolvidas).
    for (const auditId of tracker.auditIds) {
      await safeStep(cleanupErrors, `audit_logs.id=${auditId}`, () =>
        svcDeleteChecked(`audit_logs?id=eq.${auditId}`, `audit_logs.id=${auditId}`),
      );
    }
    // 3) assistidos por id
    for (const id of tracker.assistidos) {
      await safeStep(cleanupErrors, `assistidos.id=${id}`, () =>
        svcDeleteChecked(`assistidos?id=eq.${id}`, `assistidos.id=${id}`),
      );
    }
    // 4) instituicao_usuarios por id
    for (const id of tracker.instituicaoUsuarios) {
      await safeStep(cleanupErrors, `instituicao_usuarios.id=${id}`, () =>
        svcDeleteChecked(`instituicao_usuarios?id=eq.${id}`, `instituicao_usuarios.id=${id}`),
      );
    }
    // 5) user_roles por id
    for (const id of tracker.userRoles) {
      await safeStep(cleanupErrors, `user_roles.id=${id}`, () =>
        svcDeleteChecked(`user_roles?id=eq.${id}`, `user_roles.id=${id}`),
      );
    }
    // 6) profiles por user_id
    for (const uid of tracker.authUsers) {
      await safeStep(cleanupErrors, `profiles.user_id=${uid}`, () =>
        svcDeleteChecked(`profiles?user_id=eq.${uid}`, `profiles.user_id=${uid}`),
      );
    }
    // 7) autocadastro_idempotencia por idempotency_key rastreada
    for (const key of tracker.idempotencyKeys) {
      await safeStep(cleanupErrors, `autocadastro_idempotencia.key=${key}`, () =>
        svcDeleteChecked(
          `autocadastro_idempotencia?idempotency_key=eq.${key}`,
          `autocadastro_idempotencia.key=${key}`,
        ),
      );
    }
    // 8) auth.users por UUID (404 idempotente).
    for (const uid of tracker.authUsers) {
      await safeStep(cleanupErrors, `auth.users.uid=${uid}`, () =>
        adminDeleteAuthUserChecked(uid),
      );
    }
    // 9) instituicoes efêmeras por id
    for (const id of tracker.instituicoes) {
      await safeStep(cleanupErrors, `instituicoes.id=${id}`, () =>
        svcDeleteChecked(`instituicoes?id=eq.${id}`, `instituicoes.id=${id}`),
      );
    }
    return { auditIssues, cleanupErrors };
  }

  // ------ Modo legado (retrocompatível) — usado por E2Es antigos. ------
  // assistidos: desvincula (user_id=null) para permitir exclusão via cascade limpo.
  for (const id of tracker.assistidos) {
    await svc(`assistidos?id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of tracker.instituicaoUsuarios) {
    await svc(`instituicao_usuarios?id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of tracker.userRoles) {
    await svc(`user_roles?id=eq.${id}`, { method: "DELETE" });
  }
  for (const uid of tracker.authUsers) {
    // Limpeza defensiva de linhas geradas por triggers em torno do user
    await svc(`user_roles?user_id=eq.${uid}`, { method: "DELETE" });
    await svc(`instituicao_usuarios?user_id=eq.${uid}`, { method: "DELETE" });
    await svc(`assistidos?user_id=eq.${uid}`, { method: "DELETE" });
    await svc(`profiles?user_id=eq.${uid}`, { method: "DELETE" });
  }
  for (const uid of tracker.authUsers) {
    await adminDeleteAuthUser(uid);
  }
  for (const id of tracker.instituicoes) {
    await svc(`instituicao_usuarios?instituicao_id=eq.${id}`, { method: "DELETE" });
    await svc(`assistidos?instituicao_id=eq.${id}`, { method: "DELETE" });
    await svc(`instituicoes?id=eq.${id}`, { method: "DELETE" });
  }
  return { auditIssues: [], cleanupErrors: [] };
}

/**
 * Confirma zero resíduos por IDs rastreados + por prefixo de nome/email.
 * FIX01-R1.c-FIX01 — inclui audit_logs (por id e por combinação
 * acao+registro_id+idempotency_key) e autocadastro_idempotencia
 * (por idempotency_key), para permitir asserção estrutural única
 * via residuosFinais no afterAll dos E2Es.
 *
 * FIX01-R1.c-FIX02 — todas as leituras passam por wrappers checked
 * (svcReadChecked, adminGetAuthUserChecked, adminListAuthUserByEmailChecked).
 * Respostas HTTP com erro ou formato inesperado LANÇAM em vez de virarem
 * quantidade zero. Os callers devem capturar em `verificationErrors` e
 * agregar junto de cleanupErrors e auditIssues no erro final.
 */
export async function residuosFinais(
  tracker: CreatedIds,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const aid of tracker.auditIds) {
    const rows = await svcReadChecked<{ id: string }>(
      `audit_logs?id=eq.${aid}&select=id`,
      `audit_logs.id:${aid}`,
    );
    counts[`audit_logs.id:${aid}`] = rows.length;
  }
  for (const ref of tracker.auditRefs) {
    const rows = await svcReadChecked<{ dados_novos: Record<string, unknown> | null }>(
      `audit_logs?acao=eq.${encodeURIComponent(ref.acao)}&registro_id=eq.${ref.registroId}&select=id,dados_novos`,
      `audit_logs.ref:${ref.acao}/${ref.registroId}`,
    );
    const remain = rows.filter((row) => {
      const k = (row.dados_novos as Record<string, unknown> | null)?.idempotency_key;
      return typeof k === "string" && k === ref.idempotencyKey;
    });
    counts[`audit_logs.ref:${ref.acao}/${ref.registroId}`] = remain.length;
  }
  for (const key of tracker.idempotencyKeys) {
    const rows = await svcReadChecked<unknown>(
      `autocadastro_idempotencia?idempotency_key=eq.${key}&select=idempotency_key`,
      `autocadastro_idempotencia:${key}`,
    );
    counts[`autocadastro_idempotencia:${key}`] = rows.length;
  }
  for (const id of tracker.assistidos) {
    const rows = await svcReadChecked<unknown>(
      `assistidos?id=eq.${id}&select=id`,
      `assistidos:${id}`,
    );
    counts[`assistidos:${id}`] = rows.length;
  }
  for (const id of tracker.instituicaoUsuarios) {
    const rows = await svcReadChecked<unknown>(
      `instituicao_usuarios?id=eq.${id}&select=id`,
      `instituicao_usuarios:${id}`,
    );
    counts[`instituicao_usuarios:${id}`] = rows.length;
  }
  for (const id of tracker.userRoles) {
    const rows = await svcReadChecked<unknown>(
      `user_roles?id=eq.${id}&select=id`,
      `user_roles:${id}`,
    );
    counts[`user_roles:${id}`] = rows.length;
  }
  for (const uid of tracker.authUsers) {
    const [p, ur, iu, a, au] = await Promise.all([
      svcReadChecked<unknown>(`profiles?user_id=eq.${uid}&select=user_id`, `profiles:${uid}`),
      svcReadChecked<unknown>(`user_roles?user_id=eq.${uid}&select=id`, `user_roles.user_id:${uid}`),
      svcReadChecked<unknown>(`instituicao_usuarios?user_id=eq.${uid}&select=id`, `instituicao_usuarios.user_id:${uid}`),
      svcReadChecked<unknown>(`assistidos?user_id=eq.${uid}&select=id`, `assistidos.user_id:${uid}`),
      adminGetAuthUserChecked(uid),
    ]);
    counts[`profiles:${uid}`] = p.length;
    counts[`user_roles.user_id:${uid}`] = ur.length;
    counts[`instituicao_usuarios.user_id:${uid}`] = iu.length;
    counts[`assistidos.user_id:${uid}`] = a.length;
    counts[`auth.users:${uid}`] = au ? 1 : 0;
  }
  const pref = await svcReadChecked<unknown>(
    `assistidos?nome=like.${NS}%25&select=id`,
    `assistidos.prefix`,
  );
  counts[`assistidos.prefix`] = pref.length;
  for (const email of tracker.emails) {
    counts[`auth.email:${email}`] = (await adminListAuthUserByEmailChecked(email)).length;
  }
  for (const id of tracker.instituicoes) {
    const rows = await svcReadChecked<unknown>(
      `instituicoes?id=eq.${id}&select=id`,
      `instituicoes:${id}`,
    );
    counts[`instituicoes:${id}`] = rows.length;
  }
  const prefInst = await svcReadChecked<unknown>(
    `instituicoes?slug=like.${NS}-%25&select=id`,
    `instituicoes.prefix`,
  );
  counts[`instituicoes.prefix`] = prefInst.length;
  return counts;
}
