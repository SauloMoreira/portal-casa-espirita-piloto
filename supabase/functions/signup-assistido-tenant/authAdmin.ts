/**
 * STAB10-C1.2-B1-FIX01 — Helpers "checked" da Auth Admin e validação de env.
 *
 * Todos os wrappers propagam ERRO ESTRUTURAL em qualquer resposta ambígua
 * da Admin API. 404 em GET vira `null`. Erro em DELETE só é considerado
 * idempotente após confirmação por GET posterior. Nenhum ".catch(() => null)".
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { UUID_ANY } from "./contract.ts";

export interface AuthUserMinimo {
  id: string;
  email: string | null;
  email_confirmed_at: string | null;
  user_metadata: Record<string, unknown>;
}

export interface EnvSeguro {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  fingerprintSecret: string;
  rateLimitSecret: string;
  emailRedirectUrl: string;
  allowLocal: boolean;
  trustXff: boolean;
}

// ---------------------------------------------------------------------------
// Env fail-closed
// ---------------------------------------------------------------------------

const MIN_SECRET_LEN = 32;

function requireHttps(u: string, key: string): URL {
  let url: URL;
  try { url = new URL(u); } catch { throw new Error(`CONFIG_INVALIDA:${key}`); }
  if (url.protocol !== "https:") throw new Error(`CONFIG_INVALIDA:${key}`);
  if (url.username || url.password) throw new Error(`CONFIG_INVALIDA:${key}`);
  if (url.hash) throw new Error(`CONFIG_INVALIDA:${key}`);
  return url;
}

function readNonEmpty(key: string, min = 1): string {
  const v = (Deno.env.get(key) ?? "").trim();
  if (v.length < min) throw new Error(`CONFIG_INVALIDA:${key}`);
  return v;
}

/**
 * Lê e valida a configuração. Aceita `overrides` para testes deterministicos.
 * Nunca ecoa valores nos erros propagados fora daqui.
 */
export function readEnvChecked(overrides?: Partial<EnvSeguro>): EnvSeguro {
  if (overrides) {
    // Em contexto de teste basta devolver o override (todos os campos requeridos).
    for (const k of ["supabaseUrl","serviceRoleKey","anonKey","fingerprintSecret","rateLimitSecret","emailRedirectUrl"] as const) {
      if (!overrides[k] || String(overrides[k]).length === 0) {
        throw new Error(`CONFIG_INVALIDA:${k}`);
      }
    }
    return {
      allowLocal: false,
      trustXff: false,
      ...overrides,
    } as EnvSeguro;
  }
  const supabaseUrl = requireHttps(readNonEmpty("SUPABASE_URL"), "SUPABASE_URL").toString().replace(/\/$/, "");
  const serviceRoleKey    = readNonEmpty("SUPABASE_SERVICE_ROLE_KEY", MIN_SECRET_LEN);
  const anonKey           = readNonEmpty("SUPABASE_ANON_KEY", MIN_SECRET_LEN);
  const fingerprintSecret = readNonEmpty("AUTOCADASTRO_FINGERPRINT_SECRET", MIN_SECRET_LEN);
  const rateLimitSecret   = readNonEmpty("AUTOCADASTRO_RATE_LIMIT_SECRET", MIN_SECRET_LEN);
  const emailRedirectUrl  = requireHttps(
    readNonEmpty("AUTOCADASTRO_EMAIL_REDIRECT_URL"), "AUTOCADASTRO_EMAIL_REDIRECT_URL",
  ).toString();

  // Allowlist de origem do redirect (server-side).
  const origem = new URL(emailRedirectUrl).origin;
  const permitidas = new Set<string>([
    "https://portal-casa-espirita-piloto.lovable.app",
    ...String(Deno.env.get("AUTOCADASTRO_CORS_ORIGINS") ?? "")
      .split(",").map(s => s.trim()).filter(s => s.startsWith("https://")),
  ]);
  const allowLocal = Deno.env.get("AUTOCADASTRO_ALLOW_LOCAL") === "true";
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(origem);
  if (!permitidas.has(origem) && !(allowLocal && isLocal)) {
    throw new Error("CONFIG_INVALIDA:AUTOCADASTRO_EMAIL_REDIRECT_URL");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    anonKey,
    fingerprintSecret,
    rateLimitSecret,
    emailRedirectUrl,
    allowLocal,
    trustXff: Deno.env.get("AUTOCADASTRO_TRUST_XFF") === "true",
  };
}

// ---------------------------------------------------------------------------
// Auth Admin "checked" — nunca .catch(() => null)
// ---------------------------------------------------------------------------

function toMinimal(u: {
  id: string; email?: string | null; email_confirmed_at?: string | null;
  user_metadata?: Record<string, unknown>;
}): AuthUserMinimo {
  return {
    id: u.id,
    email: u.email ?? null,
    email_confirmed_at: u.email_confirmed_at ?? null,
    user_metadata: (u.user_metadata ?? {}) as Record<string, unknown>,
  };
}

/** GET por ID: 404 → null. Qualquer outro erro/formato inválido lança. */
export async function getAuthUserByIdChecked(
  svc: SupabaseClient,
  userId: string,
): Promise<AuthUserMinimo | null> {
  if (!UUID_ANY.test(userId)) throw new Error("UUID_INVALIDO");
  const { data, error } = await svc.auth.admin.getUserById(userId);
  if (error) {
    const status = (error as { status?: number }).status ?? 0;
    if (status === 404) return null;
    throw new Error(`AUTH_ADMIN_ERRO:${status || "desconhecido"}`);
  }
  const u = data?.user;
  if (!u || typeof u.id !== "string") throw new Error("AUTH_ADMIN_FORMATO_INVALIDO");
  return toMinimal(u);
}

/**
 * Busca por e-mail via paginação. Sem teto arbitrário de 5 páginas; usa
 * limite defensivo alto e falha fechado se não conseguir completar.
 */
export async function findAuthUserByEmailChecked(
  svc: SupabaseClient,
  email: string,
): Promise<AuthUserMinimo | null> {
  const target = email.toLowerCase();
  const perPage = 200;
  const MAX_PAGES = 200; // 40k usuários — limite defensivo, log CRITICAL se atingido.
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await (svc.auth.admin as unknown as {
      listUsers: (o: { page: number; perPage: number }) => Promise<{
        data: { users: unknown } | null; error: unknown;
      }>;
    }).listUsers({ page, perPage });
    if (error) {
      const status = (error as { status?: number }).status ?? 0;
      throw new Error(`AUTH_ADMIN_LIST_ERRO:${status || "desconhecido"}`);
    }
    const usersRaw = data?.users;
    if (!Array.isArray(usersRaw)) throw new Error("AUTH_ADMIN_LIST_FORMATO_INVALIDO");
    for (const u of usersRaw) {
      const uu = u as { id?: unknown; email?: unknown };
      if (typeof uu.id !== "string") throw new Error("AUTH_ADMIN_LIST_FORMATO_INVALIDO");
      if (typeof uu.email === "string" && uu.email.toLowerCase() === target) {
        return toMinimal(u as { id: string; email: string; email_confirmed_at: string | null; user_metadata: Record<string, unknown> });
      }
    }
    if (usersRaw.length < perPage) return null;
  }
  throw new Error("AUTH_ADMIN_PAGINACAO_ESGOTADA");
}

/**
 * Delete Auth: sucesso ou 404 devolve `{ ok: true, notFound }`. Qualquer outro
 * erro lança — a confirmação idempotente (auth_delete_ok=true) fica a cargo do
 * chamador, que precisa fazer GET posterior.
 */
export async function deleteAuthUserChecked(
  svc: SupabaseClient,
  userId: string,
): Promise<{ notFound: boolean }> {
  if (!UUID_ANY.test(userId)) throw new Error("UUID_INVALIDO");
  const { error } = await svc.auth.admin.deleteUser(userId);
  if (!error) return { notFound: false };
  const status = (error as { status?: number }).status ?? 0;
  if (status === 404) return { notFound: true };
  throw new Error(`AUTH_ADMIN_DELETE_ERRO:${status || "desconhecido"}`);
}

// ---------------------------------------------------------------------------
// Marker helpers
// ---------------------------------------------------------------------------

export function extractMarker(user: AuthUserMinimo | null): {
  marker: string | null;
  requestId: string | null;
} {
  const md = user?.user_metadata ?? {};
  return {
    marker:    typeof md.autocadastro_marker    === "string" ? (md.autocadastro_marker    as string) : null,
    requestId: typeof md.autocadastro_request_id === "string" ? (md.autocadastro_request_id as string) : null,
  };
}
