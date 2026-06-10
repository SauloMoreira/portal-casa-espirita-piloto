/** Domain types for the interview Agenda page. */

export type AgendaViewMode = "dia" | "semana" | "mes";

export type AgendaEventStatus = "agendada" | "realizada" | "cancelada" | "remarcada";

export interface AgendaDateRange {
  start: Date;
  end: Date;
}

/** A scheduled interview normalized for calendar display. */
export interface EntrevistaAgendaItem {
  id: string;
  assistido_id: string;
  entrevistador_id: string;
  data: string;
  tipo_entrevista: string;
  status: string;
  observacoes: string | null;
  assistido_nome: string;
  entrevistador_nome: string;
}

export interface AgendaEntrevistador {
  id: string;
  nome: string;
}

export interface AgendaFilterState {
  searchAssistido: string;
  status: string;
  entrevistador: string;
  tipo: string;
}

export interface AgendaData {
  entrevistas: EntrevistaAgendaItem[];
  entrevistadores: AgendaEntrevistador[];
}
