/**
 * Espelho idêntico de `src/lib/comunicacaoCanal.ts` para uso nas edges (Deno).
 * Mantenha as duas listas EVENTOS_OPERACIONAIS em sincronia — é a fonte única
 * lógica da separação geral × operacional.
 */

export type CanalComunicacao = "operacional" | "geral";

export const EVENTOS_OPERACIONAIS = [
  "entrevista_criada",
  "entrevista_lembrete",
  "sessao_criada",
  "sessao_lembrete",
  "remarcacao",
  "cancelamento",
  "presenca_registrada",
  "falta_registrada",
  // Ação humana administrativa pontual: respeita o opt-out de canal, mas não é
  // bloqueada pela preferência de comunicações gerais.
  "mensagem_manual",
] as const;

const SET_OPERACIONAIS = new Set<string>(EVENTOS_OPERACIONAIS);

export function classificarEvento(evento?: string | null): CanalComunicacao {
  if (!evento) return "geral";
  return SET_OPERACIONAIS.has(evento) ? "operacional" : "geral";
}

export function isOperacional(evento?: string | null): boolean {
  return classificarEvento(evento) === "operacional";
}
