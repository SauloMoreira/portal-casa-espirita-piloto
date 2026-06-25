/**
 * Real-access client for the E2E RLS suite (P1.1).
 *
 * Everything here goes through the SAME public surfaces the application uses:
 *   - GoTrue token endpoint for real password sign-in (real JWT)
 *   - PostgREST `/rest/v1` for table reads/writes (RLS enforced per row)
 *   - PostgREST `/rest/v1/rpc` for SECURITY DEFINER functions
 *
 * No `set_config('request.jwt.claims', ...)` simulation, no BYPASSRLS role.
 * The JWT is minted by the auth server from the test account's credentials, so
 * `auth.uid()`, `has_role()` and every RLS policy run for real.
 */

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
export const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const PASSWORD = process.env.E2E_RLS_PASSWORD ?? "";

/** The suite is skippable when creds are absent (e.g. plain CI without secrets). */
export const HAS_E2E = !!(SUPABASE_URL && ANON_KEY && PASSWORD);

export type E2ERole = "admin" | "coordenador" | "entrevistador" | "tarefeiro" | "assistido";

/** Namespaced, non-production test accounts (see provisioning report). */
export const TEST_EMAILS: Record<E2ERole, string> = {
  admin: "e2e-rls-admin@lovable.test",
  coordenador: "e2e-rls-coordenador@lovable.test",
  entrevistador: "e2e-rls-entrevistador@lovable.test",
  tarefeiro: "e2e-rls-tarefeiro@lovable.test",
  assistido: "e2e-rls-assistido@lovable.test",
};

export interface RestResult<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
}

const tokenCache = new Map<E2ERole, string>();
const uidCache = new Map<E2ERole, string>();

/** Real password grant against GoTrue. Returns a real JWT access token. */
export async function signIn(role: E2ERole): Promise<string> {
  const cached = tokenCache.get(role);
  if (cached) return cached;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAILS[role], password: PASSWORD }),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok || !body?.access_token) {
    throw new Error(`Falha de login (${role}): ${r.status} ${JSON.stringify(body)}`);
  }
  tokenCache.set(role, body.access_token);
  return body.access_token;
}

/** The authenticated user id behind a role's session. */
export async function uidOf(role: E2ERole): Promise<string> {
  const cached = uidCache.get(role);
  if (cached) return cached;
  const token = await signIn(role);
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
  });
  const body = await r.json();
  uidCache.set(role, body.id);
  return body.id;
}

type Auth = E2ERole | "anon" | "none";

function authHeaders(auth: Auth, token?: string): Record<string, string> {
  // "anon" = real anonymous role (apikey/anon JWT as bearer).
  // "none" = no JWT at all (PostgREST rejects with 401).
  if (auth === "none") return {};
  if (auth === "anon") return { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };
  return { apikey: ANON_KEY, Authorization: `Bearer ${token}` };
}

/** Real PostgREST table request. */
export async function rest<T = unknown>(
  auth: Auth,
  path: string,
  init: RequestInit = {},
): Promise<RestResult<T>> {
  let token: string | undefined;
  if (auth !== "anon" && auth !== "none") token = await signIn(auth);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(auth, token),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = (await r.json().catch(() => null)) as T;
  return { status: r.status, ok: r.ok, body };
}

/** Real PostgREST RPC (SECURITY DEFINER function) call. */
export async function rpc<T = unknown>(
  auth: Auth,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RestResult<T>> {
  return rest<T>(auth, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
}
