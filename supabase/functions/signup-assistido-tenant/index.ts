/**
 * SAAS-06-C1-STAB10-C1.2-B1-FIX01 — Edge pública tenant-aware do autocadastro.
 *
 * Correções obrigatórias (FIX01):
 *  - Request IDs separados: correlation_id (só logs), request_id_inicial
 *    (server-side), canonical_request_id (devolvido pela reserva).
 *  - Auth Admin sempre via helpers "checked" (sem `.catch(() => null)`).
 *  - Timeout cooperativo baseado em deadline (sem Promise.race).
 *  - Reconciliação (leituras curtas) antes de rollback final.
 *  - Env fail-closed; redirect obrigatório validado por allowlist server-side.
 *  - CONCLUIDO exige Auth real; LOGIN/CONFIRM_EMAIL derivam do Auth confirmado.
 *  - RETOMAR_AUTH_CRIADO: ownership divergente NÃO exclui; marca falha.
 *  - Reserva EM_ANDAMENTO por `created_at` (nunca por updated_at).
 *  - Rate-limit: IP fail-closed → 503 AUTOCADASTRO_INDISPONIVEL_RETENTAR.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { createLogger, type Logger } from "../_shared/logger.ts";
import { corsHeaders, enforceOriginOrForbid } from "./cors.ts";
import {
  bodySchema,
  computeAuthMarker,
  computeFingerprint,
  fingerprintMaterial,
  isValidUuid,
  normalizeCelular,
  normalizeCpf,
  normalizeEmail,
  normalizeNome,
  sanitizeCorrelationId,
  validateCelular,
  validateCpf,
  type SignupBody,
} from "./contract.ts";
import { enforceAll, extractClientIp } from "./rateLimit.ts";
import {
  deleteAuthUserChecked,
  extractMarker,
  findAuthUserByEmailChecked,
  getAuthUserByIdChecked,
  readEnvChecked,
  type AuthUserMinimo,
  type EnvSeguro,
} from "./authAdmin.ts";
import { readRuntimeEnabledFromEnv } from "./runtime.ts";

// ============================ Constantes ===================================

const TIMEOUT_MS = 15_000;
const BODY_MAX   = 8 * 1024;
const EM_ANDAMENTO_RECENTE_MS = 90_000; // threshold por created_at

// ============================ Deps injetáveis ==============================

export interface HandlerDeps {
  env: EnvSeguro;
  logger: Logger;               // usa apenas .info/.warn/.error; requestId aqui é correlation_id
  svc: SupabaseClient;
  anon: SupabaseClient;
  now: () => Date;
  correlationId: string;
  requestIdInicial: string;
  deadlineAt: number;           // epoch ms; para deadline cooperativo
  /**
   * FIX02 — Kill switch global. Somente `true` habilita o fluxo funcional.
   * Ausente/false/qualquer outro valor mantém a Edge desativada (503 sem
   * side-effects). Verificado ANTES de qualquer operação funcional.
   */
  runtimeEnabled: boolean;
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

function deriveNextAction(user: AuthUserMinimo | null): NextAction {
  return user?.email_confirmed_at ? "LOGIN" : "CONFIRM_EMAIL";
}

// ============================ Body reader ==================================

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
      if (total > max) { try { reader.releaseLock(); } catch { /* ignore */ } return null; }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.byteLength; }
  return out;
}

// ============================ Deadline cooperativo =========================

function deadlineExpirado(deps: HandlerDeps): boolean {
  return deps.now().getTime() >= deps.deadlineAt;
}

// ============================ RPCs wrappers ================================

interface ReservarRow {
  result_code: string;
  user_id: string | null;
  assistido_id: string | null;
  instituicao_id: string | null;
  canonical_request_id: string;
}

async function rpcReservar(
  svc: SupabaseClient,
  args: { idempotency_key: string; fingerprint: string; request_id: string; instituicao_id: string; expires_at: string },
): Promise<ReservarRow> {
  const { data, error } = await svc.rpc("fn_autocadastro_reservar", {
    p_idempotency_key:     args.idempotency_key,
    p_request_fingerprint: args.fingerprint,
    p_request_id:          args.request_id,
    p_instituicao_id:      args.instituicao_id,
    p_expires_at:          args.expires_at,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("RESERVAR_SEM_LINHA");
  const r = row as ReservarRow;
  if (!isValidUuid(r.canonical_request_id)) throw new Error("RESERVAR_CANONICAL_INVALIDO");
  return r;
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
  logger: Logger,
  args: { idempotency_key: string; fingerprint: string; request_id: string; resultado: string; auth_delete_ok: boolean },
): Promise<void> {
  const { error } = await svc.rpc("fn_autocadastro_marcar_resultado_falha", {
    p_idempotency_key:     args.idempotency_key,
    p_request_fingerprint: args.fingerprint,
    p_request_id:          args.request_id,
    p_resultado:           args.resultado,
    p_auth_delete_ok:      args.auth_delete_ok,
  });
  if (error) {
    logger.error("CRITICAL_marcar_falha_falhou", { resultado: args.resultado });
    throw error;
  }
}

async function rpcFinalizarAssistido(
  svc: SupabaseClient,
  args: {
    request_id: string; idempotency_key: string; fingerprint: string;
    instituicao_id: string; user_id: string;
    email_normalizado: string; nome_completo: string; cpf_normalizado: string;
    celular_normalizado: string; termos_versao: string; privacidade_versao: string; aceito_em: string;
  },
): Promise<{ result_code: string; assistido_id: string | null }> {
  const { data, error } = await svc.rpc("fn_autocadastro_assistido_publico", {
    p_request_id:          args.request_id,
    p_idempotency_key:     args.idempotency_key,
    p_request_fingerprint: args.fingerprint,
    p_instituicao_id:      args.instituicao_id,
    p_user_id:             args.user_id,
    p_email_normalizado:   args.email_normalizado,
    p_nome_completo:       args.nome_completo,
    p_cpf_normalizado:     args.cpf_normalizado,
    p_celular_normalizado: args.celular_normalizado,
    p_termos_versao:       args.termos_versao,
    p_privacidade_versao:  args.privacidade_versao,
    p_aceito_em:           args.aceito_em,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    result_code: String((row as { result_code: string }).result_code),
    assistido_id: (row as { assistido_id: string | null }).assistido_id ?? null,
  };
}

// ============================ Reconciliação idem ===========================

interface IdemSnapshot {
  status: string;
  user_id: string | null;
  request_id: string | null;
  request_fingerprint: string | null;
  instituicao_id: string | null;
  created_at: string | null;
}

async function lerIdempotencia(svc: SupabaseClient, idempotencyKey: string): Promise<IdemSnapshot | null> {
  const { data, error } = await svc
    .from("autocadastro_idempotencia")
    .select("status,user_id,request_id,request_fingerprint,instituicao_id,created_at")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return (data as IdemSnapshot | null) ?? null;
}

async function reconciliar(
  svc: SupabaseClient,
  idempotencyKey: string,
  esperado: { canonical: string; fingerprint: string; instituicaoId: string; userId: string },
  tentativas = 3,
): Promise<IdemSnapshot | null> {
  for (let i = 0; i < tentativas; i++) {
    const snap = await lerIdempotencia(svc, idempotencyKey);
    if (snap) {
      const bate =
        snap.request_id === esperado.canonical &&
        snap.request_fingerprint === esperado.fingerprint &&
        snap.instituicao_id === esperado.instituicaoId &&
        (snap.user_id === esperado.userId || snap.user_id === null);
      if (bate) return snap;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

// ============================ Rollback checked =============================

/**
 * Rollback controlado: extrai marker → só apaga se ownership bater.
 * `auth_delete_ok=true` só quando GET posterior confirma 404.
 */
async function rollbackAuth(
  svc: SupabaseClient,
  userId: string,
  expectedMarker: string,
  expectedRequestId: string,
  expectedEmail: string,
  logger: Logger,
): Promise<{ deleted: boolean; reason: string }> {
  let u: AuthUserMinimo | null;
  try {
    u = await getAuthUserByIdChecked(svc, userId);
  } catch {
    return { deleted: false, reason: "GET_INICIAL_FALHOU" };
  }
  if (!u) return { deleted: true, reason: "AUTH_JA_AUSENTE" };

  const { marker, requestId } = extractMarker(u);
  if (marker !== expectedMarker || requestId !== expectedRequestId ||
      (u.email ?? "").toLowerCase() !== expectedEmail) {
    logger.error("rollback_ownership_divergente", {});
    return { deleted: false, reason: "OWNERSHIP_DIVERGENTE" };
  }

  try {
    await deleteAuthUserChecked(svc, userId);
  } catch {
    return { deleted: false, reason: "DELETE_FALHOU" };
  }

  // Confirma ausência via GET posterior.
  try {
    const check = await getAuthUserByIdChecked(svc, userId);
    if (check) return { deleted: false, reason: "AUTH_AINDA_PRESENTE" };
  } catch {
    return { deleted: false, reason: "GET_CONFIRMATORIO_FALHOU" };
  }
  return { deleted: true, reason: "OK" };
}

// ============================ Contexto operacional =========================

interface OperationCtx {
  body: SignupBody;
  emailNorm: string;
  nomeNorm: string;
  celularNorm: string;
  cpfNorm: string;
  instituicaoId: string;
  fingerprint: string;
  marker: string;
  canonical: string;   // canonical_request_id da RPC de reserva
  aceitoEm: string;
}

// ============================ Finalização (com Auth) =======================

async function finalizarComUsuarioExistente(
  deps: HandlerDeps,
  ctx: OperationCtx,
  userId: string,
): Promise<EdgeResponse> {
  const { svc, logger } = deps;

  let u: AuthUserMinimo | null;
  try {
    u = await getAuthUserByIdChecked(svc, userId);
  } catch (e) {
    logger.error("finalize_get_falhou", { msg: (e as Error).message });
    return ok(500, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }
  if (!u) {
    logger.error("finalize_auth_ausente", {});
    await rpcMarcarFalha(svc, logger, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      resultado: "AUTH_AUSENTE_NA_RETOMADA",
      auth_delete_ok: true,
    });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }
  const { marker, requestId } = extractMarker(u);
  if (marker !== ctx.marker || requestId !== ctx.canonical ||
      (u.email ?? "").toLowerCase() !== ctx.emailNorm) {
    logger.error("finalize_ownership_divergente", {});
    await rpcMarcarFalha(svc, logger, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      resultado: "OWNERSHIP_DIVERGENTE",
      auth_delete_ok: false,
    });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }

  try {
    await rpcFinalizarAssistido(svc, {
      request_id: ctx.canonical,
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
    // Reconciliação curta ANTES de rollback.
    const snap = await reconciliar(svc, ctx.body.idempotency_key, {
      canonical: ctx.canonical, fingerprint: ctx.fingerprint,
      instituicaoId: ctx.instituicaoId, userId,
    });
    if (snap?.status === "concluido") {
      // Estado já persistido — derivar next_action pelo Auth.
      return ok(200, {
        code: "AUTOCADASTRO_CONCLUIDO",
        next_action: deriveNextAction(u),
        request_id: ctx.canonical,
      });
    }
    if (snap?.status === "falhou" || snap?.status === "rollback_falhou") {
      return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
    }
    // Só executa rollback se o estado permaneceu em auth_criado.
    const rb = await rollbackAuth(svc, userId, ctx.marker, ctx.canonical, ctx.emailNorm, logger);
    await rpcMarcarFalha(svc, logger, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      resultado: rb.deleted ? "FINALIZACAO_FALHOU" : "AUTH_DELETE_NAO_CONFIRMADO",
      auth_delete_ok: rb.deleted,
    });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }

  return ok(200, {
    code: "AUTOCADASTRO_CONCLUIDO",
    next_action: deriveNextAction(u),
    request_id: ctx.canonical,
  });
}

// ============================ Fluxos =======================================

async function fluxoReservadoNovo(deps: HandlerDeps, ctx: OperationCtx): Promise<EdgeResponse> {
  const { svc, anon, env, logger } = deps;




  // Checagem defensiva ANTES de gastar signUp/quota.
  const existente = await findAuthUserByEmailChecked(svc, ctx.emailNorm);
  if (existente) {
    await rpcMarcarFalha(svc, logger, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      resultado: "AUTH_SIGNUP_FALHOU",
      auth_delete_ok: true,
    });
    return ok(409, { code: "DADOS_JA_CADASTRADOS", request_id: ctx.canonical });
  }

  // Deadline antes do Auth: aborta cooperativamente.
  if (deadlineExpirado(deps)) {
    await rpcMarcarFalha(svc, logger, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      resultado: "TIMEOUT_ANTES_AUTH",
      auth_delete_ok: true,
    });
    return ok(504, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }

  const signUpOptions: Record<string, unknown> = {
    captchaToken: ctx.body.captcha_token,
    emailRedirectTo: env.emailRedirectUrl,
    data: {
      autocadastro_marker: ctx.marker,
      autocadastro_request_id: ctx.canonical,
    },
  };
  const signUp = await anon.auth.signUp({
    email: ctx.emailNorm,
    password: ctx.body.senha,
    options: signUpOptions,
  });

  // Extrai UUID válido ou reconcilia por e-mail. NUNCA re-invoca signUp.
  let uid: string | null = null;
  const candidato = signUp.data?.user?.id;
  if (typeof candidato === "string" && isValidUuid(candidato)) uid = candidato;

  if (!uid) {
    // Polling limitado: até 3 tentativas com ~200ms.
    for (let i = 0; i < 3 && !uid; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const found = await findAuthUserByEmailChecked(svc, ctx.emailNorm);
      if (found) {
        const { marker, requestId } = extractMarker(found);
        if (marker === ctx.marker && requestId === ctx.canonical) uid = found.id;
      }
    }
  }

  if (!uid) {
    logger.warn("signup_sem_uid", { hasError: Boolean(signUp.error) });
    await rpcMarcarFalha(svc, logger, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      resultado: "AUTH_SIGNUP_FALHOU",
      auth_delete_ok: true,
    });
    return ok(409, { code: "DADOS_JA_CADASTRADOS", request_id: ctx.canonical });
  }

  // Verificação pós-signup: marker + canonical + email.
  let u: AuthUserMinimo | null;
  try {
    u = await getAuthUserByIdChecked(svc, uid);
  } catch (e) {
    logger.error("post_signup_get_falhou", { msg: (e as Error).message });
    return ok(500, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }
  const meta = extractMarker(u);
  if (!u || meta.marker !== ctx.marker || meta.requestId !== ctx.canonical ||
      (u.email ?? "").toLowerCase() !== ctx.emailNorm) {
    logger.error("post_signup_verificacao_falhou", {});
    await rpcMarcarFalha(svc, logger, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      resultado: "AUTH_SIGNUP_FALHOU",
      auth_delete_ok: false,
    });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }

  try {
    await rpcMarcarAuthCriado(svc, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      user_id: uid,
    });
  } catch (e) {
    logger.error("marcar_auth_criado_falhou", { msg: (e as Error).message });
    const rb = await rollbackAuth(svc, uid, ctx.marker, ctx.canonical, ctx.emailNorm, logger);
    await rpcMarcarFalha(svc, logger, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      resultado: rb.deleted ? "AUTH_MARK_FALHOU" : "AUTH_DELETE_NAO_CONFIRMADO",
      auth_delete_ok: rb.deleted,
    });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }

  return finalizarComUsuarioExistente(deps, ctx, uid);
}

/** EM_ANDAMENTO: usa created_at (nunca updated_at) para decidir idade. */
async function fluxoEmAndamento(deps: HandlerDeps, ctx: OperationCtx): Promise<EdgeResponse> {
  const { svc, logger } = deps;

  const snap = await lerIdempotencia(svc, ctx.body.idempotency_key);
  if (!snap) {
    logger.error("em_andamento_sem_linha", {});
    return ok(500, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }
  // Confirma escopo: canonical + fingerprint + instituicao.
  if (snap.request_id !== ctx.canonical || snap.request_fingerprint !== ctx.fingerprint ||
      snap.instituicao_id !== ctx.instituicaoId) {
    logger.error("em_andamento_escopo_divergente", {});
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }

  const createdAt = snap.created_at ? new Date(snap.created_at).getTime() : 0;
  const age = deps.now().getTime() - createdAt;

  if (age < EM_ANDAMENTO_RECENTE_MS) {
    return ok(202, {
      code: "PROCESSANDO_RETENTE",
      request_id: ctx.canonical,
    }, { "Retry-After": "5" });
  }

  // EM_ANDAMENTO antigo: procura Auth por e-mail via helper checked.
  const u = await findAuthUserByEmailChecked(svc, ctx.emailNorm);
  if (u) {
    const { marker, requestId } = extractMarker(u);
    if (marker === ctx.marker && requestId === ctx.canonical) {
      // Auth pertence à operação → marca auth_criado e finaliza.
      try {
        await rpcMarcarAuthCriado(svc, {
          idempotency_key: ctx.body.idempotency_key,
          fingerprint: ctx.fingerprint,
          request_id: ctx.canonical,
          user_id: u.id,
        });
      } catch (e) {
        logger.error("recovery_marcar_auth_criado_falhou", { msg: (e as Error).message });
        return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
      }
      return finalizarComUsuarioExistente(deps, ctx, u.id);
    }
    // Ownership divergente com mesmo e-mail: NÃO deleta.
    await rpcMarcarFalha(svc, logger, {
      idempotency_key: ctx.body.idempotency_key,
      fingerprint: ctx.fingerprint,
      request_id: ctx.canonical,
      resultado: "OWNERSHIP_DIVERGENTE",
      auth_delete_ok: false,
    });
    return ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: ctx.canonical });
  }

  // EM_ANDAMENTO antigo sem Auth: NÃO cria nova reserva; exige captcha_token
  // e prossegue direto para signUp reutilizando o mesmo canonical/fingerprint.
  if (!ctx.body.captcha_token) {
    return ok(400, { code: "CAPTCHA_OBRIGATORIO", request_id: ctx.canonical });
  }
  // Reaproveita fluxo signUp da reserva atual.
  return fluxoReservadoNovo(deps, ctx);
}

// ============================ Handler principal ============================

export async function handleRequest(req: Request, deps: HandlerDeps): Promise<Response> {
  const { logger, env } = deps;
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    const forb = enforceOriginOrForbid(req);
    if (forb) return forb;
    return new Response("ok", { headers: cors });
  }

  const originForbid = enforceOriginOrForbid(req);
  if (originForbid) return originForbid;

  // FIX02 — Kill switch global fail-closed. Nenhuma leitura, RPC, rate limit,
  // signUp, Auth Admin ou INSERT/UPDATE/DELETE ocorre com runtime desativado.
  if (!deps.runtimeEnabled) {
    logger.warn("runtime_desativado", {});
    return new Response(JSON.stringify({ code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

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
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
  catch {
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

  const emailNorm   = normalizeEmail(body.email);
  const nomeNorm    = normalizeNome(body.nome_completo);
  const celularNorm = normalizeCelular(body.celular);
  const cpfNorm     = normalizeCpf(body.cpf);

  if (!validateCelular(celularNorm) || (cpfNorm && !validateCpf(cpfNorm))) {
    return new Response(JSON.stringify({ code: "PAYLOAD_INVALIDO" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Resolução tenant.
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

  // Rate-limit — IP fail-closed.
  const ip = extractClientIp(req);
  if (!ip) {
    logger.warn("IP_GATEWAY_INDISPONIVEL", {});
    return new Response(JSON.stringify({ code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR" }), {
      status: 503, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const rate = await enforceAll(deps.svc as unknown as Parameters<typeof enforceAll>[0], env.rateLimitSecret, {
    ip, email: emailNorm, instituicaoId,
  });
  if (rate) {
    return new Response(JSON.stringify({ code: "RATE_LIMIT_EXCEDIDO" }), {
      status: 429,
      headers: { ...cors, "Content-Type": "application/json", "Retry-After": String(rate.retry_after_seconds) },
    });
  }

  // Fingerprint HMAC v1.
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

  // Reserva idempotente — request_id_inicial vai para a RPC; canonical volta.
  const expiresAt = new Date(deps.now().getTime() + 30 * 60 * 1000).toISOString();
  let reserva: ReservarRow;
  try {
    reserva = await rpcReservar(deps.svc, {
      idempotency_key: body.idempotency_key,
      fingerprint,
      request_id: deps.requestIdInicial,
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

  const canonical = reserva.canonical_request_id;
  const marker = await computeAuthMarker(env.fingerprintSecret, body.idempotency_key, canonical, emailNorm);
  const ctx: OperationCtx = {
    body, emailNorm, nomeNorm, celularNorm, cpfNorm,
    instituicaoId, fingerprint, marker, canonical,
    aceitoEm: deps.now().toISOString(),
  };

  let resp: EdgeResponse;
  switch (reserva.result_code) {
    case "RESERVADO_NOVO":
      resp = await fluxoReservadoNovo(deps, ctx);
      break;
    case "EM_ANDAMENTO":
      resp = await fluxoEmAndamento(deps, ctx);
      break;
    case "RETOMAR_AUTH_CRIADO":
      resp = reserva.user_id && isValidUuid(reserva.user_id)
        ? await finalizarComUsuarioExistente(deps, ctx, reserva.user_id)
        : ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: canonical });
      break;
    case "CONCLUIDO": {
      if (!reserva.user_id || !isValidUuid(reserva.user_id)) {
        logger.error("CONCLUIDO_SEM_USER_ID", {});
        resp = ok(500, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: canonical });
        break;
      }
      let u: AuthUserMinimo | null;
      try {
        u = await getAuthUserByIdChecked(deps.svc, reserva.user_id);
      } catch (e) {
        logger.error("CONCLUIDO_get_falhou", { msg: (e as Error).message });
        resp = ok(500, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: canonical });
        break;
      }
      if (!u) {
        logger.error("CONCLUIDO_SEM_AUTH", {});
        resp = ok(500, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: canonical });
        break;
      }
      if ((u.email ?? "").toLowerCase() !== emailNorm) {
        logger.error("CONCLUIDO_EMAIL_DIVERGENTE", {});
        resp = ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: canonical });
        break;
      }
      resp = ok(200, {
        code: "AUTOCADASTRO_CONCLUIDO",
        next_action: deriveNextAction(u),
        request_id: canonical,
      });
      break;
    }
    case "FALHA_ANTERIOR":
    case "ROLLBACK_FALHOU":
      if (reserva.result_code === "ROLLBACK_FALHOU") logger.error("rollback_falhou_persistente", {});
      resp = ok(409, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: canonical });
      break;
    default:
      logger.error("result_code_desconhecido", { result_code: reserva.result_code });
      resp = ok(500, { code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR", request_id: canonical });
  }

  // Log soft de excedente pós-Auth (não impede resposta).
  if (deadlineExpirado(deps)) {
    logger.warn("deadline_soft_excedido", {});
  }

  return new Response(JSON.stringify(resp.body), {
    status: resp.status,
    headers: { ...cors, ...(resp.extraHeaders ?? {}), "Content-Type": "application/json" },
  });
}

// ============================ Serve ========================================

Deno.serve(async (req) => {
  const correlationHeader = sanitizeCorrelationId(
    req.headers.get("x-correlation-id") ?? req.headers.get("x-request-id"),
  );
  const correlationId = correlationHeader ?? crypto.randomUUID();
  const logger = createLogger("signup-assistido-tenant",
    // logger usa header interno; injetamos por objeto controlado.
    new Request(req.url, { headers: { "x-correlation-id": correlationId } }),
  );

  // FIX02 — Kill switch avaliado ANTES da validação completa de env.
  // Runtime desativado responde 503 sem tocar em nenhum outro segredo.
  const runtimeEnabled = readRuntimeEnabledFromEnv();

  if (!runtimeEnabled) {
    // OPTIONS ainda passa por CORS/origem para respeitar preflight legítimo.
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") {
      const forb = enforceOriginOrForbid(req);
      if (forb) return forb;
      return new Response("ok", { headers: cors });
    }
    const originForbid = enforceOriginOrForbid(req);
    if (originForbid) return originForbid;
    logger.warn("runtime_desativado_serve", {});
    return new Response(JSON.stringify({ code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json", "Retry-After": "60" },
    });
  }

  let env: EnvSeguro;
  try { env = readEnvChecked(); }
  catch (e) {
    logger.error("CONFIG_INVALIDA", { key: (e as Error).message });
    return new Response(JSON.stringify({ code: "CONFIG_INVALIDA" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }

  const commonOpts = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const svc  = createClient(env.supabaseUrl, env.serviceRoleKey, commonOpts);
  const anon = createClient(env.supabaseUrl, env.anonKey, commonOpts);

  const deps: HandlerDeps = {
    env, logger, svc, anon,
    now: () => new Date(),
    correlationId,
    requestIdInicial: crypto.randomUUID(),
    deadlineAt: Date.now() + TIMEOUT_MS,
    runtimeEnabled: true,
  };

  try {
    return await handleRequest(req, deps);
  } catch (e) {
    logger.error("handler_exception", { msg: (e as Error).message });
    return new Response(JSON.stringify({ code: "AUTOCADASTRO_INDISPONIVEL_RETENTAR" }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }
});
