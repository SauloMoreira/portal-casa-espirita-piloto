/**
 * STAB10-C1.2-B1-FIX01 — CORS dedicado do autocadastro público tenant-aware.
 * Fail-closed: OPTIONS + POST validam a origem antes de responder.
 */

const OFFICIAL_ORIGIN = "https://portal-casa-espirita-piloto.lovable.app";
const ALLOW_HEADERS   = "content-type, x-correlation-id";
const ALLOW_METHODS   = "POST, OPTIONS";

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
  let u: URL;
  try { u = new URL(origin); } catch { return false; }
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") {
    if (!allowLocal()) return false;
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return true;
  }
  if (u.protocol !== "https:") return false;
  if (origin === OFFICIAL_ORIGIN) return true;
  return parseExtra(Deno.env.get("AUTOCADASTRO_CORS_ORIGINS")).has(origin);
}

/** Cabeçalhos CORS por requisição. Origem não autorizada retorna 'null'. */
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

/** Bloqueia OPTIONS/POST quando a origem não estiver autorizada. */
export function enforceOriginOrForbid(req: Request): Response | null {
  const origin = req.headers.get("Origin");
  if (isOriginAllowed(origin)) return null;
  return new Response(JSON.stringify({ code: "ORIGEM_NAO_AUTORIZADA" }), {
    status: 403,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}
