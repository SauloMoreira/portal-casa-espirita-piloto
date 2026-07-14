/**
 * STAB10-C1.2-B1 — Contrato de entrada, normalização e HMAC do autocadastro
 * público tenant-aware.
 *
 * Serialização canônica versionada (v1) para:
 *  - `fingerprint` da requisição (identidade da operação, sem segredos/PII sensíveis);
 *  - `auth-marker` (marcador técnico que autoriza deleteUser e comprova ownership).
 *
 * NÃO inclui senha, captcha_token, Authorization, tokens ou secrets no material
 * assinado. HMAC-SHA-256 via Web Crypto.
 */

import { z } from "https://esm.sh/zod@3.23.8";

// ============================ Schemas ======================================

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const UUID_ANY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG    = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$/;
const CELULAR = /^\d{10,11}$/;
const CPF_DIG = /^\d{11}$/;

/** Allowlist para correlation IDs recebidos do cliente. */
const CORRELATION_RE = /^[A-Za-z0-9._:-]{1,64}$/;
export function sanitizeCorrelationId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  return CORRELATION_RE.test(s) ? s : null;
}

export function isValidUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_ANY.test(v);
}


export const bodySchema = z
  .object({
    instituicao_slug:   z.string().min(3).max(64).regex(SLUG),
    nome_completo:      z.string().trim().min(3).max(120),
    email:              z.string().trim().toLowerCase().email().max(254),
    senha:              z.string().min(8).max(72),
    cpf:                z.string().optional(),
    celular:            z.string(),
    aceite_termos:      z.literal(true),
    termos_versao:      z.string().trim().min(1).max(32),
    privacidade_versao: z.string().trim().min(1).max(32),
    idempotency_key:    z.string().regex(UUID_V4),
    captcha_token:      z.string().trim().min(1).max(4096).optional(),
  })
  .strict();

export type SignupBody = z.infer<typeof bodySchema>;

// ============================ Normalizações ================================

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function normalizeNome(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCelular(v: string): string {
  return v.replace(/\D/g, "");
}

export function normalizeCpf(v: string | undefined | null): string {
  if (!v) return "";
  return v.replace(/\D/g, "");
}

export function validateCelular(v: string): boolean {
  return CELULAR.test(v);
}

/** Validação estrutural + checksum de CPF (11 dígitos, DVs válidos). */
export function validateCpf(v: string): boolean {
  if (!CPF_DIG.test(v)) return false;
  if (/^(\d)\1{10}$/.test(v)) return false;
  const calc = (base: number[], startWeight: number): number => {
    let s = 0;
    for (let i = 0; i < base.length; i++) s += base[i] * (startWeight - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const digits = v.split("").map(Number);
  const d1 = calc(digits.slice(0, 9), 10);
  const d2 = calc(digits.slice(0, 10), 11);
  return d1 === digits[9] && d2 === digits[10];
}

// ============================ HMAC =========================================

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Material canônico do fingerprint (v1). Sem senha/captcha/tokens/secrets. */
export function fingerprintMaterial(input: {
  instituicao_id: string;
  email_normalizado: string;
  cpf_normalizado: string;
  celular_normalizado: string;
  nome_normalizado: string;
  termos_versao: string;
  privacidade_versao: string;
}): string {
  return [
    "v1",
    input.instituicao_id,
    input.email_normalizado,
    input.cpf_normalizado,
    input.celular_normalizado,
    input.nome_normalizado,
    input.termos_versao,
    input.privacidade_versao,
  ].join("|");
}

export async function computeFingerprint(
  secret: string,
  material: string,
): Promise<string> {
  return `v1:${await hmac(secret, material)}`;
}

/** Marcador técnico anexado ao user_metadata do Auth. */
export async function computeAuthMarker(
  secret: string,
  idempotencyKey: string,
  requestId: string,
  emailNormalizado: string,
): Promise<string> {
  const material = `auth-marker:v1|${idempotencyKey}|${requestId}|${emailNormalizado}`;
  return `v1:${await hmac(secret, material)}`;
}

/** HMAC de IP/e-mail para buckets de rate-limit. */
export async function bucketHmac(secret: string, scope: string, value: string): Promise<string> {
  return `v1:${await hmac(secret, `${scope}|${value}`)}`;
}
