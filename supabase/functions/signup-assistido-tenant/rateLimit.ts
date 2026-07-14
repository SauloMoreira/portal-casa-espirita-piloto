/**
 * STAB10-C1.2-B1-FIX01 — Rate-limit persistente e IP fail-closed.
 *
 * IP extraído SOMENTE de headers do gateway.
 *   1) `cf-connecting-ip` (fonte principal do Supabase Edge Gateway).
 *   2) primeiro salto de `x-forwarded-for`, apenas quando
 *      `AUTOCADASTRO_TRUST_XFF=true` (falso por padrão).
 * IP ausente ou inválido devolve `null` — o handler responde 503
 * `AUTOCADASTRO_INDISPONIVEL_RETENTAR` (nunca 400 IP_INDISPONIVEL).
 *
 * A RPC `fn_autocadastro_rate_limit_hit` passa a receber apenas
 * (scope, bucket_key) — a janela de 10 min é calculada no servidor.
 * O `instituicao_id` é sempre convertido em HMAC (v1) antes de virar bucket_key.
 */

import { bucketHmac } from "./contract.ts";

export type RateScope = "ip" | "email" | "instituicao";

export interface RateResult {
  permitido: boolean;
  contador: number;
  limite: number;
  retry_after_seconds: number;
}

// ---- IP parsing --------------------------------------------------------------

const IP_V4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

function isValidIpv6(v: string): boolean {
  // Aceita representações com colons e opcionalmente porção IPv4 embutida.
  if (!/^[0-9a-f:.]+$/i.test(v)) return false;
  if (!v.includes(":")) return false;
  if (v === "::") return false; // unspecified
  const parts = v.split(":");
  if (parts.length < 3 || parts.length > 8) return false;
  return true;
}

function isValidIp(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (s === "0.0.0.0" || s === "::" || s === "::1" || s === "127.0.0.1") return false;
  if (IP_V4.test(s)) return true;
  if (isValidIpv6(s)) return true;
  return false;
}

/** Devolve IP do gateway ou null. Nunca lê body/query. */
export function extractClientIp(req: Request): string | null {
  const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
  if (cf && isValidIp(cf)) return cf;

  const trustXff = Deno.env.get("AUTOCADASTRO_TRUST_XFF") === "true";
  if (trustXff) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim() ?? "";
      if (isValidIp(first)) return first;
    }
  }
  return null;
}

// ---- Bucket calls ------------------------------------------------------------

export async function hit(
  svc: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  scope: RateScope,
  bucketKey: string,
): Promise<RateResult> {
  const { data, error } = await svc.rpc("fn_autocadastro_rate_limit_hit", {
    p_scope: scope,
    p_bucket_key: bucketKey,
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

/** Sequência IP → email → instituição. Retorna o primeiro bloqueio ou null. */
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
    // instituicao_id NUNCA persistido em claro — sempre HMAC v1.
    const key = await bucketHmac(hmacSecret, "instituicao", ctx.instituicaoId);
    const r = await hit(svc, "instituicao", key);
    if (!r.permitido) return r;
  }
  return null;
}
