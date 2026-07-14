/**
 * SAAS-06-C1-STAB10-C1.2-B1-FIX02 — Testes do kill switch global.
 *
 * Cobrem:
 *  - Helper puro `isRuntimeEnabled`: variável ausente/vazia/false/inválida
 *    é fail-closed; somente "true" (case-insensitive, trimmed) habilita.
 *  - Handler: com `runtimeEnabled=false` responde 503
 *    AUTOCADASTRO_INDISPONIVEL_RETENTAR e NÃO executa nenhuma consulta,
 *    RPC, signUp ou chamada Auth Admin.
 *  - Handler: OPTIONS de origem autorizada continua permitido; origem não
 *    autorizada continua recebendo 403 mesmo com kill switch desligado
 *    (kill switch não torna CORS permissivo).
 *  - Handler: `runtimeEnabled=true` prossegue para validações normais.
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { handleRequest, type HandlerDeps } from "./index.ts";
import { isRuntimeEnabled } from "./runtime.ts";

const REDIRECT_URL = "https://portal-casa-espirita-piloto.lovable.app/callback";
const OFFICIAL_ORIGIN = "https://portal-casa-espirita-piloto.lovable.app";
const OUTRA_ORIGEM = "https://malicioso.example";
const SECRET = "chave-secreta-com-mais-de-32-caracteres!!";
const FIXED_NOW = new Date("2026-07-14T20:00:00.000Z");

// ------------------------------------------------------------------
// (A) Helper puro
// ------------------------------------------------------------------

Deno.test("isRuntimeEnabled: undefined/null/empty são fail-closed", () => {
  assertEquals(isRuntimeEnabled(undefined), false);
  assertEquals(isRuntimeEnabled(null), false);
  assertEquals(isRuntimeEnabled(""), false);
});

Deno.test("isRuntimeEnabled: 'false' e valores inválidos são fail-closed", () => {
  assertEquals(isRuntimeEnabled("false"), false);
  assertEquals(isRuntimeEnabled("FALSE"), false);
  assertEquals(isRuntimeEnabled("0"), false);
  assertEquals(isRuntimeEnabled("1"), false);
  assertEquals(isRuntimeEnabled("yes"), false);
  assertEquals(isRuntimeEnabled("truee"), false);
  assertEquals(isRuntimeEnabled(" true "), true); // trim aceito
});

Deno.test("isRuntimeEnabled: somente 'true' habilita (case-insensitive)", () => {
  assertEquals(isRuntimeEnabled("true"), true);
  assertEquals(isRuntimeEnabled("True"), true);
  assertEquals(isRuntimeEnabled("TRUE"), true);
});

// ------------------------------------------------------------------
// (B) Handler com kill switch
// ------------------------------------------------------------------

interface Spy { chamadas: string[]; }

function spySvc(spy: Spy): SupabaseClient {
  const trap = (nome: string) => () => {
    spy.chamadas.push(nome);
    throw new Error(`SVC_ACESSADO:${nome}`);
  };
  return {
    from: trap("from"),
    rpc:  trap("rpc"),
    auth: {
      admin: {
        getUserById: trap("auth.admin.getUserById"),
        deleteUser:  trap("auth.admin.deleteUser"),
        listUsers:   trap("auth.admin.listUsers"),
      },
    },
  } as unknown as SupabaseClient;
}

function spyAnon(spy: Spy): SupabaseClient {
  return {
    auth: { signUp: () => { spy.chamadas.push("anon.signUp"); throw new Error("SIGNUP_ACESSADO"); } },
  } as unknown as SupabaseClient;
}

function silentLogger() {
  return { requestId: "x", info: () => {}, warn: () => {}, error: () => {} };
}

function buildDepsRuntime(runtimeEnabled: boolean, spy: Spy): HandlerDeps {
  return {
    env: {
      supabaseUrl: "https://x.supabase.co",
      serviceRoleKey: "svc-key-with-more-than-32-chars!!",
      anonKey: "anon-key-with-more-than-32-chars!!",
      fingerprintSecret: SECRET,
      rateLimitSecret: SECRET,
      emailRedirectUrl: REDIRECT_URL,
      allowLocal: false,
      trustXff: false,
    },
    logger: silentLogger(),
    svc: spySvc(spy),
    anon: spyAnon(spy),
    now: () => FIXED_NOW,
    correlationId: "corr-x",
    requestIdInicial: "req-x",
    deadlineAt: FIXED_NOW.getTime() + 15_000,
    runtimeEnabled,
  };
}

function postReq(origin = OFFICIAL_ORIGIN): Request {
  return new Request("https://x/signup-assistido-tenant", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ping: "irrelevante" }),
  });
}

Deno.test("Handler: runtimeEnabled=false com origem oficial → 503 e zero side-effects", async () => {
  const spy: Spy = { chamadas: [] };
  const deps = buildDepsRuntime(false, spy);

  const res = await handleRequest(postReq(), deps);
  const body = await res.json();

  assertEquals(res.status, 503);
  assertEquals(body.code, "AUTOCADASTRO_INDISPONIVEL_RETENTAR");
  assertEquals(res.headers.get("Retry-After"), "60");
  assertEquals(res.headers.get("Content-Type"), "application/json");
  // Nenhuma chamada ao svc/anon/auth admin.
  assertEquals(spy.chamadas, []);
});

Deno.test("Handler: runtimeEnabled=false com origem não autorizada → 403 antes do 503", async () => {
  const spy: Spy = { chamadas: [] };
  const deps = buildDepsRuntime(false, spy);

  const res = await handleRequest(postReq(OUTRA_ORIGEM), deps);
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.code, "ORIGEM_NAO_AUTORIZADA");
  assertEquals(spy.chamadas, []);
});

Deno.test("Handler: OPTIONS origem oficial passa mesmo com runtimeEnabled=false", async () => {
  const spy: Spy = { chamadas: [] };
  const deps = buildDepsRuntime(false, spy);

  const req = new Request("https://x/signup-assistido-tenant", {
    method: "OPTIONS",
    headers: { Origin: OFFICIAL_ORIGIN, "Access-Control-Request-Method": "POST" },
  });
  const res = await handleRequest(req, deps);
  await res.text();

  assertEquals(res.status, 200);
  assertEquals(spy.chamadas, []);
});

Deno.test("Handler: OPTIONS origem não autorizada → 403 mesmo com kill switch desligado", async () => {
  const spy: Spy = { chamadas: [] };
  const deps = buildDepsRuntime(false, spy);

  const req = new Request("https://x/signup-assistido-tenant", {
    method: "OPTIONS",
    headers: { Origin: OUTRA_ORIGEM, "Access-Control-Request-Method": "POST" },
  });
  const res = await handleRequest(req, deps);
  const body = await res.json();

  assertEquals(res.status, 403);
  assertEquals(body.code, "ORIGEM_NAO_AUTORIZADA");
  assertEquals(spy.chamadas, []);
});

Deno.test("Handler: runtimeEnabled=true prossegue para validações (payload inválido → 400)", async () => {
  const spy: Spy = { chamadas: [] };
  const deps = buildDepsRuntime(true, spy);

  // Payload não bate o schema — deve chegar em PAYLOAD_INVALIDO antes de tocar em svc.
  const res = await handleRequest(postReq(), deps);
  const body = await res.json();

  assertEquals(res.status, 400);
  assertEquals(body.code, "PAYLOAD_INVALIDO");
  // Nenhuma consulta a instituições/RPC/rate-limit foi feita ainda.
  assertEquals(spy.chamadas, []);
});
