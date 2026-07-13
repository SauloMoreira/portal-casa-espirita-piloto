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

export interface CreatedIds {
  authUsers: string[];
  profiles: string[];
  userRoles: string[];
  instituicaoUsuarios: string[];
  assistidos: string[];
  instituicoes: string[];
  emails: string[];
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

/**
 * Cleanup integral por IDs rastreados. Ordem: tabelas públicas primeiro,
 * auth.users por último, instituicoes por último de todos. Idempotente.
 */
export async function cleanupTracked(tracker: CreatedIds): Promise<void> {
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
}

/**
 * Confirma zero resíduos por IDs rastreados + por prefixo de nome/email.
 * Retorna dicionário de contagens residuais.
 */
export async function residuosFinais(
  tracker: CreatedIds,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  // Por IDs rastreados
  for (const id of tracker.assistidos) {
    const r = await svc<Array<unknown>>(`assistidos?id=eq.${id}&select=id`);
    counts[`assistidos:${id}`] = (r.body ?? []).length;
  }
  for (const uid of tracker.authUsers) {
    const [p, ur, iu, a, au] = await Promise.all([
      svc<Array<unknown>>(`profiles?user_id=eq.${uid}&select=user_id`),
      svc<Array<unknown>>(`user_roles?user_id=eq.${uid}&select=id`),
      svc<Array<unknown>>(`instituicao_usuarios?user_id=eq.${uid}&select=id`),
      svc<Array<unknown>>(`assistidos?user_id=eq.${uid}&select=id`),
      adminGetAuthUser(uid),
    ]);
    counts[`profiles:${uid}`] = (p.body ?? []).length;
    counts[`user_roles:${uid}`] = (ur.body ?? []).length;
    counts[`instituicao_usuarios:${uid}`] = (iu.body ?? []).length;
    counts[`assistidos.user_id:${uid}`] = (a.body ?? []).length;
    counts[`auth.users:${uid}`] = au ? 1 : 0;
  }
  // Por prefixo textual (defensivo)
  const pref = await svc<Array<unknown>>(`assistidos?nome=like.${NS}%25&select=id`);
  counts[`assistidos.prefix`] = (pref.body ?? []).length;
  for (const email of tracker.emails) {
    counts[`auth.email:${email}`] = (await adminListAuthUserByEmail(email)).length;
  }
  for (const id of tracker.instituicoes) {
    const r = await svc<Array<unknown>>(`instituicoes?id=eq.${id}&select=id`);
    counts[`instituicoes:${id}`] = (r.body ?? []).length;
  }
  const prefInst = await svc<Array<unknown>>(`instituicoes?slug=like.${NS}-%25&select=id`);
  counts[`instituicoes.prefix`] = (prefInst.body ?? []).length;
  return counts;
}
