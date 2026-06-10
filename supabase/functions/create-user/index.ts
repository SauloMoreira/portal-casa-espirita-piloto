import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log = createLogger("create-user", req);
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

    // Check caller role - admin or entrevistador can create users
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const callerRoleList = (callerRoles || []).map((r: any) => r.role);
    const isAdmin = callerRoleList.includes("admin");
    const isEntrevistador = callerRoleList.includes("entrevistador");

    const body = await req.json();
    const { email, password, role, profile, assistido_id, assistido_update } = body;

    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Entrevistadores can only create assistido users
    if (!isAdmin && isEntrevistador && role !== "assistido") {
      return new Response(JSON.stringify({ error: "Entrevistadores só podem criar acesso de assistidos" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAdmin && !isEntrevistador) {
      return new Response(JSON.stringify({ error: "Sem permissão para criar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // Rollback helper: if any post-creation step fails, remove the orphan auth user.
    const rollback = async (reason: string) => {
      log.error("create_rolled_back", { reason, userId });
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      return new Response(
        JSON.stringify({ error: `Falha ao criar usuário: ${reason}. Operação revertida.` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    };

    // Insert role
    const { error: roleErr } = await adminClient.from("user_roles").insert({ user_id: userId, role });
    if (roleErr) {
      return await rollback("não foi possível gravar o papel");
    }

    // Insert profile
    if (profile) {
      const { error: profileErr } = await adminClient.from("profiles").insert({
        ...profile,
        user_id: userId,
        created_by: caller.id,
      });
      if (profileErr) {
        return await rollback("não foi possível gravar o perfil");
      }
    }

    // Link assistido to user if assistido_id provided
    if (assistido_id) {
      const { error: linkErr } = await adminClient.from("assistidos").update({
        user_id: userId,
        ...(assistido_update || {}),
      }).eq("id", assistido_id);
      if (linkErr) {
        return await rollback("não foi possível vincular o assistido");
      }
    }

    log.info("user_created", { by: caller.id, userId, role });
    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log.error("create_failed", { message: err.message });
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
