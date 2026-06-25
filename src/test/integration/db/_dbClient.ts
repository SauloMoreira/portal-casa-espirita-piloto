/**
 * Helper for REAL database integration tests (L-07).
 *
 * These tests connect to the actual Postgres instance and exercise the real
 * triggers, SECURITY DEFINER functions, auditing and idempotency guards — not
 * TS mirrors. Every test runs inside a transaction that is ALWAYS rolled back,
 * so there are no persistent side effects and the suite is reproducible.
 *
 * Authorization is simulated the way Supabase does it: `request.jwt.claims` is
 * set transaction-locally so `auth.uid()` (used inside SECURITY DEFINER
 * functions and `has_role`) resolves to the chosen user. We do NOT attempt to
 * `SET ROLE authenticated` because the sandbox role cannot, and it bypasses RLS;
 * table-level RLS enforcement is therefore validated at the security-scan /
 * policy-presence level and documented as a remaining gap in
 * docs/MAPA-COBERTURA-INVARIANTES.md. The RPC permission checks below ARE real
 * backend authorization (INV-ARQ-004) because they read `auth.uid()` inside the
 * function body.
 */
import { Pool, type PoolClient } from "pg";

export const HAS_DB = !!process.env.PGHOST;

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: process.env.PGHOST,
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      ssl: { rejectUnauthorized: false },
      max: 4,
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Run `fn` inside a transaction that is ALWAYS rolled back. Triggers, audit
 * rows and inserts all execute for real, are asserted, then discarded.
 */
export async function withRollback<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    try {
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  }
}

/** Simulate an authenticated request for `uid` (transaction-local). */
export async function actAs(c: PoolClient, uid: string): Promise<void> {
  await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: uid, role: "authenticated" }),
  ]);
}

/** Simulate an anonymous/no-session request (transaction-local). */
export async function actAsAnon(c: PoolClient): Promise<void> {
  await c.query("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({})]);
}

export async function getUserByRole(c: PoolClient, role: string): Promise<string | null> {
  const r = await c.query("SELECT user_id FROM user_roles WHERE role = $1 LIMIT 1", [role]);
  return r.rows[0]?.user_id ?? null;
}

export async function getAssistidoComTelefone(c: PoolClient): Promise<string | null> {
  const r = await c.query(
    `SELECT id FROM assistidos
      WHERE deleted_at IS NULL
        AND fn_normalize_phone(COALESCE(celular, telefone)) IS NOT NULL
        AND fn_normalize_phone(COALESCE(celular, telefone)) <> ''
      LIMIT 1`,
  );
  return r.rows[0]?.id ?? null;
}

export async function getAnyAssistido(c: PoolClient): Promise<string | null> {
  const r = await c.query("SELECT id FROM assistidos WHERE deleted_at IS NULL LIMIT 1");
  return r.rows[0]?.id ?? null;
}

export async function getAssistidoTratamento(c: PoolClient): Promise<string | null> {
  const r = await c.query("SELECT id FROM assistido_tratamentos LIMIT 1");
  return r.rows[0]?.id ?? null;
}

/** Read the current governed flag value (raw text). */
export async function getParametro(c: PoolClient, chave: string): Promise<string | null> {
  const r = await c.query("SELECT valor FROM regras_operacionais WHERE chave = $1 AND ativo = true", [
    chave,
  ]);
  return r.rows[0]?.valor ?? null;
}
