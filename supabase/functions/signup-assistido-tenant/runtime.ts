/**
 * SAAS-06-C1-STAB10-C1.2-B1-FIX02 — Kill switch global do autocadastro.
 *
 * Fail-closed por default: só o literal "true" (case-insensitive, trimmed)
 * habilita o fluxo funcional. Ausência, string vazia, "false" e qualquer
 * outro valor mantêm o endpoint bloqueado.
 *
 * Este helper é puro e testável. Deve ser consultado ANTES da validação
 * completa de outros segredos e ANTES de qualquer operação funcional.
 */

export const RUNTIME_FLAG_ENV = "AUTOCADASTRO_RUNTIME_ENABLED";

export function isRuntimeEnabled(raw: string | undefined | null): boolean {
  if (raw === undefined || raw === null) return false;
  return String(raw).trim().toLowerCase() === "true";
}

export function readRuntimeEnabledFromEnv(): boolean {
  return isRuntimeEnabled(Deno.env.get(RUNTIME_FLAG_ENV));
}
