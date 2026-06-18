import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { getAdapter } from "../_shared/channel-adapter.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";


function normalizePhone(p: string): string {
  return (p || "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req, "authorization, x-client-info, apikey, content-type");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // ===== Auth: only signed-in staff (admin / coordenador) may reply. =====
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles || []).some((r: any) => r.role === "admin" || r.role === "coordenador_de_tratamento");
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Sem permissão" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== Validate input =====
    const body = await req.json().catch(() => ({}));
    const conversaId: string = String(body?.conversa_id ?? "").trim();
    const mensagem: string = String(body?.mensagem ?? "").trim();
    if (!conversaId || !mensagem) {
      return new Response(JSON.stringify({ error: "conversa_id e mensagem são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mensagem.length > 4096) {
      return new Response(JSON.stringify({ error: "Mensagem muito longa" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: conversa } = await admin
      .from("whatsapp_conversas").select("id, telefone").eq("id", conversaId).maybeSingle();
    if (!conversa) {
      return new Response(JSON.stringify({ error: "Conversa não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const telefone = normalizePhone(conversa.telefone);
    const adapter = getAdapter({
      ZAPI_INSTANCE_ID: Deno.env.get("ZAPI_INSTANCE_ID"),
      ZAPI_INSTANCE_TOKEN: Deno.env.get("ZAPI_INSTANCE_TOKEN"),
      ZAPI_BASE_URL: Deno.env.get("ZAPI_BASE_URL"),
      ZAPI_CLIENT_TOKEN: Deno.env.get("ZAPI_CLIENT_TOKEN"),
    });

    const send = await adapter.send(telefone, mensagem);

    // Audit the human reply (tagged autor=humano so the UI can distinguish it).
    await admin.from("notificacoes_log").insert({
      fila_id: null, direcao: "saida",
      payload_enviado: { telefone, mensagem, autor: "humano", atendente_id: userId },
      payload_recebido: send.raw ?? null,
      status: send.ok ? "enviado" : "falha", erro: send.error ?? null,
    });

    if (send.ok) {
      await admin.from("whatsapp_conversas")
        .update({ ultimo_contato_em: new Date().toISOString() }).eq("id", conversaId);
    }

    return new Response(JSON.stringify({ ok: send.ok, erro: send.error ?? null }), {
      status: send.ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
