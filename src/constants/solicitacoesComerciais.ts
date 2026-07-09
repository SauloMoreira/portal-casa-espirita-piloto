/**
 * SAAS-06-B0.4 — Constantes centrais das solicitações comerciais.
 *
 * Prazos, tipos, status e prioridades ficam centralizados aqui para evitar
 * hardcode espalhado pelas telas. Os intervalos são espelhados da função
 * `public.fn_solicitacao_proximo_alerta` no banco.
 */

export const PRAZOS_ALERTA_HORAS_UTEIS = {
  imediato: 0,
  segundo: 2,
  terceiro: 24,
  quarto: 48,
  quintoEmDiante: 72,
} as const;

export const PRIORIDADE_LABEL: Record<string, string> = {
  normal: "Normal",
  alta: "Alta",
  critica: "Crítica",
};

export const PRIORIDADE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  normal: "outline",
  alta: "secondary",
  critica: "destructive",
};

export const TIPO_SOLICITACAO_LABEL: Record<string, string> = {
  // históricos
  novo_modulo: "Solicitar novo módulo",
  desabilitar_modulo: "Solicitar desabilitação de módulo",
  alterar_plano: "Solicitar alteração de plano",
  segunda_via_cobranca: "Solicitar segunda via de cobrança",
  cancelamento: "Solicitar cancelamento",
  contato_comercial: "Solicitar contato comercial",
  outro: "Outro",
  // novos
  solicitar_novo_modulo: "Solicitar novo módulo",
  solicitar_desabilitar_modulo: "Solicitar desabilitação de módulo",
  informar_pagamento: "Informar pagamento",
  solicitar_cancelamento: "Solicitar cancelamento",
  falar_com_comercial: "Falar com o comercial",
  suporte_comercial: "Suporte comercial",
};

export const TIPOS_ATIVOS_UI = [
  "solicitar_novo_modulo",
  "solicitar_desabilitar_modulo",
  "alterar_plano",
  "segunda_via_cobranca",
  "informar_pagamento",
  "solicitar_cancelamento",
  "falar_com_comercial",
  "suporte_comercial",
] as const;

export const STATUS_ORDER = [
  "pendente",
  "em_analise",
  "aguardando_cliente",
  "aguardando_pagamento",
  "aprovada",
  "recusada",
  "concluida",
  "cancelada",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  aguardando_cliente: "Aguardando cliente",
  aguardando_pagamento: "Aguardando pagamento",
  aprovada: "Aprovada",
  recusada: "Recusada",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pendente: "secondary",
  em_analise: "secondary",
  aguardando_cliente: "secondary",
  aguardando_pagamento: "secondary",
  aprovada: "default",
  concluida: "default",
  recusada: "destructive",
  cancelada: "outline",
};

/** Status finais que interrompem a repetição do alerta. */
export const STATUS_QUE_INTERROMPEM_ALERTA: readonly string[] = [
  "em_analise",
  "aguardando_cliente",
  "aguardando_pagamento",
  "aprovada",
  "recusada",
  "concluida",
  "cancelada",
];

export const AUDIT_MARKER_SOLICITACAO_COMERCIAL =
  "saas06_b04_solicitacao_comercial_alerta";
