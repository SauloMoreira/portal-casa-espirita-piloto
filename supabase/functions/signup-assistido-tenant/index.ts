/**
 * SAAS-06-C1-STAB10-C1.2-B1 — Edge pública de autocadastro tenant-aware.
 *
 * NÃO retorna sessão, access_token, refresh_token, user_id, instituicao_id
 * ou o marcador técnico. Códigos funcionais estáveis; PII nunca é logada.
 *
 * Fluxo (resumo — detalhes por bloco):
 *   1. CORS fail-closed + preflight.
 *   2. Método POST + body ≤ 8 KB + Content-Type application/json.
 *   3. Timeout global de 15s via AbortSignal.
 *   4. Validação Zod + normalização.
 *   5. Resolução tenant via slug (server-side).
 *   6. Rate-limit persistente (IP → email → instituição).
 *   7. Fingerprint HMAC v1 (sem senha/captcha).
 *   8. `fn_autocadastro_reservar` — dispatch por result_code:
 *        RESERVADO_NOVO       → captcha obrigatório → checagem prévia de e-mail
 *                                → signUp → verificação Auth Admin exigindo
 *                                  marker + request_id + email → marcar_auth_criado
 *                                → assistido_publico → next_action.
 *        EM_ANDAMENTO         → 202 se recente; recuperação de crash se antigo.
 *        RETOMAR_AUTH_CRIADO  → valida Auth Admin (marker/req_id/email) →
 *                                assistido_publico → next_action.
 *        CONCLUIDO            → next_action derivado do Auth Admin.
 *        FALHA_ANTERIOR       → AUTOCADASTRO_INDISPONIVEL_RETENTAR.
 *        ROLLBACK_FALHOU      → AUTOCADASTRO_INDISPONIVEL_RETENTAR + log crítico.
 *   9. Rollback com ownership check (marker) antes de deleteUser.
 *  10. `fn_autocadastro_marcar_resultado_falha` sempre com código técnico estável.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger, type Logger } from "../_shared/logger.ts";
import { corsHeaders, enforceOriginOrForbid } from "./cors.ts";
import {
  bodySchema,
  computeAuthMarker,
  computeFingerprint,
  fingerprintMaterial,
  normalizeCelular,
  normalizeCpf,
  normalizeEmail,
  normalizeNome,
  validateCelular,
  validateCpf,
  type SignupBody,
} from "./contract.ts";
import { enforceAll, extractClientIp } from "./rateLimit.ts";

// ============================ Env / const ==================================

const TIMEOUT_MS   = 15_000;
const BODY_MAX     = 8 * 1024;
const EM_ANDAMENTO_RECUPERAVEL_MS = 30_000;

interface Env {
  supabaseUrl: string;
  serviceRoleKey: string;
  anonKey: string;
  fingerprintSecret: string;
  rateLimitSecret: string;
  emailRedirectUrl: string | null;
  allowLocal: boolean;
}

function readEnv(): Env {
  const emailRedirect = Deno.env.get("AUTOCADASTRO_EMAIL_REDIRECT_URL") ?? null;
  // Se definido, exige HTTPS.
  if (emailRedirect && !/^https:\/\//i.test(emailRedirect)) {
    throw new Error("AUTOCADASTRO_EMAIL_REDIRECT_URL_INVALIDA");
  }
  return {
    supabaseUrl:       Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey:    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    anonKey:           Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    fingerprintSecret: Deno.env.get("AUTOCADASTRO_FINGERPRINT_SECRET") ?? "",
    rateLimitSecret:   Deno.env.get("AUTOCADASTRO_RATE_LIMIT_SECRET") ?? "",
    emailRedirectUrl:  emailRedirect,
    allowLocal:        Deno.env.get("AUTOCADASTRO_ALLOW_LOCAL") === "true",
  };
}

// ============================ Deps injetáveis ==============================

/** Interface mínima do cliente Supabase usada pelo handler (para testes). */
export interface HandlerDeps {
  env: Env;
  logger: Logger;
  svc: SupabaseClient;
  anon: SupabaseClient;
  now: () => Date;
}

// ============================ Respostas ====================================

type NextAction = "LOGIN" | "CONFIRM_EMAIL";

interface EdgeResponse {
  status: number;
  body: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
}

function ok(status: number, body: Record<string, unknown>, extra?: Record<string, string>): EdgeResponse {
  return { status, body, extraHeaders: extra };
}

// ============================ Body reader (limitado) =======================

async function readLimitedBody(req: Request, max: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > max) {
        try { reader.releaseLock(); } catch { /* ignore */ }
        return null;
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

// ============================ Auth Admin helpers ===========================

async function findAuthUserByEmail(
  svc: SupabaseClient,
  email: string,
): Promise<{ id: string; email: string | null; email_confirmed_at: string | null; user_metadata: Record<string, unknown> } | null> {
  // A Admin API não expõe query direta por e-mail: paginamos até encontrar.
  // Custo aceitável nesta fase (fallback + prevenção de enumeração).
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 5; page++) {
    const { data, error } = await (svc.auth.admin as unknown as {
      listUsers: (o: { page: number; perPage: number }) => Promise<{
        data: { users: Array<{ id: string; email: string | null; email_confirmed_at: string | null; user_metadata: Record<string, unknown> }> } | null;
        error: unknown;
      }>;
    }).listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const u of users) {
      if ((u.email ?? "").toLowerCase() === target) return u;
    }
    if (users.length < perPage) break;
  }
  return null;
}

async function getAuthUserById(
  svc: SupabaseClient,
  userId: string,
): Promise<{ id: string; email: string | null; email_confirmed_at: string | null; user_metadata: Record<string, unknown> } | null> {
  const { data, error } = await svc.auth.admin.getUserById(userId);
  if (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
  return data?.user ?? null;
}

function extractMarker(user: { user_metadata?: Record<string, unknown> } | null): {
  marker: string | null;
  requestId: string | null;
} {
  const md = user?.user_metadata ?? {};
  const marker = typeof md.autocadastro_marker === "string" ? md.autocadastro_marker : null;
  const requestId = typeof md.autocadastro_request_id === "string" ? md.autocadastro_request_id : null;
  return { marker, requestId };
}

function deriveNextAction(user: { email_confirmed_at?: string | null } | null): NextAction {
  return user?.email_confirmed_at ? "LOGIN" : "CONFIRM_EMAIL";
}

// ============================ RPCs wrappers ================================

interface ReservarRow { result_code: string; user_id: string | null; assistido_id: string | null; instituicao_id: string | null }

async function rpcReservar(
  svc: SupabaseClient,
  args: { idempotency_key: string; fingerprint: string; request_id: string; instituicao_id: string; expires_at: string },
): Promise<ReservarRow> {
  const { data, error } = await svc.rpc("fn_autocadastro_reservar", {
    p_idempotency_key:      args.idempotency_key,
    p_request_fingerprint:  args.fingerprint,
    p_request_id:           args.request_id,
    p_instituicao_id:       args.instituicao_id,
    p_expires_at:           args.expires_at,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("RESERVAR_SEM_LINHA");
  return row as ReservarRow;
}

async function rpcMarcarAuthCriado(
  svc: SupabaseClient,
  args: { idempotency_key: string; fingerprint: string; request_id: string; user_id: string },
): Promise<void> {
  const { error } = await svc.rpc("fn_autocadastro_marcar_auth_criado", {
    p_idempotency_key:     args.idempotency_key,
    p_request_fingerprint: args.fingerprint,
    p_request_id:          args.request_id,
    p_user_id:             args.user_id,
  });
  if (error) throw error;
}

async function rpcMarcarFalha(
  svc: SupabaseClient,
  args: { idempotency_key: string; fingerprint: string; request_id: string; resultado: string; auth_delete_ok: boolean },
): Promise<void> {
  const { error } = await svc.rpc("fn_autocadastro_marcar_resultado_falha", {
    p_idempotency_key:     args.idempotency_key,
    p_request_fingerprint: args.fingerprint,
    p_request_id:          args.request_id,
    p_resultado:           args.resultado,
    p_auth_delete_ok:      args.auth_delete_ok,
  });
  if (error) throw error;
}

async function rpcFinalizarAssistido(
  svc: SupabaseClient,
  args: {
    request_id: string;
    idempotency_key: string;
    fingerprint: string;
    instituicao_id: string;
    user_id: string;
    email_normalizado: string;
    nome_completo: string;
    cpf_normalizado: string;
    celular_normalizado: string;
    termos_versao: string;
    privacidade_versao: string;
    aceito_em: string;
  },
): Promise<{ result_code: string; assistido_id: string | null }> {
  const { data, error } = await svc.rpc("fn_autocadastro_assistido_publico", {
    p_request_id:           args.request_id,
    p_idempotency_key:      args.idempotency_key,
    p_request_fingerprint:  args.fingerprint,
    p_instituicao_id:       args.instituicao_id,
    p_user_id:              args.user_id,
    p_email_normalizado:    args.email_normalizado,
    p_nome_completo:        args.nome_completo,
    p_cpf_normalizado:      args.cpf_normalizado,
    p_celular_normalizado:  args.celular_normalizado,
    p_termos_versao:        args.termos_versao,
    p_privacidade_versao:   args.privacidade_versao,
    p_aceito_em:            args.aceito_em,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { result_code: String((row as { result_code: string }).result_code), assistido_id: (row as { assistido_id: string | null }).assistido_id ?? null };
}

// ============================ Ownership + rollback =========================

/**
 * Rollback controlado do Auth. NUNCA apaga usuário cujo `autocadastro_marker`
 * não bata com a operação corrente.
 * Retorna: { deleted, reason }.
 */
async function rollbackAuth(
  svc: SupabaseClient,
  userId: string,
  expectedMarker: string,
  expectedRequestId: string,
  logger: Logger,
): Promise<{ deleted: boolean; reason: string }> {
  const u = await getAuthUserById(svc, userId).catch(() => null);
  if (!u) {
    return { deleted: true, reason: "AUTH_JA_AUSENTE" };
  }
  const { marker, requestId } = extractMarker(u);
  if (marker !== expectedMarker || requestId !== expectedRequestId) {
    logger.error("rollback_ownership_divergente", {});
    return { deleted: false, reason: "MARKER_DIVERGENTE" };
  }
  const { error } = await svc.auth.admin.deleteUser(userId);
  if (error && (error as { status?: number }).status !== 404) {
    logger.error("rollback_deleteUser_falhou", {});
    return { deleted: false, reason: "DELETE_FALHOU" };
  }
  // Confirma ausência
  const check = await getAuthUserById(svc, userId).catch(() => null);
  if (check) return { deleted: false, reason: "AUTH_AINDA_PRESENTE" };
  return { deleted: true, reason: "OK" };
}

// ============================ Fluxos completos =============================

interface OperationCtx {
  body: SignupBody;
  emailNorm: string;
  nomeNorm: string;
  celularNorm: string;
  cpfNorm: string;
  instituicaoId: string;
  fingerprint: string;
  marker: string;
  requestId: string;
  aceitoEm: string;
}

async function finalizarComUsuarioExistente(
  deps: HandlerDeps,
  ctx: OperationCtx,
  userId: string,
): Promise<EdgeResponse> {
  const { svc, logger } = deps;

  // Consulta Auth Admin ANTES de finalizar (marker/req/email).
  const u = await getAuthUserById(svc, userId);
  if (!u) {
    // Auth sumiu — não deveria acontecer em CONCLUIDO/RETOMAR sem crash.
    await rpcMarcarFalha(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      resultado: "AUTH_RECOVERY_NAO_LOCALIZADO",
      auth_delete_ok: true,
    }).catch(() => { /* já registrado */ });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.requestId });
  }
  const { marker, requestId } = extractMarker(u);
  if (marker !== ctx.marker || requestId !== ctx.requestId ||
      (u.email ?? "").toLowerCase() !== ctx.emailNorm) {
    logger.error("finalize_marker_divergente", {});
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.requestId });
  }

  // Finaliza vínculo assistido.
  try {
    await rpcFinalizarAssistido(svc, {
      request_id: ctx.requestId,
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      instituicao_id: ctx.instituicaoId,
      user_id: userId,
      email_normalizado: ctx.emailNorm,
      nome_completo: ctx.body.nome_completo.trim(),
      cpf_normalizado: ctx.cpfNorm,
      celular_normalizado: ctx.celularNorm,
      termos_versao: ctx.body.termos_versao,
      privacidade_versao: ctx.body.privacidade_versao,
      aceito_em: ctx.aceitoEm,
    });
  } catch (e) {
    logger.error("assistido_publico_falhou", { msg: (e as Error).message });
    // Rollback controlado
    const rb = await rollbackAuth(svc, userId, ctx.marker, ctx.requestId, logger);
    await rpcMarcarFalha(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      resultado: rb.deleted ? "FINALIZACAO_FALHOU" : "AUTH_DELETE_NAO_CONFIRMADO",
      auth_delete_ok: rb.deleted,
    }).catch(() => { /* ignore */ });
    return ok(409, { code: rb.deleted ? "DADOS_JA_CADASTRADOS" : "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.requestId });
  }

  return ok(200, {
    code: "AUTOCADASTRO_CONCLUIDO",
    next_action: deriveNextAction(u),
    request_id: ctx.requestId,
  });
}

async function fluxoReservadoNovo(
  deps: HandlerDeps,
  ctx: OperationCtx,
): Promise<EdgeResponse> {
  const { svc, anon, env, logger } = deps;

  if (!ctx.body.captcha_token) {
    // Marcar falha na reserva já criada (nada de Auth foi tocado).
    await rpcMarcarFalha(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      resultado: "AUTH_SIGNUP_FALHOU",
      auth_delete_ok: true,
    }).catch(() => { /* ignore */ });
    return ok(400, { code: "CAPTCHA_OBRIGATORIO", request_id: ctx.requestId });
  }

  // Checagem prévia server-side (nunca revela existência específica).
  const existente = await findAuthUserByEmail(svc, ctx.emailNorm);
  if (existente) {
    await rpcMarcarFalha(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      resultado: "AUTH_SIGNUP_FALHOU",
      auth_delete_ok: true,
    }).catch(() => { /* ignore */ });
    return ok(409, { code: "DADOS_JA_CADASTRADOS", request_id: ctx.requestId });
  }

  // signUp com cliente anon + captchaToken + metadados obrigatórios.
  const signUpOptions: Record<string, unknown> = {
    captchaToken: ctx.body.captcha_token,
    data: {
      autocadastro_marker: ctx.marker,
      autocadastro_request_id: ctx.requestId,
    },
  };
  if (env.emailRedirectUrl) signUpOptions.emailRedirectTo = env.emailRedirectUrl;

  const signUp = await anon.auth.signUp({
    email: ctx.emailNorm,
    password: ctx.body.senha,
    options: signUpOptions,
  });

  // Verificação real de criação (nunca confiar apenas em data.user.id).
  let uid: string | null = signUp.data?.user?.id ?? null;
  if (!uid) {
    // Recuperação: procura por e-mail exato + marker/req_id.
    const found = await findAuthUserByEmail(svc, ctx.emailNorm);
    if (found) {
      const { marker, requestId } = extractMarker(found);
      if (marker === ctx.marker && requestId === ctx.requestId) uid = found.id;
    }
  }

  if (!uid) {
    logger.warn("signup_sem_uid", { hasError: Boolean(signUp.error) });
    await rpcMarcarFalha(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      resultado: "AUTH_SIGNUP_FALHOU",
      auth_delete_ok: true,
    }).catch(() => { /* ignore */ });
    return ok(409, { code: "DADOS_JA_CADASTRADOS", request_id: ctx.requestId });
  }

  // Confirma via Auth Admin: marker + request_id + email.
  const u = await getAuthUserById(svc, uid);
  const { marker, requestId } = extractMarker(u);
  if (!u || marker !== ctx.marker || requestId !== ctx.requestId ||
      (u.email ?? "").toLowerCase() !== ctx.emailNorm) {
    logger.error("post_signup_verificacao_falhou", {});
    // NÃO deleta — pode ser usuário alheio com mesmo e-mail (race raríssima).
    await rpcMarcarFalha(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      resultado: "AUTH_SIGNUP_FALHOU",
      auth_delete_ok: false,
    }).catch(() => { /* ignore */ });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.requestId });
  }

  // Marca auth_criado (idempotente).
  try {
    await rpcMarcarAuthCriado(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      user_id: uid,
    });
  } catch (e) {
    logger.error("marcar_auth_criado_falhou", { msg: (e as Error).message });
    const rb = await rollbackAuth(svc, uid, ctx.marker, ctx.requestId, logger);
    await rpcMarcarFalha(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      resultado: rb.deleted ? "AUTH_MARK_FALHOU" : "AUTH_DELETE_NAO_CONFIRMADO",
      auth_delete_ok: rb.deleted,
    }).catch(() => { /* ignore */ });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.requestId });
  }

  // Finaliza vínculo.
  return finalizarComUsuarioExistente(deps, ctx, uid);
}

async function fluxoEmAndamento(
  deps: HandlerDeps,
  ctx: OperationCtx,
): Promise<EdgeResponse> {
  const { svc, logger } = deps;

  // Consulta a linha atual para decidir recente vs antigo.
  const { data, error } = await svc
    .from("autocadastro_idempotencia")
    .select("updated_at,status,user_id")
    .eq("idempotency_key", ctx.body.idempotency_key)
    .maybeSingle();
  if (error) throw error;
  const updatedAt = data?.updated_at ? new Date(data.updated_at as string).getTime() : 0;
  const age = deps.now().getTime() - updatedAt;

  if (age < EM_ANDAMENTO_RECUPERAVEL_MS) {
    return ok(202, {
      code: "PROCESSANDO_RETENTE",
      request_id: ctx.requestId,
    }, { "Retry-After": "5" });
  }

  // Recuperação de crash: procura Auth por e-mail + marker.
  const u = await findAuthUserByEmail(svc, ctx.emailNorm);
  if (!u) {
    await rpcMarcarFalha(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      resultado: "AUTH_RECOVERY_NAO_LOCALIZADO",
      auth_delete_ok: true,
    }).catch(() => { /* ignore */ });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.requestId });
  }
  const { marker, requestId } = extractMarker(u);
  if (marker !== ctx.marker || requestId !== ctx.requestId) {
    logger.error("recovery_marker_divergente", {});
    return ok(409, { code: "DADOS_JA_CADASTRADOS", request_id: ctx.requestId });
  }
  // Marker bate — retoma marcando auth_criado.
  try {
    await rpcMarcarAuthCriado(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.requestId,
      user_id: u.id,
    });
  } catch (e) {
    logger.error("recovery_marcar_auth_criado_falhou", { msg: (e as Error).message });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.requestId });
  }
  return finalizarComUsuarioExistente(deps, ctx, u.id);
}

// ============================ Handler principal ============================

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  const { logger, env } = deps;
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  const originForbid = enforceOriginOrForbid(req);
  if (originForbid) return originForbid;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ code: "METODO_NAO_PERMITIDO" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }

  const ct = (req.headers.get("Content-Type") ?? "").toLowerCase();
  if (!ct.startsWith("application/json")) {
    return new Response(JSON.stringify({ code: "CONTENT_TYPE_INVALIDO" }), {
      status: 415, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const bytes = await readLimitedBody(req, BODY_MAX);
  if (bytes === null) {
    return new Response(JSON.stringify({ code: "PAYLOAD_MUITO_GRANDE" }), {
      status: 413, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return new Response(JSON.stringify({ code: "PAYLOAD_INVALIDO" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const check = bodySchema.safeParse(parsed);
  if (!check.success) {
    return new Response(JSON.stringify({ code: "PAYLOAD_INVALIDO" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const body = check.data;

  // Normalização + validação semântica.
  const emailNorm   = normalizeEmail(body.email);
  const nomeNorm    = normalizeNome(body.nome_completo);
  const celularNorm = normalizeCelular(body.celular);
  const cpfNorm     = normalizeCpf(body.cpf);

  if (!validateCelular(celularNorm)) {
    return new Response(JSON.stringify({ code: "PAYLOAD_INVALIDO" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (cpfNorm && !validateCpf(cpfNorm)) {
    return new Response(JSON.stringify({ code: "PAYLOAD_INVALIDO" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Resolução tenant via slug (server-side).
  const { data: inst, error: instErr } = await deps.svc
    .from("instituicoes")
    .select("id,status,autocadastro_habilitado")
    .eq("slug", body.instituicao_slug)
    .maybeSingle();
  if (instErr) {
    logger.error("inst_query_falhou", { msg: instErr.message });
    return new Response(JSON.stringify({ code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!inst || !inst.autocadastro_habilitado ||
      (inst.status !== "ativa" && inst.status !== "implantacao")) {
    return new Response(JSON.stringify({ code: "INSTITUICAO_INDISPONIVEL" }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const instituicaoId = inst.id as string;

  // Rate-limit persistente (toda tentativa conta).
  const rate = await enforceAll(deps.svc, env.rateLimitSecret, {
    ip: extractClientIp(req),
    email: emailNorm,
    instituicaoId,
  });
  if (rate) {
    return new Response(JSON.stringify({ code: "RATE_LIMIT_EXCEDIDO" }), {
      status: 429,
      headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(rate.retry_after_seconds) },
    });
  }

  // Fingerprint HMAC v1 (usa instituicao_id real).
  const material = fingerprintMaterial({
    instituicao_id: instituicaoId,
    email_normalizado: emailNorm,
    cpf_normalizado: cpfNorm,
    celular_normalizado: celularNorm,
    nome_normalizado: nomeNorm,
    termos_versao: body.termos_versao,
    privacidade_versao: body.privacidade_versao,
  });
  const fingerprint = await computeFingerprint(env.fingerprintSecret, material);

  const requestId = logger.requestId;
  const marker = await computeAuthMarker(env.fingerprintSecret, body.idempotency_key, requestId, emailNorm);
  const aceitoEm = deps.now().toISOString();

  const ctx: OperationCtx = {
    body, emailNorm, nomeNorm, celularNorm, cpfNorm,
    instituicaoId, fingerprint, marker, requestId, aceitoEm,
  };

  // Reserva de idempotência
  const expiresAt = new Date(deps.now().getTime() + 30 * 60 * 1000).toISOString();
  let reserva: ReservarRow;
  try {
    reserva = await rpcReservar(deps.svc, {
      idempotency_key: body.idempotency_key,
      fingerprint,
      request_id: requestId,
      instituicao_id: instituicaoId,
      expires_at: expiresAt,
    });
  } catch (e) {
    const msg = (e as { message?: string } | null)?.message ?? "";
    if (/IDEMPOTENCY_KEY_REUTILIZADA/i.test(msg)) {
      return new Response(JSON.stringify({ code: "IDEMPOTENCY_KEY_INVALIDA" }), {
        status: 409, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    logger.error("reservar_falhou", { msg });
    return new Response(JSON.stringify({ code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let resp: EdgeResponse;
  switch (reserva.result_code) {
    case "RESERVADO_NOVO":
      resp = await fluxoReservadoNovo(deps, ctx);
      break;
    case "EM_ANDAMENTO":
      resp = await fluxoEmAndamento(deps, ctx);
      break;
    case "RETOMAR_AUTH_CRIADO":
      resp = reserva.user_id
        ? await finalizarComUsuarioExistente(deps, ctx, reserva.user_id)
        : ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: requestId });
      break;
    case "CONCLUIDO":
      resp = reserva.user_id
        ? await (async () => {
            const u = await getAuthUserById(deps.svc, reserva.user_id!);
            return ok(200, {
              code: "AUTOCADASTRO_CONCLUIDO",
              next_action: deriveNextAction(u),
              request_id: requestId,
            });
          })()
        : ok(200, { code: "AUTOCADASTRO_CONCLUIDO", next_action: "LOGIN", request_id: requestId });
      break;
    case "FALHA_ANTERIOR":
    case "ROLLBACK_FALHOU":
      if (reserva.result_code === "ROLLBACK_FALHOU") logger.error("rollback_falhou_persistente", {});
      resp = ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: requestId });
      break;
    default:
      logger.error("result_code_desconhecido", { result_code: reserva.result_code });
      resp = ok(500, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: requestId });
  }

  return new Response(JSON.stringify(resp.body), {
    status: resp.status,
    headers: { ...cors, ...(resp.extraHeaders ?? {}), "Content-Type": "application/json" },
  });
}

// ============================ Serve ========================================

Deno.serve(async (req) => {
  const logger = createLogger("signup-assistido-tenant", req);
  let env: Env;
  try {
    env = readEnv();
  } catch (e) {
    logger.error("env_invalido", { msg: (e as Error).message });
    return new Response(JSON.stringify({ code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }

  const commonOpts = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const svc  = createClient(env.supabaseUrl, env.serviceRoleKey, commonOpts);
  const anon = createClient(env.supabaseUrl, env.anonKey, commonOpts);

  const deps: HandlerDeps = { env, logger, svc, anon, now: () => new Date() };

  // Timeout global de 15s.
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await Promise.race([
      handleRequest(req, deps),
      new Promise<Response>((_, reject) =>
        ctrl.signal.addEventListener("abort", () => reject(new Error("TIMEOUT"))),
      ),
    ]);
  } catch (e) {
    logger.error("handler_exception", { msg: (e as Error).message });
    return new Response(JSON.stringify({ code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  } finally {
    clearTimeout(t);
  }
});
