import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getAdapter } from "../_shared/channel-adapter.ts";

/**
 * Diagnostic-only endpoint for Z-API homologation.
 *
 * It NEVER returns secret values. It only reports:
 *   - whether each Z-API secret is present
 *   - whether the adapter considers itself configured
 *   - the masked final endpoint shape the adapter builds
 *   - the live instance connection status (GET /status on Z-API)
 *
 * Optionally, with { "telefone": "5511999999999" } in the POST body it sends a
 * single homologation message and reports the real Z-API result.
 */
function mask(value: string | undefined): string {
  if (!value) return "(vazio)";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const env = {
      ZAPI_INSTANCE_ID: Deno.env.get("ZAPI_INSTANCE_ID"),
      ZAPI_INSTANCE_TOKEN: Deno.env.get("ZAPI_INSTANCE_TOKEN"),
      ZAPI_BASE_URL: Deno.env.get("ZAPI_BASE_URL"),
      ZAPI_CLIENT_TOKEN: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    };

    const adapter = getAdapter(env);

    const baseUrl = (env.ZAPI_BASE_URL || "https://api.z-api.io").replace(/\/+$/, "");
    const instanceRoot =
      /\/instances\/[^/]+\/token\/[^/]+/.test(baseUrl)
        ? baseUrl
        : `${baseUrl}/instances/${env.ZAPI_INSTANCE_ID || ""}/token/${env.ZAPI_INSTANCE_TOKEN || ""}`;

    const maskedRoot = instanceRoot
      .replace(env.ZAPI_INSTANCE_ID || "\u0000", mask(env.ZAPI_INSTANCE_ID))
      .replace(env.ZAPI_INSTANCE_TOKEN || "\u0000", mask(env.ZAPI_INSTANCE_TOKEN));

    const secrets = {
      ZAPI_BASE_URL: { presente: Boolean(env.ZAPI_BASE_URL), valor: env.ZAPI_BASE_URL || "(default api.z-api.io)" },
      ZAPI_INSTANCE_ID: { presente: Boolean(env.ZAPI_INSTANCE_ID), valor: mask(env.ZAPI_INSTANCE_ID) },
      ZAPI_INSTANCE_TOKEN: { presente: Boolean(env.ZAPI_INSTANCE_TOKEN), valor: mask(env.ZAPI_INSTANCE_TOKEN) },
      ZAPI_CLIENT_TOKEN: { presente: Boolean(env.ZAPI_CLIENT_TOKEN), valor: env.ZAPI_CLIENT_TOKEN ? "(configurado)" : "(ausente/opcional)" },
    };

    const baseUrlOk = !/\/instances\//.test(baseUrl) || /\/instances\/[^/]+\/token\/[^/]+/.test(baseUrl);

    // Live connection check
    let conexao: unknown = null;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (env.ZAPI_CLIENT_TOKEN) headers["Client-Token"] = env.ZAPI_CLIENT_TOKEN;
      const res = await fetch(`${instanceRoot}/status`, { headers });
      const raw = await res.json().catch(() => ({}));
      conexao = { http: res.status, body: raw };
    } catch (e) {
      conexao = { erro: String(e) };
    }

    // Optional real send
    let envioTeste: unknown = null;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const telefone = String(body?.telefone || "").replace(/\D/g, "");
      if (telefone) {
        const mensagem = String(body?.mensagem || "✅ Homologação Z-API: mensagem de teste do sistema. Pode ignorar. 🌿");
        const send = await adapter.send(telefone, mensagem);
        envioTeste = { telefone, ok: send.ok, externalMessageId: send.externalMessageId ?? null, error: send.error ?? null, raw: send.raw ?? null };
      }
    }

    return new Response(
      JSON.stringify({
        adapter: adapter.name,
        configurado: adapter.isConfigured(),
        baseUrlOk,
        endpointFinal: `${maskedRoot}/send-text`,
        secrets,
        conexao,
        envioTeste,
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
