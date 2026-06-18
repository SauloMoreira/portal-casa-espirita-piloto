import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ZApiAdapter, getAdapter } from "../../supabase/functions/_shared/channel-adapter";

describe("ZApiAdapter", () => {
  const baseEnv = {
    ZAPI_INSTANCE_ID: "INST123",
    ZAPI_INSTANCE_TOKEN: "TOKEN456",
    ZAPI_BASE_URL: "https://api.z-api.io",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is not configured when credentials are missing", () => {
    expect(new ZApiAdapter({}).isConfigured()).toBe(false);
    expect(new ZApiAdapter({ ZAPI_INSTANCE_ID: "x" }).isConfigured()).toBe(false);
  });

  it("is configured with instance id + token", () => {
    expect(new ZApiAdapter(baseEnv).isConfigured()).toBe(true);
  });

  it("is configured when base url already contains the full path", () => {
    const a = new ZApiAdapter({
      ZAPI_BASE_URL: "https://api.z-api.io/instances/AAA/token/BBB",
    });
    expect(a.isConfigured()).toBe(true);
  });

  it("returns zapi_not_configured without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await new ZApiAdapter({}).send("5511999999999", "oi");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("zapi_not_configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends to the correct send-text endpoint with phone + message", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "MID789", zaapId: "Z1" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const res = await new ZApiAdapter(baseEnv).send("5511999999999", "Olá");
    expect(res.ok).toBe(true);
    expect(res.externalMessageId).toBe("MID789");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://api.z-api.io/instances/INST123/token/TOKEN456/send-text",
    );
    expect(JSON.parse(init.body)).toEqual({
      phone: "5511999999999",
      message: "Olá",
    });
  });

  it("includes Client-Token header only when configured", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);

    await new ZApiAdapter(baseEnv).send("55", "a");
    expect(fetchSpy.mock.calls[0][1].headers["Client-Token"]).toBeUndefined();

    await new ZApiAdapter({ ...baseEnv, ZAPI_CLIENT_TOKEN: "CT" }).send("55", "a");
    expect(fetchSpy.mock.calls[1][1].headers["Client-Token"]).toBe("CT");
  });

  it("maps non-ok responses to a zapi_http error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "invalid token" }),
    }));
    const res = await new ZApiAdapter(baseEnv).send("55", "a");
    expect(res.ok).toBe(false);
    expect(res.error).toContain("zapi_http_401");
  });

  it("getAdapter returns a Z-API adapter named 'zapi'", () => {
    expect(getAdapter(baseEnv).name).toBe("zapi");
  });
});
