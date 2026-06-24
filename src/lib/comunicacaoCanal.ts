/**
 * Fonte única de verdade para a classificação dos eventos de comunicação
 * entre **operacional** (fluxo de atendimento/tratamento) e **geral**
 * (institucional / campanhas / comunicados).
 *
 * Compartilhada entre frontend, testes e — por espelhamento idêntico — as
 * edges `notificacoes-dispatch` e `comunicacao-dispatch`
 * (ver `supabase/functions/_shared/comunicacaoCanal.ts`), para evitar
 * divergência de comportamento.
 *
 * Regra central:
 *  - Comunicação **operacional** NÃO é bloqueada pela preferência geral
 *    (`comunicacao_geral_ativa`). Continua respeitando consentimento de canal
 *    (`whatsapp_ativo`), janela de horário, dedupe, limite diário e retries.
 *  - Comunicação **geral** respeita `comunicacao_geral_ativa` além do
 *    consentimento de canal.
 */

export type CanalComunicacao = "operacional" | "geral";

/** Eventos operacionais do fluxo de atendimento/tratamento. */
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

/**
 * Classifica um evento de comunicação. Eventos conhecidos do fluxo de
 * tratamento são "operacional"; qualquer outro (campanhas, eventos,
 * comunicados institucionais, valores desconhecidos) é tratado como "geral".
 */
export function classificarEvento(evento?: string | null): CanalComunicacao {
  if (!evento) return "geral";
  return SET_OPERACIONAIS.has(evento) ? "operacional" : "geral";
}

/** Atalho: o evento é operacional? */
export function isOperacional(evento?: string | null): boolean {
  return classificarEvento(evento) === "operacional";
}
