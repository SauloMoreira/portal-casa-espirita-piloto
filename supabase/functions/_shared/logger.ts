/**
 * Structured logging helper for Supabase Edge Functions.
 *
 * Emits single-line JSON to stdout/stderr so logs are queryable and can be
 * correlated by `requestId`. Keep logs intentional and low-noise: log the start
 * of a sensitive flow, its outcome, and any critical failure — not every step.
 */

export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  requestId: string;
  info: (event: string, data?: Record<string, unknown>) => void;
  warn: (event: string, data?: Record<string, unknown>) => void;
  error: (event: string, data?: Record<string, unknown>) => void;
}

function emit(
  level: LogLevel,
  fn: string,
  requestId: string,
  event: string,
  data?: Record<string, unknown>,
) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    fn,
    requestId,
    event,
    ...(data ?? {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Create a logger bound to an edge function name. A correlation id is derived
 * from the incoming request (or generated) so a flow can be traced end to end.
 */
export function createLogger(fn: string, req?: Request): Logger {
  const requestId =
    req?.headers.get("x-correlation-id") ||
    req?.headers.get("x-request-id") ||
    crypto.randomUUID();

  return {
    requestId,
    info: (event, data) => emit("info", fn, requestId, event, data),
    warn: (event, data) => emit("warn", fn, requestId, event, data),
    error: (event, data) => emit("error", fn, requestId, event, data),
  };
}
