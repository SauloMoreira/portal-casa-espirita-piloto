import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/logger.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { detectLegacyAssistidoPayload } from "./legacyGuard.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
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

    // Reject caller without any permitted role BEFORE parsing body / any writes.
    if (!isAdmin && !isEntrevistador) {
      return new Response(JSON.stringify({ error: "Sem permissão para criar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // ── SAAS-06-C1-STAB10-A.2 — Bloqueio fail-closed do fluxo legado ──
    // Qualquer chamada carregando `assistido_id` ou `assistido_update` (mesmo
    // com valor null/false/vazio) pertence ao fluxo antigo, que produzia
    // conta parcial sem `instituicao_usuarios`. O caminho canônico agora é a
    // Edge Function `provisionar-acesso-assistido`. Bloqueamos ANTES de
    // qualquer escrita (auth.admin.createUser, user_roles, profiles, assistidos).
    // Resposta HTTP 200 com `success:false` para que bundles antigos, que
    // descartam o body em respostas não-2xx, ainda exibam a mensagem amigável.
    const { hasAssistidoId, hasAssistidoUpdate, isLegacy } = detectLegacyAssistidoPayload(body);
    if (hasAssistidoId || hasAssistidoUpdate) {
      log.warn("legacy_assistido_flow_blocked", {
        caller_id: caller.id,
        has_assistido_id: hasAssistidoId,
        has_assistido_update: hasAssistidoUpdate,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Este fluxo de geração de acesso foi atualizado. Recarregue a página e tente novamente.",
          code: "FLUXO_ASSISTIDO_LEGADO_BLOQUEADO",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { email, password, role, profile } = body;

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

    // Legado (assistido_id / assistido_update) já bloqueado antes de qualquer
    // escrita pelo guard STAB10-A.2. O vínculo institucional canônico ocorre
    // via Edge Function `provisionar-acesso-assistido` + RPC transacional
    // `fn_provisionar_acesso_assistido`.



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
