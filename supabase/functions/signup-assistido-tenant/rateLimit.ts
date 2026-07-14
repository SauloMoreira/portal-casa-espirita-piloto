/**
 * STAB10-C1.2-B1 — Aplicação do rate-limit persistente no autocadastro público.
 *
 * Extrai o IP APENAS de headers do gateway (nunca do body/query), calcula HMAC
 * de IP/e-mail e chama a RPC atômica `fn_autocadastro_rate_limit_hit`.
 *
 * Escolha do header:
 *   1) `cf-connecting-ip` (Cloudflare — provedor confirmado no gateway Supabase).
 *   2) primeiro salto do `x-forwarded-for`, sanitizado (rejeita listas mal-formadas).
 * Nunca aceitamos cadeia arbitrária sem validação.
 */

import { bucketHmac } from "./contract.ts";

export type RateScope = "ip" | "email" | "instituicao";

export interface RateResult {
  permitido: boolean;
  contador: number;
  limite: number;
  retry_after_seconds: number;
}

const IP_V4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IP_V6 = /^[0-9a-f:]+$/i;

/**
 * Extrai o IP do gateway. Retorna null se nenhum header confiável estiver
 * presente ou se a cadeia for inválida.
 */
export function extractClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf && (IP_V4.test(cf) || IP_V6.test(cf))) return cf;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first && (IP_V4.test(first) || IP_V6.test(first))) return first;
  }
  return null;
}

/** Janela FIXA de 10 minutos alinhada ao múltiplo do minuto. */
export function windowStart(now: Date = new Date()): Date {
  const ms = now.getTime();
  const bucket = Math.floor(ms / (10 * 60 * 1000)) * (10 * 60 * 1000);
  return new Date(bucket);
}

export function windowExpiry(start: Date): Date {
  return new Date(start.getTime() + 10 * 60 * 1000);
}

/**
 * Chama a RPC de rate-limit para um escopo. Retorna resultado padronizado.
 * O cliente supabase passado DEVE ser o service_role.
 */
export async function hit(
  svc: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  scope: RateScope,
  bucketKey: string,
): Promise<RateResult> {
  const start = windowStart();
  const exp = windowExpiry(start);
  const { data, error } = await svc.rpc("fn_autocadastro_rate_limit_hit", {
    p_scope: scope,
    p_bucket_key: bucketKey,
    p_window_start: start.toISOString(),
    p_expires_at: exp.toISOString(),
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("RATE_LIMIT_RPC_INVALIDO");
  const r = row as Record<string, unknown>;
  return {
    permitido: Boolean(r.permitido),
    contador: Number(r.contador),
    limite: Number(r.limite),
    retry_after_seconds: Number(r.retry_after_seconds),
  };
}

/** Verifica sequencialmente IP → email → instituição, retornando o primeiro reject. */
export async function enforceAll(
  svc: Parameters<typeof hit>[0],
  hmacSecret: string,
  ctx: { ip: string | null; email: string; instituicaoId: string },
): Promise<RateResult | null> {
  if (ctx.ip) {
    const key = await bucketHmac(hmacSecret, "ip", ctx.ip);
    const r = await hit(svc, "ip", key);
    if (!r.permitido) return r;
  }
  {
    const key = await bucketHmac(hmacSecret, "email", ctx.email);
    const r = await hit(svc, "email", key);
    if (!r.permitido) return r;
  }
  {
    const r = await hit(svc, "instituicao", ctx.instituicaoId);
    if (!r.permitido) return r;
  }
  return null;
}
