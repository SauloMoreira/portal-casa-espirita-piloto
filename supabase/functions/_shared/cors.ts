/**
 * Centralized CORS policy for Edge Functions.
 *
 * Instead of a blanket `Access-Control-Allow-Origin: *`, we echo back the request
 * Origin only when it belongs to a known-legitimate surface of this system:
 *   - the published app and any Lovable preview/sandbox host
 *   - local development (localhost / 127.0.0.1 on any port)
 *
 * Server-to-server callers (webhooks, pg_cron, service-role) do NOT send an
 * Origin header, so they are unaffected — their authorization stays based on
 * signatures/secrets/JWT, never on CORS. When the Origin is missing or not
 * allowed we return "null", which browsers treat as a non-match and block.
 */

const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type";

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const host = url.hostname;
    // Local development servers.
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (host === "localhost" || host === "127.0.0.1")
    ) {
      return true;
    }
    // Only trust HTTPS for remote origins.
    if (url.protocol !== "https:") return false;
    return (
      host === "tratamentos-fer.lovable.app" ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovable.dev")
    );
  } catch {
    return false;
  }
}

/**
 * Build per-request CORS headers. Pass the incoming Request so the Origin can be
 * validated against the allowlist. `allowHeaders` overrides the default header
 * list (e.g. to add `x-cron-secret`).
 */
export function buildCorsHeaders(
  req: Request,
  allowHeaders: string = DEFAULT_ALLOW_HEADERS,
): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = isAllowedOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    Vary: "Origin",
    "Access-Control-Allow-Headers": allowHeaders,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}
