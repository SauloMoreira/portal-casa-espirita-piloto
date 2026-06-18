import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;
// Unambiguous alphabet (no I, L, O, 0, 1).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Max failed recovery-code attempts within the window before blocking.
const MAX_RECOVERY_FAILS = 5;
const RECOVERY_WINDOW_MIN = 15;

function normalizeRecoveryCode(code: string): string {
  return (code || "").replace(/[\s-]/g, "").toUpperCase();
}

function genRecoveryCode(): string {
  const bytes = new Uint8Array(RECOVERY_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function hashCode(userId: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${userId}:${normalizeRecoveryCode(code)}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Admin = ReturnType<typeof createClient>;

async function hasVerifiedFactor(admin: Admin, userId: string): Promise<boolean> {
  try {
    const { data } = await (admin as any).auth.admin.mfa.listFactors({ userId });
    return (data?.factors || []).some((f: any) => f.status === "verified");
  } catch {
    return false;
  }
}

async function deleteAllFactors(admin: Admin, userId: string): Promise<number> {
  let removed = 0;
  try {
    const { data } = await (admin as any).auth.admin.mfa.listFactors({ userId });
    for (const f of data?.factors || []) {
      await (admin as any).auth.admin.mfa.deleteFactor({ id: f.id, userId }).catch(() => {});
      removed++;
    }
  } catch { /* ignore */ }
  return removed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const log = createLogger("mfa-manager", req);
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

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action;

    const audit = (acao: string, registro_id: string, dados: Record<string, unknown>) =>
      admin.from("audit_logs").insert({
        user_id: caller.id, tabela: "mfa", acao, registro_id, dados_novos: dados,
      });

    // ---- Log a client-side MFA lifecycle event (enrolled, disabled, fail) ----
    if (action === "audit") {
      const evento = String(body?.evento || "").slice(0, 60);
      const allowed = ["MFA_ATIVADO", "MFA_DESATIVADO", "MFA_FALHA", "MFA_ATIVACAO_INICIADA"];
      if (!allowed.includes(evento)) return json({ error: "Evento inválido" }, 400);
      await audit(evento, caller.id, { user_id: caller.id, detalhe: String(body?.detalhe || "").slice(0, 200) });
      return json({ success: true });
    }

    // ---- Generate single-use recovery codes (requires a verified factor) ----
    if (action === "generate_recovery") {
      if (!(await hasVerifiedFactor(admin, caller.id))) {
        return json({ error: "Ative o autenticador antes de gerar códigos de recuperação." }, 400);
      }
      // Invalidate previous codes, then issue a fresh batch.
      await admin.from("mfa_recovery_codes").delete().eq("user_id", caller.id);
      const codes: string[] = [];
      const rows: { user_id: string; code_hash: string }[] = [];
      for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        const c = genRecoveryCode();
        codes.push(c);
        rows.push({ user_id: caller.id, code_hash: await hashCode(caller.id, c) });
      }
      const { error } = await admin.from("mfa_recovery_codes").insert(rows);
      if (error) return json({ error: error.message }, 400);
      await audit("MFA_RECOVERY_GERADOS", caller.id, { user_id: caller.id, quantidade: codes.length });
      log.info("recovery_generated", { userId: caller.id });
      // Plaintext codes are returned exactly once.
      return json({ success: true, codes });
    }

    // ---- Consume a recovery code to reset own MFA (lost device) ----
    if (action === "consume_recovery") {
      const code = String(body?.code || "");
      if (!code) return json({ error: "Informe um código de recuperação." }, 400);

      // Brute-force protection: count recent failures.
      const sinceIso = new Date(Date.now() - RECOVERY_WINDOW_MIN * 60_000).toISOString();
      const { count: fails } = await admin
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .eq("user_id", caller.id)
        .eq("acao", "MFA_RECOVERY_FALHA")
        .gte("created_at", sinceIso);
      if ((fails || 0) >= MAX_RECOVERY_FAILS) {
        return json({ error: "Muitas tentativas. Tente novamente mais tarde." }, 429);
      }

      const hash = await hashCode(caller.id, code);
      const { data: match } = await admin
        .from("mfa_recovery_codes")
        .select("id")
        .eq("user_id", caller.id)
        .eq("code_hash", hash)
        .is("used_at", null)
        .maybeSingle();

      if (!match) {
        await audit("MFA_RECOVERY_FALHA", caller.id, { user_id: caller.id });
        return json({ error: "Código de recuperação inválido ou já utilizado." }, 400);
      }

      await admin.from("mfa_recovery_codes").update({ used_at: new Date().toISOString() }).eq("id", match.id);
      // Reset the second factor so the user regains access; they should re-enroll.
      const removed = await deleteAllFactors(admin, caller.id);
      // Drop any remaining codes — they belonged to the now-removed factor.
      await admin.from("mfa_recovery_codes").delete().eq("user_id", caller.id);
      await audit("MFA_RECOVERY_USADO", caller.id, { user_id: caller.id, fatores_removidos: removed });
      log.info("recovery_consumed", { userId: caller.id });
      return json({ success: true, message: "MFA desativado via código de recuperação. Reative quando possível." });
    }

    // ---- Administrative reset: master resets ANOTHER user's MFA ----
    if (action === "admin_reset") {
      const targetUserId = String(body?.target_user_id || "");
      if (!targetUserId) return json({ error: "Informe o usuário alvo." }, 400);

      const { data: callerRoles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
      const callerIsMaster = (callerRoles || []).some((r: any) => r.role === "administrador_master");
      if (!callerIsMaster) {
        return json({ error: "Apenas o Administrador Master pode resetar o MFA de outro usuário." }, 403);
      }
      if (targetUserId === caller.id) {
        return json({ error: "Use a desativação normal (com segundo fator) para sua própria conta." }, 400);
      }

      const removed = await deleteAllFactors(admin, targetUserId);
      await admin.from("mfa_recovery_codes").delete().eq("user_id", targetUserId);
      await audit("MFA_RESET_ADMIN", targetUserId, {
        target_user_id: targetUserId, executado_por: caller.id, fatores_removidos: removed,
      });
      log.info("admin_reset", { by: caller.id, targetUserId, removed });
      return json({ success: true, message: "MFA do usuário foi resetado." });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (err) {
    log.error("mfa_manager_failed", { message: (err as Error).message });
    return json({ error: (err as Error).message }, 500);
  }
});
