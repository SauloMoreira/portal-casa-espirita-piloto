import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildCorsHeaders } from "./cors.ts";

const ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-cron-secret";

export interface GuardResult {
  ok: boolean;
  response?: Response;
}

function deny(req: Request, status: number, error: string): GuardResult {
  const corsHeaders = buildCorsHeaders(req, ALLOW_HEADERS);
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  };
}

/**
 * Allows the request when EITHER:
 *  - the caller presents the internal cron secret (x-cron-secret header) that
 *    matches the value stored in the service-role-only `app_cron_secrets` table, OR
 *  - the caller is an authenticated user holding one of `allowedRoles`.
 *
 * This lets internal scheduled jobs (pg_cron) invoke the function while blocking
 * anonymous internet callers and non-privileged users.
 */
export async function guardCronOrStaff(
  req: Request,
  allowedRoles: string[],
): Promise<GuardResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  // 1) Internal cron secret path
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data } = await admin
      .from("app_cron_secrets")
      .select("secret")
      .eq("name", "default")
      .maybeSingle();
    if (data?.secret && data.secret === cronSecret) {
      return { ok: true };
    }
    return deny(req, 401, "Não autorizado");
  }

  // 2) Authenticated staff path
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return deny(req, 401, "Não autorizado");

  const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return deny(req, 401, "Não autorizado");

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const roleList = (roles || []).map((r: any) => r.role);
  if (!roleList.some((r) => allowedRoles.includes(r))) {
    return deny(req, 403, "Sem permissão");
  }
  return { ok: true };
}
