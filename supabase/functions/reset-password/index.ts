import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateTempPassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log = createLogger("reset-password", req);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller identity
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Only admins can reset passwords
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = (callerRoles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem resetar senhas" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { target_user_id, mode } = body;

    if (!target_user_id || !mode) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios: target_user_id, mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode !== "temporary" && mode !== "email") {
      return new Response(JSON.stringify({ error: "Modo inválido. Use 'temporary' ou 'email'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target user info
    const { data: { user: targetUser }, error: getUserErr } = await adminClient.auth.admin.getUserById(target_user_id);
    if (getUserErr || !targetUser) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let resultMessage = "";
    let tempPassword: string | null = null;

    if (mode === "temporary") {
      tempPassword = generateTempPassword();
      const { error: updateErr } = await adminClient.auth.admin.updateUserById(target_user_id, {
        password: tempPassword,
      });
      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Force the user to change this temporary password on next login.
      await adminClient
        .from("profiles")
        .update({ senha_temporaria: true })
        .eq("user_id", target_user_id);
      resultMessage = "Senha temporária gerada com sucesso. O usuário deverá trocá-la no próximo acesso.";
    } else {
      // mode === "email"
      if (!targetUser.email) {
        return new Response(JSON.stringify({ error: "Usuário não possui e-mail cadastrado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Actually send the recovery email through the configured email provider.
      const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "";
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { error: sendErr } = await anonClient.auth.resetPasswordForEmail(targetUser.email, {
        redirectTo: siteUrl ? `${siteUrl}/reset-password` : undefined,
      });
      if (sendErr) {
        return new Response(JSON.stringify({ error: sendErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      resultMessage = "Link de redefinição enviado para o e-mail do usuário.";
    }

    // Audit log (no password stored)
    await adminClient.from("audit_logs").insert({
      user_id: caller.id,
      tabela: "auth.users",
      acao: "RESET_PASSWORD",
      registro_id: target_user_id,
      dados_novos: {
        mode,
        target_email: targetUser.email,
        executed_by: caller.id,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      message: resultMessage,
      ...(tempPassword ? { temp_password: tempPassword } : {}),
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
