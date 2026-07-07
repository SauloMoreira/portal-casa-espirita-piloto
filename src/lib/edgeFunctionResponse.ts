/**
 * Q2-E3 — Leitura tipada e defensiva de respostas de edge functions sensíveis.
 *
 * Substitui o padrão `(data as any)?.error` / `(error as any)?.context` por type
 * guards mínimos e helpers estritamente locais. Não altera payloads enviados,
 * mensagens retornadas, status HTTP, validações nem regras de autorização —
 * apenas encapsula a leitura defensiva das respostas de `functions.invoke`.
 */

/** Corpo padrão de erro retornado no JSON das edge functions: `{ error: string }`. */
export interface EdgeFunctionErrorBody {
  error?: unknown;
}

/** Erro do cliente `functions.invoke` com contexto opcional da resposta HTTP. */
interface FunctionsInvokeError {
  message: string;
  context?: { json?: () => Promise<unknown> };
}

/** Type guard mínimo para um corpo com campo `error`. */
function hasErrorField(value: unknown): value is EdgeFunctionErrorBody {
  return typeof value === "object" && value !== null && "error" in value;
}

/**
 * Extrai a mensagem de erro de uma falha de `functions.invoke`, priorizando o
 * corpo JSON `{ error }` da resposta não-2xx quando disponível. Comportamento
 * idêntico ao padrão anterior baseado em `(error as any)?.context`.
 */
export async function resolveInvokeErrorMessage(error: FunctionsInvokeError): Promise<string> {
  const ctx = error.context;
  let msg = error.message;
  try {
    const parsed = ctx && typeof ctx.json === "function" ? await ctx.json() : null;
    if (hasErrorField(parsed) && parsed.error) msg = String(parsed.error);
  } catch {
    /* ignore */
  }
  return msg;
}

/**
 * Retorna o erro embutido no corpo de sucesso (`{ error }`) de uma edge function,
 * ou `undefined` quando não houver. Mantém o mesmo disparo condicional anterior.
 */
export function edgeBodyError(data: unknown): string | undefined {
  if (hasErrorField(data) && data.error) return String(data.error);
  return undefined;
}
