/**
 * Domain status and enum values centralized to avoid loose repeated strings.
 * Keep these aligned with the database enums/check constraints.
 */

// Vínculo assistido <-> tratamento (estados do vínculo de tratamento)
export const VINCULO_STATUS = {
  aguardandoLiberacao: "aguardando_liberacao",
  ativo: "ativo",
  pausado: "pausado",
  concluido: "concluido",
  cancelado: "cancelado",
} as const;
export type VinculoStatus = (typeof VINCULO_STATUS)[keyof typeof VINCULO_STATUS];

// Presença em sessões de tratamento (classificação GERAL persistida).
// Fonte única da semântica geral×operacional: src/lib/presencaClassificacao.ts
// (espelho de fn_presenca_classificacao no backend). Valores alinhados ao
// check constraint real do banco — NÃO usar "falta"/"justificada".
export { STATUS_PRESENCA as PRESENCA_STATUS } from "@/lib/presencaClassificacao";
export type { StatusPresenca as PresencaStatus } from "@/lib/presencaClassificacao";

// Sessões públicas (palestras / check-in)
export const SESSAO_PUBLICA_STATUS = {
  aberta: "aberta",
  encerrada: "encerrada",
} as const;
export type SessaoPublicaStatus =
  (typeof SESSAO_PUBLICA_STATUS)[keyof typeof SESSAO_PUBLICA_STATUS];

// Modos de agendamento de tratamento
export const MODO_AGENDAMENTO = {
  livre: "livre",
  sequencial: "sequencial",
  dataInicial: "data_inicial",
} as const;
export type ModoAgendamento =
  (typeof MODO_AGENDAMENTO)[keyof typeof MODO_AGENDAMENTO];

// Prioridade da lista de espera de coordenação
export const PRIORIDADE = {
  normal: "normal",
  alta: "alta",
  urgente: "urgente",
} as const;
export type Prioridade = (typeof PRIORIDADE)[keyof typeof PRIORIDADE];

// Entrevista
export const ENTREVISTA_STATUS = {
  agendada: "agendada",
  realizada: "realizada",
  cancelada: "cancelada",
} as const;
export type EntrevistaStatus =
  (typeof ENTREVISTA_STATUS)[keyof typeof ENTREVISTA_STATUS];

export const DIAS_SEMANA = [
  "domingo",
  "segunda",
  "terca",
  "quarta",
  "quinta",
  "sexta",
  "sabado",
] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];
