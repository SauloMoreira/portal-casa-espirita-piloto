import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger } from "../_shared/logger.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";


const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function isValidCPF(cpf: string): boolean {
  const c = cpf.replace(/\D/g, "");
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(c[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(c[10]);
}

// Public endpoint: creates a registration REQUEST. No access is granted here.
// The auth account is created with a status of "pendente" and NO role until an
// administrator approves it (which assigns the secure default role 'assistido').
Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const log = createLogger("request-signup", req);
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const nome_completo = String(body?.nome_completo || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const cpf = body?.cpf ? String(body.cpf).trim() : null;
    const celular = body?.celular ? String(body.celular).trim() : null;

    if (nome_completo.length < 3) return json({ error: "Informe seu nome completo." }, 400);
    if (!isValidEmail(email)) return json({ error: "E-mail inválido." }, 400);
    if (password.length < 8) return json({ error: "A senha deve ter pelo menos 8 caracteres." }, 400);
    if (cpf && cpf.replace(/\D/g, "").length > 0 && !isValidCPF(cpf)) {
      return json({ error: "CPF inválido." }, 400);
    }

    // Guard: avoid duplicate pending requests for the same email.
    const { data: existing } = await admin
      .from("cadastro_solicitacoes")
      .select("id")
      .eq("email", email)
      .eq("status", "pendente")
      .maybeSingle();
    if (existing) {
      return json({ error: "Já existe uma solicitação de cadastro pendente para este e-mail." }, 409);
    }

    // Create the auth account (password lives in auth, never in our tables).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome_completo, origem: "auto_cadastro" },
    });
    if (createErr || !created?.user) {
      const msg = createErr?.message || "Falha ao criar a conta.";
      // Surface a friendly message for already-registered emails.
      if (/already|registered|exists/i.test(msg)) {
        return json({ error: "Este e-mail já está cadastrado. Tente entrar ou recuperar a senha." }, 409);
      }
      return json({ error: msg }, 400);
    }

    const userId = created.user.id;

    const rollback = async (reason: string) => {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      log.error("request_signup_rolled_back", { reason, userId });
      return json({ error: `Falha ao registrar a solicitação: ${reason}.` }, 500);
    };

    // Profile is created as PENDING with NO role -> ProtectedRoute denies access.
    const { error: profErr } = await admin.from("profiles").insert({
      user_id: userId,
      nome_completo,
      cpf,
      celular,
      status: "pendente",
    });
    if (profErr) return await rollback("não foi possível gravar o perfil");

    const { data: solic, error: solErr } = await admin
      .from("cadastro_solicitacoes")
      .insert({ user_id: userId, nome_completo, email, cpf, celular, status: "pendente" })
      .select("id")
      .single();
    if (solErr) return await rollback("não foi possível registrar a solicitação");

    await admin.from("audit_logs").insert({
      user_id: userId,
      tabela: "cadastro_solicitacoes",
      acao: "CADASTRO_SOLICITADO",
      registro_id: solic.id,
      dados_novos: { nome_completo, email, origem: "tela_login" },
    });

    log.info("request_signup_created", { userId, solicitacao: solic.id });
    return json({
      success: true,
      message: "Cadastro enviado! Seu acesso está aguardando aprovação da administração.",
    });
  } catch (err) {
    log.error("request_signup_failed", { message: (err as Error).message });
    return json({ error: (err as Error).message }, 500);
  }
});
