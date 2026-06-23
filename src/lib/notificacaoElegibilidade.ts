/**
 * Regra OFICIAL e ÚNICA de elegibilidade de lembrete de sessão.
 *
 * Esta é a contraparte em TypeScript da função de banco
 * `public.fn_fila_motivo_inelegivel`, que é a fonte da verdade usada por:
 *   - geração/enfileiramento (trigger `fn_notif_sessao`)
 *   - saneamento da fila (`fn_sanear_fila_notificacoes`)
 *   - dispatch (`notificacoes-dispatch`, via RPC)
 *
 * O dispatch e o saneamento chamam a função de banco diretamente (fonte única
 * de verdade no servidor). Este módulo replica a MESMA regra para uso no
 * frontend (Central de Notificações) e para os testes unitários — mantendo a
 * decisão "esta sessão pode gerar lembrete?" centralizada e consistente.
 *
 * Side-effect free e provider-agnóstico.
 */

import { lembreteVencido } from "@/lib/notificacoes";

/** Status operacionais possíveis de uma sessão na agenda (fonte da verdade). */
export const AGENDA_STATUS_ELEGIVEL = "agendado" as const;

/** Eventos da fila atrelados à agenda como fonte da verdade. */
export const EVENTOS_SESSAO = ["sessao_lembrete", "sessao_criada"] as const;
export type EventoSessao = (typeof EVENTOS_SESSAO)[number];

/** Motivos pelos quais um item da fila não deve gerar/enviar lembrete. */
export type MotivoInelegivel =
  | "item_inexistente"
  | "sessao_inexistente"
  | "sessao_substituida"
  | "sessao_cancelada"
  | "sessao_nao_agendada"
  | "lembrete_vencido";

/** Rótulos amigáveis (pt-BR) para exibir ao administrador na Central. */
export const MOTIVO_LABEL: Record<string, string> = {
  item_inexistente: "Item inexistente",
  sessao_inexistente: "Sessão não encontrada (agenda órfã/antiga)",
  sessao_substituida: "Sessão substituída por novo plano",
  sessao_cancelada: "Sessão cancelada",
  sessao_nao_agendada: "Sessão não é mais a agenda ativa",
  lembrete_vencido: "Lembrete vencido (sessão já passou)",
  // Motivos pré-existentes de outras travas do dispatch:
  opt_out: "Assistido optou por não receber",
  comunicacao_geral_desativada: "Comunicações gerais desativadas",
  sem_telefone: "Sem telefone cadastrado",
  template_indisponivel: "Modelo de mensagem indisponível",
  // Invalidação de lembretes antigos por exceção operacional:
  sessao_remarcada_por_excecao: "Lembrete invalidado (sessão remarcada por exceção)",
  entrevista_remarcada_por_excecao: "Lembrete invalidado (entrevista remarcada por exceção)",
  excecao_operacional: "Gerado por exceção operacional",
};

/** Tradução amigável de um código de motivo/erro; devolve o próprio código se desconhecido. */
export function rotuloMotivo(codigo?: string | null): string | null {
  if (!codigo) return null;
  return MOTIVO_LABEL[codigo] ?? codigo;
}

/** Eventos da fila gerados pelo processamento de uma exceção operacional. */
export const EVENTOS_EXCECAO = [
  "sessao_cancelada_por_excecao",
  "sessao_remarcada_por_excecao",
  "entrevista_cancelada_por_excecao",
  "entrevista_remarcada_por_excecao",
  "publico_cancelado_por_excecao",
  "publico_remarcado_por_excecao",
] as const;

export type EventoExcecao = (typeof EVENTOS_EXCECAO)[number];

/** True quando o evento da fila foi gerado por uma exceção operacional. */
export function ehEventoExcecao(evento?: string | null): boolean {
  return !!evento && (EVENTOS_EXCECAO as readonly string[]).includes(evento);
}

export interface ElegibilidadeInput {
  /** Evento de origem do item da fila. */
  evento: string;
  /** A sessão correspondente existe na agenda? */
  existeAgenda: boolean;
  /** Status atual da sessão na agenda (quando existe). */
  agendaStatus?: string | null;
  /** Data da sessão (YYYY-MM-DD) — usada para o guard de vencimento. */
  sessaoData?: string | null;
  /** Horário da sessão (HH:MM[:SS]). */
  horario?: string | null;
  /** Instante de avaliação (default: agora). */
  agora?: Date;
}

/**
 * Decide o motivo de inelegibilidade de um lembrete de sessão.
 * Retorna `null` quando a sessão é elegível (agenda válida e ainda não vencida).
 *
 * Espelha exatamente a ordem de checagem da função de banco.
 */
export function motivoInelegibilidadeLembrete(
  input: ElegibilidadeInput,
): MotivoInelegivel | null {
  // Eventos não atrelados à agenda são governados em outro lugar → elegíveis aqui.
  if (!EVENTOS_SESSAO.includes(input.evento as EventoSessao)) return null;

  if (!input.existeAgenda) return "sessao_inexistente";

  const status = input.agendaStatus ?? "";
  if (status === "substituida_plano") return "sessao_substituida";
  if (status === "cancelado") return "sessao_cancelada";
  if (status !== AGENDA_STATUS_ELEGIVEL) return "sessao_nao_agendada";

  const agora = input.agora ?? new Date();
  if (input.sessaoData && lembreteVencido(input.sessaoData, input.horario ?? "", agora)) {
    return "lembrete_vencido";
  }

  return null;
}

/** Conveniência booleana: a sessão pode gerar/enviar lembrete? */
export function sessaoElegivelParaLembrete(input: ElegibilidadeInput): boolean {
  return motivoInelegibilidadeLembrete(input) === null;
}

// ============================================================================
// Regra OFICIAL (espelho) de notificação por exceção operacional.
// Contraparte em TS de `public.fn_excecao_alvos` / `fn_processar_excecao_notificacoes`.
// ============================================================================

export type DominioExcecao = "tratamento" | "entrevista" | "publico";
export type TipoEventoExcecao = "cancelamento" | "remarcacao";

/**
 * Deriva o tipo de evento da exceção a partir do status e da presença de
 * `nova_data`. Sem `nova_data` válida → trata como cancelamento (não finge
 * remarcação).
 */
export function tipoEventoExcecao(
  status: string | null | undefined,
  novaData: string | null | undefined,
): TipoEventoExcecao {
  if (status === "remarcado" && !!novaData && novaData.trim() !== "") {
    return "remarcacao";
  }
  return "cancelamento";
}

/** Mapeia (domínio, tipo) → enum de evento da fila. */
export function eventoExcecao(
  dominio: DominioExcecao,
  tipo: TipoEventoExcecao,
): EventoExcecao {
  switch (dominio) {
    case "entrevista":
      return tipo === "remarcacao"
        ? "entrevista_remarcada_por_excecao"
        : "entrevista_cancelada_por_excecao";
    case "publico":
      return tipo === "remarcacao"
        ? "publico_remarcado_por_excecao"
        : "publico_cancelado_por_excecao";
    case "tratamento":
    default:
      return tipo === "remarcacao"
        ? "sessao_remarcada_por_excecao"
        : "sessao_cancelada_por_excecao";
  }
}

export interface AlvoExcecaoInput {
  dominio: DominioExcecao;
  /** O compromisso existe (sessão/entrevista/sessão pública)? */
  existe: boolean;
  /** Status atual do compromisso. */
  status?: string | null;
  /** Data do compromisso (YYYY-MM-DD ou ISO). */
  dataCompromisso?: string | null;
  /** Horário do compromisso. */
  horario?: string | null;
  /** Público: existe vínculo rastreável (assistido_id e/ou celular)? */
  alvoRastreavel?: boolean;
  /** Há telefone normalizado disponível? */
  telefone?: string | null;
  /** Instante de avaliação (default: agora). */
  agora?: Date;
}

/**
 * Decide se um compromisso é alvo elegível de notificação por exceção,
 * espelhando a regra oficial do banco (`fn_excecao_alvos`).
 */
export function alvoExcecaoElegivel(input: AlvoExcecaoInput): boolean {
  if (!input.existe) return false;
  const status = input.status ?? "";
  const agora = input.agora ?? new Date();

  if (input.dominio === "tratamento") {
    if (status !== AGENDA_STATUS_ELEGIVEL) return false; // agendado apenas
    if (input.dataCompromisso && lembreteVencido(input.dataCompromisso, input.horario ?? "", agora)) {
      return false; // vencida
    }
    return true;
  }

  if (input.dominio === "entrevista") {
    if (["cancelada", "remarcada", "concluida", "realizada"].includes(status)) return false;
    if (input.dataCompromisso && lembreteVencido(input.dataCompromisso, input.horario ?? "", agora)) {
      return false;
    }
    return true;
  }

  // publico: sem disparo cego — exige alvo rastreável.
  if (status === "cancelado") return false;
  if (!input.alvoRastreavel) return false;
  return true;
}
