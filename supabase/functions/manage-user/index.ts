import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/logger.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

// Tables / columns that represent a meaningful historical or operational link to
// a user. If ANY of these reference the target user, a physical delete is blocked
// and the admin is told to inactivate instead — preserving auditability and
// referential integrity.
const LINK_CHECKS: Array<{ table: string; columns: string[]; label: string }> = [
  { table: "audit_logs", columns: ["user_id"], label: "ações auditadas" },
  { table: "entrevistas_fraternas", columns: ["entrevistador_id"], label: "entrevistas registradas" },
  { table: "ia_sugestoes", columns: ["entrevistador_id"], label: "sugestões de IA" },
  { table: "assistidos", columns: ["user_id", "created_by"], label: "vínculo com assistido(s)" },
  { table: "assistido_tratamentos", columns: ["created_by", "agendado_por"], label: "tratamentos" },
  { table: "agenda_tratamentos_assistido", columns: ["registrado_por"], label: "agenda de sessões" },
  { table: "presencas_tratamentos", columns: ["registrado_por"], label: "presenças de tratamento" },
  { table: "presencas_palestras", columns: ["registrado_por"], label: "presenças de palestra" },
  { table: "checkins_publicos", columns: ["registrado_por"], label: "check-ins públicos" },
  { table: "avisos_internos", columns: ["created_by", "destinatario_id"], label: "avisos internos" },
  { table: "whatsapp_conversas", columns: ["atendente_responsavel", "revisada_por"], label: "conversas de WhatsApp" },
  { table: "whatsapp_handoffs", columns: ["atendente_id"], label: "atendimentos de WhatsApp" },
  { table: "tipos_tratamento", columns: ["tarefeiro_id", "created_by"], label: "responsável por tratamentos" },
  { table: "coordenacao_tratamento", columns: ["coordenador_id", "created_by"], label: "coordenação de tratamentos (escopo)" },
  { table: "excecoes_operacionais", columns: ["criado_por", "atualizado_por"], label: "exceções operacionais" },
  { table: "programacao_padrao", columns: ["criado_por", "atualizado_por"], label: "programação padrão" },
  { table: "sessoes_publicas", columns: ["criado_por"], label: "sessões públicas" },
  { table: "palestras", columns: ["created_by"], label: "palestras" },
  { table: "funcoes_voluntariado", columns: ["created_by"], label: "funções de voluntariado" },
  { table: "voluntarios", columns: ["created_by"], label: "voluntários" },
  { table: "orientacoes_assistido", columns: ["created_by"], label: "orientações ao assistido" },
  { table: "ia_biblioteca", columns: ["created_by"], label: "biblioteca da IA" },
  { table: "ia_queixas", columns: ["created_by"], label: "queixas da IA" },
  { table: "ia_queixa_tratamento", columns: ["created_by"], label: "relações da IA" },
];

async function countActiveAdmins(admin: ReturnType<typeof createClient>): Promise<number> {
  const { data: adminRoles } = await admin.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (adminRoles || []).map((r: any) => r.user_id);
  if (ids.length === 0) return 0;
  const { data: activeProfiles } = await admin
    .from("profiles")
    .select("user_id")
    .in("user_id", ids)
    .eq("status", "ativo");
  return (activeProfiles || []).length;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const log = createLogger("manage-user", req);
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

    // Only admins may manage user lifecycle.
    const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const isAdmin = (callerRoles || []).some((r: any) => r.role === "admin");
    if (!isAdmin) return json({ error: "Apenas administradores podem gerenciar usuários" }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action;
    const targetUserId: string = body?.target_user_id;
    const motivo: string | null = (body?.motivo ?? null) || null;

    if (!targetUserId || !["inactivate", "reactivate", "delete", "check"].includes(action || "")) {
      return json({ error: "Parâmetros inválidos. Informe target_user_id e uma ação válida." }, 400);
    }

    // Target role (for last-admin protection)
    const { data: targetRoles } = await admin.from("user_roles").select("role").eq("user_id", targetUserId);
    const targetIsAdmin = (targetRoles || []).some((r: any) => r.role === "admin");

    // ---- INACTIVATE ----
    if (action === "inactivate") {
      if (targetUserId === caller.id) return json({ error: "Você não pode inativar seu próprio usuário." }, 400);
      if (targetIsAdmin && (await countActiveAdmins(admin)) <= 1) {
        return json({ error: "Não é possível inativar o último administrador ativo." }, 400);
      }
      const { error } = await admin.from("profiles").update({ status: "inativo" }).eq("user_id", targetUserId);
      if (error) return json({ error: error.message }, 400);
      await admin.from("audit_logs").insert({
        user_id: caller.id, tabela: "profiles", acao: "USER_INACTIVATED",
        registro_id: targetUserId, dados_novos: { executed_by: caller.id, motivo },
      });
      log.info("user_inactivated", { by: caller.id, targetUserId });
      return json({ success: true, message: "Usuário inativado. O histórico foi preservado." });
    }

    // ---- REACTIVATE ----
    if (action === "reactivate") {
      const { error } = await admin.from("profiles").update({ status: "ativo" }).eq("user_id", targetUserId);
      if (error) return json({ error: error.message }, 400);
      await admin.from("audit_logs").insert({
        user_id: caller.id, tabela: "profiles", acao: "USER_REACTIVATED",
        registro_id: targetUserId, dados_novos: { executed_by: caller.id, motivo },
      });
      log.info("user_reactivated", { by: caller.id, targetUserId });
      return json({ success: true, message: "Usuário reativado." });
    }

    // ---- CHECK / DELETE: evaluate critical links ----
    const blockers: string[] = [];

    if (targetUserId === caller.id) blockers.push("não é permitido excluir o próprio usuário");
    if (targetIsAdmin && (await countActiveAdmins(admin)) <= 1) {
      blockers.push("é o último administrador ativo");
    }

    for (const check of LINK_CHECKS) {
      let found = 0;
      for (const col of check.columns) {
        const { count } = await admin
          .from(check.table)
          .select("*", { count: "exact", head: true })
          .eq(col, targetUserId);
        found += count || 0;
        if (found > 0) break;
      }
      if (found > 0) blockers.push(check.label);
    }

    const canDelete = blockers.length === 0;

    if (action === "check") {
      return json({ success: true, can_delete: canDelete, blockers });
    }

    // ---- DELETE ----
    // Always record the deletion attempt for auditability.
    await admin.from("audit_logs").insert({
      user_id: caller.id, tabela: "auth.users", acao: "USER_DELETE_ATTEMPT",
      registro_id: targetUserId, dados_novos: { executed_by: caller.id, motivo, can_delete: canDelete, blockers },
    });

    if (!canDelete) {
      log.warn("user_delete_blocked", { by: caller.id, targetUserId, blockers });
      return json({
        error: "Exclusão bloqueada: o usuário possui vínculos históricos relevantes.",
        blockers,
        suggestion: "Use a inativação para revogar o acesso preservando o histórico.",
      }, 409);
    }

    // Safe to physically delete: remove own metadata, then the auth user.
    await admin.from("user_roles").delete().eq("user_id", targetUserId);
    await admin.from("profiles").delete().eq("user_id", targetUserId);
    await admin.from("notificacoes_preferencias").delete().eq("assistido_id", targetUserId).then(() => {}, () => {});

    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delErr) {
      log.error("user_delete_failed", { targetUserId, message: delErr.message });
      return json({ error: `Falha ao excluir: ${delErr.message}` }, 400);
    }

    await admin.from("audit_logs").insert({
      user_id: caller.id, tabela: "auth.users", acao: "USER_DELETED",
      registro_id: targetUserId, dados_novos: { executed_by: caller.id, motivo },
    });

    log.info("user_deleted", { by: caller.id, targetUserId });
    return json({ success: true, message: "Usuário excluído definitivamente." });
  } catch (err) {
    log.error("manage_user_failed", { message: (err as Error).message });
    return json({ error: (err as Error).message }, 500);
  }
});
