// SAAS-06-C1-FIX16 — Provisionamento de acesso para voluntários órfãos.
//
// Fluxo (chamado somente quando admin da instituição decide gerar acesso):
//   1. Valida caller é admin_instituicao / administrador_master do tenant.
//   2. Carrega o voluntário (deve ser do mesmo tenant, sem origem_user_id).
//   3. Reaproveita user por CPF/e-mail se já existir; senão cria auth.users
//      com o e-mail REAL informado (nunca placeholder/sintético).
//   4. Cria profile mínimo (idempotente).
//   5. Cria vínculo instituicao_usuarios (papel 'voluntario', status 'ativo').
//   6. Atualiza voluntarios.origem_user_id.
//   7. Concede o papel operacional escolhido via fn_conceder_acesso_operacional.
//   8. Registra auditoria com marcadores saas06_c1_fix16_voluntario_usuario:*.
//
// Idempotência: reutiliza usuário existente (por CPF/e-mail), NÃO duplica
// profile/vínculo/papel; retorna sucesso mesmo quando já estava concedido.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

type OperationalRole = "entrevistador" | "tarefeiro" | "coordenador_de_tratamento";
const VALID_ROLES: OperationalRole[] = [
  "entrevistador",
  "tarefeiro",
  "coordenador_de_tratamento",
];

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function isEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function generateRandomPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const buf = new Uint8Array(20);
  crypto.getRandomValues(buf);
  for (const b of buf) out += alphabet[b % alphabet.length];
  return out + "!Aa9";
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const log = createLogger("voluntario-provisionar-acesso", req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401, cors);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Não autorizado" }, 401, cors);

    const admin = createClient(url, service);

    const body = await req.json().catch(() => ({}));
    const voluntario_id = String(body?.voluntario_id ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "").trim() as OperationalRole;
    const motivo = body?.motivo ? String(body.motivo).trim() : null;

    if (!voluntario_id) return json({ error: "Informe o voluntário." }, 400, cors);
    if (!email || !isEmailValido(email)) {
      return json({ error: "Informe um e-mail válido para criar o acesso ao sistema." }, 400, cors);
    }
    if (!VALID_ROLES.includes(role)) {
      return json({ error: "Papel operacional inválido." }, 400, cors);
    }

    // 1. Carrega voluntário e valida tenant.
    const { data: vol, error: volErr } = await admin
      .from("voluntarios")
      .select("id, instituicao_id, nome_completo, cpf, celular, email, origem_user_id, status")
      .eq("id", voluntario_id)
      .maybeSingle();
    if (volErr || !vol) return json({ error: "Voluntário não encontrado." }, 404, cors);
    if (vol.status === "desligado") return json({ error: "Voluntário desligado não pode receber acesso." }, 400, cors);

    // 2. Verifica que o caller é admin do tenant do voluntário.
    const { data: isAdminInst } = await admin.rpc("user_is_admin_instituicao", {
      _user_id: caller.id,
      _instituicao_id: vol.instituicao_id,
    });
    const { data: callerRoles } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id);
    const rolesList = (callerRoles ?? []).map((r) => r.role);
    const isMaster = rolesList.includes("administrador_master");
    if (!isAdminInst && !isMaster) {
      return json({ error: "Você não é administrador desta instituição." }, 403, cors);
    }

    // 3. Reaproveita usuário existente por e-mail ou por CPF (evita duplicidade).
    let userId: string | null = vol.origem_user_id;
    let userCriado = false;

    if (!userId) {
      // Busca por CPF em profiles.
      if (vol.cpf) {
        const { data: byCpf } = await admin
          .from("profiles").select("user_id").eq("cpf", vol.cpf).maybeSingle();
        if (byCpf?.user_id) userId = byCpf.user_id;
      }

      // Busca por e-mail em auth.users via RPC/service_role.
      if (!userId) {
        const { data: usersByEmail } = await admin.auth.admin.listUsers({
          page: 1, perPage: 200,
        });
        const found = usersByEmail?.users?.find(
          (u) => (u.email ?? "").toLowerCase() === email,
        );
        if (found) userId = found.id;
      }

      // Cria novo auth.users com e-mail REAL informado.
      if (!userId) {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email,
          password: generateRandomPassword(),
          email_confirm: true,
        });
        if (cErr || !created?.user) {
          log.error("create_auth_failed", { message: cErr?.message });
          return json({
            error: "Não foi possível preparar este voluntário para acesso ao sistema. Se o problema continuar, abra um chamado técnico para o administrador geral da plataforma.",
            code: "VOLUNTARIO_USUARIO_VINCULO_FAILED",
          }, 500, cors);
        }
        userId = created.user.id;
        userCriado = true;
      }
    }

    // 4. Upsert profile mínimo (idempotente).
    const { data: existingProfile } = await admin
      .from("profiles").select("id").eq("user_id", userId!).maybeSingle();
    if (!existingProfile) {
      await admin.from("profiles").insert({
        user_id: userId!,
        nome_completo: vol.nome_completo,
        cpf: vol.cpf,
        celular: vol.celular,
        status: "ativo",
        created_by: caller.id,
      });
    }

    // 5. Vínculo institucional idempotente.
    const { data: vinc } = await admin
      .from("instituicao_usuarios")
      .select("id, status")
      .eq("instituicao_id", vol.instituicao_id)
      .eq("user_id", userId!)
      .eq("papel_local", "voluntario")
      .maybeSingle();
    if (!vinc) {
      await admin.from("instituicao_usuarios").insert({
        instituicao_id: vol.instituicao_id,
        user_id: userId!,
        papel_local: "voluntario",
        status: "ativo",
      });
    } else if (vinc.status !== "ativo") {
      await admin.from("instituicao_usuarios").update({ status: "ativo" }).eq("id", vinc.id);
    }

    // 6. Atualiza voluntario com origem_user_id + e-mail (se ainda vazio).
    const updateVol: Record<string, unknown> = { origem_user_id: userId! };
    if (!vol.email) updateVol.email = email;
    if (!vol.origem_cadastro) updateVol.origem_cadastro = "provisionado_por_admin";
    await admin.from("voluntarios").update(updateVol).eq("id", voluntario_id);

    // 7. Concede papel operacional via RPC oficial (mantém auditoria centralizada).
    const { data: grantData, error: grantErr } = await admin.rpc(
      "fn_conceder_acesso_operacional",
      {
        p_target_user_id: userId!,
        p_role: role,
        p_motivo: motivo,
        p_instituicao_id: vol.instituicao_id,
      },
    );
    if (grantErr) {
      log.error("grant_failed", { message: grantErr.message });
      return json({ error: grantErr.message, code: "VOLUNTARIO_USUARIO_VINCULO_FAILED" }, 500, cors);
    }
    const grantJson = (grantData ?? {}) as Record<string, unknown>;
    if (typeof grantJson.error === "string") {
      return json({ error: grantJson.error }, 400, cors);
    }

    // 8. Auditoria FIX16.
    await admin.from("audit_logs").insert([
      {
        user_id: caller.id,
        acao: userCriado
          ? "saas06_c1_fix16_voluntario_usuario:usuario_institucional_criado"
          : "saas06_c1_fix16_voluntario_usuario:usuario_institucional_vinculado",
        tabela: "voluntarios",
        registro_id: voluntario_id,
        dados_novos: {
          instituicao_id: vol.instituicao_id,
          user_id: userId,
          email,
          role,
          userCriado,
        },
      },
      {
        user_id: caller.id,
        acao: "saas06_c1_fix16_voluntario_usuario:voluntario_vinculado_usuario",
        tabela: "voluntarios",
        registro_id: voluntario_id,
        dados_novos: { user_id: userId, role },
      },
    ]);

    return json({
      success: true,
      user_id: userId,
      user_criado: userCriado,
      grant_status: grantJson.status ?? "concedido",
    }, 200, cors);
  } catch (err) {
    log.error("failed", { message: (err as Error).message });
    return json({
      error: "Não foi possível preparar este voluntário para acesso ao sistema. Se o problema continuar, abra um chamado técnico para o administrador geral da plataforma.",
      code: "VOLUNTARIO_USUARIO_VINCULO_FAILED",
    }, 500, cors);
  }
});
