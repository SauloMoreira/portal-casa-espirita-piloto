/**
 * STAB10-C1.2-B1 — CORS dedicado do autocadastro público tenant-aware.
 *
 * Fail-closed:
 *  - produção: aceita apenas `portal-casa-espirita-piloto.lovable.app`
 *    e origens adicionais listadas em `AUTOCADASTRO_CORS_ORIGINS` (CSV).
 *  - localhost SOMENTE quando `AUTOCADASTRO_ALLOW_LOCAL=true`.
 *  - métodos: apenas POST + OPTIONS. GET é rejeitado.
 *  - Origin ausente ou não autorizado → resposta 403 no fluxo browser.
 *
 * Não importa `_shared/cors.ts` (permissivo demais para esta superfície).
 * CORS é defesa complementar; HMAC + rate-limit + CAPTCHA são principais.
 */

const OFFICIAL_ORIGIN = "https://portal-casa-espirita-piloto.lovable.app";

const ALLOW_HEADERS = "content-type, x-correlation-id";
const ALLOW_METHODS = "POST, OPTIONS";

function parseExtra(csv: string | undefined): Set<string> {
  const s = new Set<string>();
  if (!csv) return s;
  for (const raw of csv.split(",")) {
    const v = raw.trim();
    if (v.startsWith("https://")) s.add(v);
  }
  return s;
}

function allowLocal(): boolean {
  return Deno.env.get("AUTOCADASTRO_ALLOW_LOCAL") === "true";
}

export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (allowLocal() && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    if (u.protocol !== "https:") return false;
    if (origin === OFFICIAL_ORIGIN) return true;
    return parseExtra(Deno.env.get("AUTOCADASTRO_CORS_ORIGINS")).has(origin);
  } catch {
    return false;
  }
}

/** Cabeçalhos CORS por requisição. Origin não autorizado → 'null'. */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = isOriginAllowed(origin);
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : "null",
    Vary: "Origin",
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
  };
}

/** Retorna null se OK; caso contrário Response 403 pronto. */
export function enforceOriginOrForbid(req: Request): Response | null {
  const origin = req.headers.get("Origin");
  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ code: "ORIGEM_NAO_AUTORIZADA" }), {
      status: 403,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  return null;
}
