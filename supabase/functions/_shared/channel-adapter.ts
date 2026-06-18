/**
 * Channel adapter abstraction for the Central de Notificações.
 *
 * The notification engine talks to this interface only — never to a concrete
 * provider — so the WhatsApp provider (Z-API today) can be swapped for another
 * provider (e.g. official Cloud API) later without touching business rules.
 */

export interface SendResult {
  ok: boolean;
  externalMessageId?: string;
  error?: string;
  raw?: unknown;
}

export interface ChannelAdapter {
  readonly name: string;
  isConfigured(): boolean;
  send(telefone: string, mensagem: string): Promise<SendResult>;
}

export interface AdapterEnv {
  ZAPI_INSTANCE_ID?: string;
  ZAPI_INSTANCE_TOKEN?: string;
  ZAPI_BASE_URL?: string;
  ZAPI_CLIENT_TOKEN?: string;
}

/**
 * Z-API adapter. Reads configuration from environment secrets:
 *   ZAPI_INSTANCE_ID, ZAPI_INSTANCE_TOKEN, ZAPI_BASE_URL, ZAPI_CLIENT_TOKEN
 *
 * Base URL pattern:
 *   https://api.z-api.io/instances/{instanceId}/token/{token}
 *
 * ZAPI_CLIENT_TOKEN is optional: only sent as the `Client-Token` header when
 * the account-level security token is enabled in the Z-API panel.
 */
export class ZApiAdapter implements ChannelAdapter {
  readonly name = "zapi";
  private baseUrl: string;
  private instanceId: string;
  private token: string;
  private clientToken: string;

  constructor(env: AdapterEnv) {
    this.baseUrl = ZApiAdapter.sanitizeBaseUrl(env.ZAPI_BASE_URL);
    this.instanceId = env.ZAPI_INSTANCE_ID || "";
    this.token = env.ZAPI_INSTANCE_TOKEN || "";
    this.clientToken = env.ZAPI_CLIENT_TOKEN || "";
  }

  /**
   * Normalize ZAPI_BASE_URL. We accept several shapes that operators may paste
   * into the secret and reduce them all to a valid root:
   *   - "https://api.z-api.io"                                  -> as-is
   *   - "https://api.z-api.io/"                                 -> trailing slash trimmed
   *   - ".../instances/<id>/token/<tok>"                        -> kept (full path)
   *   - ".../instances/<id>/token/<tok>/send-text"             -> trailing endpoint stripped
   * This keeps the URL builder correct regardless of how the secret was entered,
   * without changing the decoupled adapter contract.
   */
  static sanitizeBaseUrl(value?: string): string {
    let url = (value || "https://api.z-api.io").trim().replace(/\/+$/, "");
    // Drop a trailing Z-API endpoint segment if the operator included it.
    url = url.replace(/\/(send-text|send-message|status|messages)$/i, "");
    return url.replace(/\/+$/, "");
  }

  /** Resolve the instance endpoint root, honoring a full base URL if provided. */
  private instanceRoot(): string {
    // Allow ZAPI_BASE_URL to already contain the /instances/.../token/... path.
    if (/\/instances\/[^/]+\/token\/[^/]+/.test(this.baseUrl)) {
      return this.baseUrl;
    }
    return `${this.baseUrl}/instances/${this.instanceId}/token/${this.token}`;
  }

  isConfigured(): boolean {
    if (/\/instances\/[^/]+\/token\/[^/]+/.test(this.baseUrl)) return true;
    return Boolean(this.instanceId && this.token);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.clientToken) h["Client-Token"] = this.clientToken;
    return h;
  }

  async send(telefone: string, mensagem: string): Promise<SendResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: "zapi_not_configured" };
    }
    try {
      const res = await fetch(`${this.instanceRoot()}/send-text`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ phone: telefone, message: mensagem }),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          error: `zapi_http_${res.status}${raw?.error ? `:${raw.error}` : ""}`,
          raw,
        };
      }
      // Z-API may answer HTTP 200 while signalling a failure in the body
      // (e.g. { error: "NOT_FOUND", message: "..." } when the instance/token
      // or endpoint is wrong). Treat any body-level error as a failed send.
      if (raw?.error) {
        return {
          ok: false,
          error: `zapi_error:${raw.error}${raw?.message ? `:${raw.message}` : ""}`,
          raw,
        };
      }
      // Z-API returns { zaapId, messageId, id }
      const externalMessageId =
        raw?.messageId || raw?.zaapId || raw?.id || undefined;
      return { ok: true, externalMessageId, raw };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}

/** Resolve the active adapter. Single switch point for future providers. */
export function getAdapter(env: AdapterEnv): ChannelAdapter {
  return new ZApiAdapter(env);
}
