// ============================================================================
// Q1-C5 — Contrato tipado do retorno jsonb do monitoramento de rollout.
//
// Centraliza o contrato `RolloutMonitor` (RPC `fn_monitor_excecao_notificacoes`)
// e fornece a normalização que substitui o antigo `as unknown as`, preservando
// integralmente a lógica atual de rollout/kill-switch. Sem mudança funcional.
// ============================================================================

export interface RolloutMonitor {
  rollout_ativo: boolean;
  desde: string;
  excecoes_processadas: number;
  cancelamentos: number;
  remarcacoes: number;
  fila_por_status: Record<string, number>;
  fila_por_evento: Record<string, number>;
  fallback_por_nome: number;
  publico_com_alvo: number;
  dedupe_duplicados: number;
}

/** Normaliza o retorno jsonb de `fn_monitor_excecao_notificacoes`. */
export function parseRolloutMonitor(data: unknown): RolloutMonitor {
  return data as RolloutMonitor;
}
