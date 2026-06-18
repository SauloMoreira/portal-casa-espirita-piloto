import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/logger.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

// Admin-only endpoint to decide pending self-registration requests.
// Approve  -> profile becomes 'ativo' and the SECURE DEFAULT role 'assistido' is
//             granted. Elevated roles are NEVER granted here.
// Reject   -> the orphan auth account/profile are removed and the request is
//             marked rejected with a reason. Everything is audited.
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const log = createLogger("manage-signup", req);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Não autorizado" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const isAdmin = (callerRoles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) return json({ error: "Apenas administradores podem decidir cadastros." }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action;
    const solicitacaoId: string = body?.solicitacao_id;
    const motivo: string | null = (body?.motivo ?? null) || null;

    if (!solicitacaoId || !["aprovar", "rejeitar"].includes(action || "")) {
      return json({ error: "Parâmetros inválidos." }, 400);
    }

    const { data: solic } = await admin
      .from("cadastro_solicitacoes")
      .select("*")
      .eq("id", solicitacaoId)
      .maybeSingle();
    if (!solic) return json({ error: "Solicitação não encontrada." }, 404);
    if (solic.status !== "pendente") return json({ error: "Solicitação já finalizada." }, 409);

    const targetUserId: string | null = solic.user_id;

    // ---- APPROVE ----
    if (action === "aprovar") {
      if (!targetUserId) return json({ error: "Solicitação sem conta vinculada." }, 400);

      const { error: profErr } = await admin
        .from("profiles")
        .update({ status: "ativo" })
        .eq("user_id", targetUserId);
      if (profErr) return json({ error: profErr.message }, 400);

      // Secure default role: assistido. (Not an admin role -> grant trigger allows it.)
      const { error: roleErr } = await admin
        .from("user_roles")
        .insert({ user_id: targetUserId, role: "assistido" });
      if (roleErr && !/duplicate|unique/i.test(roleErr.message)) {
        return json({ error: roleErr.message }, 400);
      }

      await admin
        .from("cadastro_solicitacoes")
        .update({ status: "aprovado", decidido_por: caller.id, decidido_em: new Date().toISOString() })
        .eq("id", solicitacaoId);

      await admin.from("audit_logs").insert({
        user_id: caller.id,
        tabela: "cadastro_solicitacoes",
        acao: "CADASTRO_APROVADO",
        registro_id: solicitacaoId,
        dados_novos: { target_user_id: targetUserId, papel_inicial: "assistido", aprovado_por: caller.id },
      });

      log.info("signup_approved", { by: caller.id, targetUserId });
      return json({ success: true, message: "Cadastro aprovado. Usuário criado como assistido." });
    }

    // ---- REJECT ----
    if (!motivo || motivo.trim().length < 3) {
      return json({ error: "Informe o motivo da rejeição." }, 400);
    }

    await admin.from("audit_logs").insert({
      user_id: caller.id,
      tabela: "cadastro_solicitacoes",
      acao: "CADASTRO_REJEITADO",
      registro_id: solicitacaoId,
      dados_novos: { target_user_id: targetUserId, motivo, rejeitado_por: caller.id },
    });

    // Remove the orphan auth account + metadata (no role was ever granted).
    if (targetUserId) {
      await admin.from("user_roles").delete().eq("user_id", targetUserId);
      await admin.from("profiles").delete().eq("user_id", targetUserId);
      await admin.auth.admin.deleteUser(targetUserId).catch(() => {});
    }

    await admin
      .from("cadastro_solicitacoes")
      .update({
        status: "rejeitado",
        motivo_rejeicao: motivo,
        decidido_por: caller.id,
        decidido_em: new Date().toISOString(),
        user_id: null,
      })
      .eq("id", solicitacaoId);

    log.info("signup_rejected", { by: caller.id, targetUserId });
    return json({ success: true, message: "Cadastro rejeitado." });
  } catch (err) {
    log.error("manage_signup_failed", { message: (err as Error).message });
    return json({ error: (err as Error).message }, 500);
  }
});
