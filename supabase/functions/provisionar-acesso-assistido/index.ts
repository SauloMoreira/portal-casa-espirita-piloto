// SAAS-06-C1-STAB10-A / STAB10-A.1 — Provisionamento tenant-aware de acesso do assistido.
//
// Fluxo isolado do create-user. Só cria acesso quando o operador possui vínculo
// local ativo no mesmo tenant do assistido, com papel admin_instituicao ou
// entrevistador, e papel global correspondente.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

type ErrorCode =
  | "REQUEST_INVALIDO"
  | "NAO_AUTORIZADO"
  | "ASSISTIDO_NAO_ENCONTRADO"
  | "ASSISTIDO_EXCLUIDO"
  | "ASSISTIDO_SEM_INSTITUICAO"
  | "ASSISTIDO_ACESSO_INCONSISTENTE"
  | "CROSS_TENANT_ACCESS_DENIED"
  | "OPERADOR_SEM_PAPEL_GLOBAL"
  | "EMAIL_INVALIDO"
  | "CELULAR_INVALIDO"
  | "DATA_NASCIMENTO_INVALIDA"
  | "EMAIL_EM_USO"
  | "PROVISIONAMENTO_FALHOU"
  | "PROVISIONAMENTO_RESULTADO_INDETERMINADO"
  | "AUTH_USER_ORFAO";

// STAB10-A.1 — allowlist estrita de campos aceitos no body.
const ALLOWED_BODY_KEYS = new Set([
  "assistido_id",
  "email",
  "password",
  "celular",
  "data_nascimento",
]);

function json(cors: Record<string, string>, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function normalizeCelular(v: string): string {
  return (v || "").replace(/\D/g, "");
}
function isValidCelular(v: string): boolean {
  const d = normalizeCelular(v);
  return d.length === 10 || d.length === 11;
}
// STAB10-A.1: validação por round-trip YYYY-MM-DD (rejeita data impossível,
// formato divergente ou data futura).
function isValidBirthDate(v: string): boolean {
  if (typeof v !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 9999) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) return false;
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (dt.getTime() > todayUtc) return false;
  return true;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json(cors, 405, { error: "REQUEST_INVALIDO" as ErrorCode });
  }

  const log = createLogger("provisionar-acesso-assistido", req);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(cors, 401, { error: "NAO_AUTORIZADO" as ErrorCode });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData } = await callerClient.auth.getUser();
  const caller = authData?.user;
  if (!caller) return json(cors, 401, { error: "NAO_AUTORIZADO" as ErrorCode });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(cors, 400, { error: "REQUEST_INVALIDO" as ErrorCode });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(cors, 400, { error: "REQUEST_INVALIDO" as ErrorCode });
  }

  // STAB10-A.1: allowlist estrita — qualquer chave extra invalida o request
  // ANTES de qualquer leitura/escrita, sem logar valores sensíveis.
  for (const k of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(k)) {
      log.warn("body_key_nao_permitido", { key: k });
      return json(cors, 400, { error: "REQUEST_INVALIDO" as ErrorCode });
    }
  }

  const assistido_id = typeof body.assistido_id === "string" ? body.assistido_id : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const celular_raw = typeof body.celular === "string" ? body.celular : "";
  const data_nascimento = typeof body.data_nascimento === "string" ? body.data_nascimento : "";

  if (!assistido_id || !password) {
    return json(cors, 400, { error: "REQUEST_INVALIDO" as ErrorCode });
  }
  if (!isValidEmail(email)) return json(cors, 400, { error: "EMAIL_INVALIDO" as ErrorCode });
  if (!isValidCelular(celular_raw)) return json(cors, 400, { error: "CELULAR_INVALIDO" as ErrorCode });
  if (!isValidBirthDate(data_nascimento)) return json(cors, 400, { error: "DATA_NASCIMENTO_INVALIDA" as ErrorCode });
  if (password.length < 6) return json(cors, 400, { error: "REQUEST_INVALIDO" as ErrorCode });
  const celular = normalizeCelular(celular_raw);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: assistido, error: assErr } = await admin
    .from("assistidos")
    .select("id, nome, user_id, instituicao_id, deleted_at")
    .eq("id", assistido_id)
    .maybeSingle();
  if (assErr) {
    log.error("assistido_lookup_failed", { message: assErr.message });
    return json(cors, 500, { error: "PROVISIONAMENTO_FALHOU" as ErrorCode });
  }
  if (!assistido) return json(cors, 404, { error: "ASSISTIDO_NAO_ENCONTRADO" as ErrorCode });
  if (assistido.deleted_at) return json(cors, 400, { error: "ASSISTIDO_EXCLUIDO" as ErrorCode });
  if (!assistido.instituicao_id) return json(cors, 400, { error: "ASSISTIDO_SEM_INSTITUICAO" as ErrorCode });

  const { data: vinculos } = await admin
    .from("instituicao_usuarios")
    .select("papel_local, status")
    .eq("user_id", caller.id)
    .eq("instituicao_id", assistido.instituicao_id)
    .eq("status", "ativo");
  const papelLocal = (vinculos || [])
    .map((v: any) => v.papel_local as string)
    .find((p) => p === "admin_instituicao" || p === "entrevistador");
  if (!papelLocal) {
    log.warn("cross_tenant_denied", { caller: caller.id, assistido_id });
    return json(cors, 403, { error: "CROSS_TENANT_ACCESS_DENIED" as ErrorCode });
  }
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id);
  const roleList = (roles || []).map((r: any) => r.role as string);
  const globalOk =
    papelLocal === "admin_instituicao"
      ? roleList.includes("admin")
      : roleList.includes("admin") || roleList.includes("entrevistador");
  if (!globalOk) {
    return json(cors, 403, { error: "OPERADOR_SEM_PAPEL_GLOBAL" as ErrorCode });
  }

  // STAB10-A.1 — Idempotência rigorosa: confirma auth user + e-mail + estado
  // público completo antes de retornar already_provisioned.
  if (assistido.user_id) {
    const existingUserId = assistido.user_id as string;
    const { data: authUserRes, error: getAuthErr } = await admin.auth.admin.getUserById(existingUserId);
    if (getAuthErr || !authUserRes?.user) {
      return json(cors, 409, { error: "ASSISTIDO_ACESSO_INCONSISTENTE" as ErrorCode });
    }
    const authEmail = (authUserRes.user.email || "").trim().toLowerCase();
    if (authEmail !== email) {
      return json(cors, 409, { error: "ASSISTIDO_ACESSO_INCONSISTENTE" as ErrorCode });
    }
    const [{ data: prof }, { data: urs }, { data: iu }] = await Promise.all([
      admin.from("profiles").select("user_id").eq("user_id", existingUserId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", existingUserId).eq("role", "assistido"),
      admin.from("instituicao_usuarios").select("id, status, instituicao_id, papel_local")
        .eq("user_id", existingUserId).eq("instituicao_id", assistido.instituicao_id)
        .eq("status", "ativo").eq("papel_local", "assistido").maybeSingle(),
    ]);
    if (prof && (urs || []).length > 0 && iu) {
      return json(cors, 200, { ok: true, already_provisioned: true, user_id: existingUserId });
    }
    return json(cors, 409, { error: "ASSISTIDO_ACESSO_INCONSISTENTE" as ErrorCode });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created?.user) {
    const msg = createErr?.message || "";
    if (/already/i.test(msg) || /registered/i.test(msg)) {
      return json(cors, 409, { error: "EMAIL_EM_USO" as ErrorCode });
    }
    log.error("auth_create_failed", { message: msg });
    return json(cors, 500, { error: "PROVISIONAMENTO_FALHOU" as ErrorCode });
  }
  const novoUserId = created.user.id;

  const { data: rpcData, error: rpcErr } = await admin.rpc(
    "fn_provisionar_acesso_assistido",
    {
      p_operador_id: caller.id,
      p_novo_user_id: novoUserId,
      p_assistido_id: assistido.id,
      p_email: email,
      p_celular: celular,
      p_data_nascimento: data_nascimento,
    },
  );

  if (rpcErr) {
    log.error("rpc_failed", { message: rpcErr.message });
    const [{ data: p2 }, { data: r2 }, { data: iu2 }, { data: a2 }] = await Promise.all([
      admin.from("profiles").select("user_id").eq("user_id", novoUserId).maybeSingle(),
      admin.from("user_roles").select("role").eq("user_id", novoUserId),
      admin.from("instituicao_usuarios").select("id").eq("user_id", novoUserId).maybeSingle(),
      admin.from("assistidos").select("user_id").eq("id", assistido.id).maybeSingle(),
    ]);
    const linked = a2?.user_id === novoUserId;
    const completa = !!p2 && (r2 || []).length > 0 && !!iu2 && linked;
    if (completa) {
      return json(cors, 200, { ok: true, user_id: novoUserId });
    }
    const nadaGravado = !p2 && (r2 || []).length === 0 && !iu2 && !linked;
    if (nadaGravado) {
      const { error: delErr } = await admin.auth.admin.deleteUser(novoUserId);
      if (delErr) {
        // STAB10-A.1 — auth user órfão: informa e não expõe UUID/email
        log.error("auth_user_orfao", { user_id: novoUserId, message: delErr.message });
        return json(cors, 500, { error: "AUTH_USER_ORFAO" as ErrorCode });
      }
      return json(cors, 500, { error: "PROVISIONAMENTO_FALHOU" as ErrorCode });
    }
    log.error("resultado_indeterminado", { user_id: novoUserId, assistido_id });
    return json(cors, 500, { error: "PROVISIONAMENTO_RESULTADO_INDETERMINADO" as ErrorCode });
  }

  log.info("provisionado", { by: caller.id, user_id: novoUserId, assistido_id });
  return json(cors, 200, { ok: true, user_id: novoUserId, data: rpcData });
});
