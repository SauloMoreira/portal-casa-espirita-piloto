/**
 * SAAS-06-C1-STAB10-C1.2-A1-FIX01-R1.c-FIX02 —
 * Testes unitários dos wrappers checked (fetch mockado, sem Supabase real).
 *
 * Cobre:
 *   1) DELETE REST HTTP 500 → cleanupTracked strict não lança;
 *      cleanupErrors contém a operação e HTTP 500.
 *   2) DELETE Auth HTTP 500 → cleanupErrors contém auth.users e HTTP 500.
 *   3) DELETE Auth HTTP 404 → sucesso idempotente (sem entrada de erro).
 *   4) GET REST HTTP 500 em residuosFinais → lança; não retorna 0.
 *   5) GET REST HTTP 200 com body não-array → lança FORMATO_RESPOSTA_INVALIDO.
 *   6) GET Auth individual HTTP 500 → lança; não interpreta como ausência.
 *   7) GET Auth individual HTTP 404 → representa ausência legítima.
 *   8) GET Auth list HTTP 404 → rejeitado (lança).
 *
 * Nenhum acesso real ao Supabase. Envs stubados antes do import dinâmico.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const STUB_URL = "https://stub.supabase.test";
const STUB_ANON = "stub-anon-key";
const STUB_SERVICE = "stub-service-key";

interface FetchCall {
  url: string;
  init?: RequestInit;
}

interface MockedResponse {
  status: number;
  ok?: boolean;
  body?: unknown;
  bodyText?: string;
}

let calls: FetchCall[] = [];
let respond: (call: FetchCall) => MockedResponse;
let originalFetch: typeof fetch | undefined;

function installFetch() {
  originalFetch = globalThis.fetch;
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const call: FetchCall = { url, init };
    calls.push(call);
    const r = respond(call);
    const status = r.status;
    const ok = r.ok ?? (status >= 200 && status < 300);
    const bodyText = r.bodyText ?? (r.body === undefined ? "" : JSON.stringify(r.body));
    return {
      status,
      ok,
      json: async () => (bodyText ? JSON.parse(bodyText) : null),
      text: async () => bodyText,
    } as unknown as Response;
  });
  globalThis.fetch = mock as unknown as typeof fetch;
}

function restoreFetch() {
  if (originalFetch) globalThis.fetch = originalFetch;
  originalFetch = undefined;
}

async function loadModule() {
  vi.resetModules();
  vi.stubEnv("VITE_SUPABASE_URL", STUB_URL);
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", STUB_ANON);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", STUB_SERVICE);
  vi.stubEnv("PGHOST", "stub-host");
  return await import("../e2e-rls/_stab10a3Fixtures");
}

beforeEach(() => {
  calls = [];
  respond = () => ({ status: 200, body: [] });
  installFetch();
});

afterEach(() => {
  restoreFetch();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("FIX02 — cleanupTracked strict (fetch mockado)", () => {
  it("DELETE REST 500 → não lança e registra em cleanupErrors com HTTP 500", async () => {
    const mod = await loadModule();
    const tracker = mod.newTracker();
    tracker.assistidos.push("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1");

    respond = (call) => {
      if (call.url.includes("/rest/v1/assistidos?id=eq.")) {
        return { status: 500, body: { message: "boom" } };
      }
      return { status: 200, body: [] };
    };

    const result = await mod.cleanupTracked(tracker, { strict: true });
    expect(result.cleanupErrors.length).toBeGreaterThan(0);
    const joined = result.cleanupErrors.join(" || ");
    expect(joined).toMatch(/assistidos\.id=aaaaaaaa/);
    expect(joined).toMatch(/HTTP 500/);
  });

  it("DELETE Auth 500 → registra auth.users em cleanupErrors com HTTP 500", async () => {
    const mod = await loadModule();
    const tracker = mod.newTracker();
    const uid = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2";
    tracker.authUsers.push(uid);

    respond = (call) => {
      if (call.url.includes(`/auth/v1/admin/users/${uid}`) && call.init?.method === "DELETE") {
        return { status: 500, body: { error: "kaboom" } };
      }
      // REST DELETEs (profiles etc.) → ok
      return { status: 204, body: null };
    };

    const result = await mod.cleanupTracked(tracker, { strict: true });
    const joined = result.cleanupErrors.join(" || ");
    expect(joined).toMatch(/auth\.users\.uid=bbbbbbbb/);
    expect(joined).toMatch(/HTTP 500/);
  });

  it("DELETE Auth 404 → idempotente; não gera cleanupErrors para auth.users", async () => {
    const mod = await loadModule();
    const tracker = mod.newTracker();
    const uid = "cccccccc-cccc-cccc-cccc-cccccccccc03";
    tracker.authUsers.push(uid);

    respond = (call) => {
      if (call.url.includes(`/auth/v1/admin/users/${uid}`) && call.init?.method === "DELETE") {
        return { status: 404, body: { message: "not found" } };
      }
      return { status: 204, body: null };
    };

    const result = await mod.cleanupTracked(tracker, { strict: true });
    const authErrors = result.cleanupErrors.filter((e) => e.includes("auth.users.uid="));
    expect(authErrors).toEqual([]);
  });
});

describe("FIX02 — residuosFinais (fetch mockado)", () => {
  it("GET REST 500 → lança; não retorna quantidade zero", async () => {
    const mod = await loadModule();
    const tracker = mod.newTracker();
    tracker.assistidos.push("dddddddd-dddd-dddd-dddd-dddddddddd04");

    respond = (call) => {
      if (call.url.includes("/rest/v1/assistidos?id=eq.")) {
        return { status: 500, body: { message: "read failure" } };
      }
      return { status: 200, body: [] };
    };

    await expect(mod.residuosFinais(tracker)).rejects.toThrow(/HTTP 500/);
  });

  it("GET REST 200 com body não-array → lança FORMATO_RESPOSTA_INVALIDO", async () => {
    const mod = await loadModule();
    const tracker = mod.newTracker();
    tracker.assistidos.push("eeeeeeee-eeee-eeee-eeee-eeeeeeeeee05");

    respond = (call) => {
      if (call.url.includes("/rest/v1/assistidos?id=eq.")) {
        return { status: 200, body: { message: "not an array" } };
      }
      return { status: 200, body: [] };
    };

    await expect(mod.residuosFinais(tracker)).rejects.toThrow(/FORMATO_RESPOSTA_INVALIDO/);
  });

  it("GET Auth individual 500 → lança; não interpreta como usuário inexistente", async () => {
    const mod = await loadModule();
    const tracker = mod.newTracker();
    const uid = "ffffffff-ffff-ffff-ffff-ffffffffff06";
    tracker.authUsers.push(uid);

    respond = (call) => {
      const isAuthGet =
        call.url.includes(`/auth/v1/admin/users/${uid}`) &&
        (!call.init || call.init.method === undefined || call.init.method === "GET");
      if (isAuthGet) return { status: 500, body: { error: "internal" } };
      return { status: 200, body: [] };
    };

    await expect(mod.residuosFinais(tracker)).rejects.toThrow(/auth\.users\.get.*HTTP 500/);
  });

  it("GET Auth individual 404 → ausência legítima (count=0)", async () => {
    const mod = await loadModule();
    const tracker = mod.newTracker();
    const uid = "99999999-9999-9999-9999-999999999907";
    tracker.authUsers.push(uid);

    respond = (call) => {
      const isAuthGet =
        call.url.includes(`/auth/v1/admin/users/${uid}`) &&
        (!call.init || call.init.method === undefined || call.init.method === "GET");
      if (isAuthGet) return { status: 404, body: { message: "not found" } };
      return { status: 200, body: [] };
    };

    const counts = await mod.residuosFinais(tracker);
    expect(counts[`auth.users:${uid}`]).toBe(0);
  });

  it("GET Auth list HTTP 404 → rejeitado (lança)", async () => {
    const mod = await loadModule();
    const tracker = mod.newTracker();
    tracker.emails.push("stab10a3-x@lovable.test");

    respond = (call) => {
      if (call.url.includes("/auth/v1/admin/users?filter=")) {
        return { status: 404, body: { message: "list not found" } };
      }
      return { status: 200, body: [] };
    };

    await expect(mod.residuosFinais(tracker)).rejects.toThrow(/auth\.users\.list.*HTTP 404/);
  });

  it("GET Auth list HTTP 200 com body sem users → FORMATO_RESPOSTA_INVALIDO", async () => {
    const mod = await loadModule();
    const tracker = mod.newTracker();
    tracker.emails.push("stab10a3-y@lovable.test");

    respond = (call) => {
      if (call.url.includes("/auth/v1/admin/users?filter=")) {
        return { status: 200, body: { unexpected: true } };
      }
      return { status: 200, body: [] };
    };

    await expect(mod.residuosFinais(tracker)).rejects.toThrow(/FORMATO_RESPOSTA_INVALIDO/);
  });
});
