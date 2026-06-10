import type { AgendaFilterState, AgendaViewMode } from "@/types/agenda";

export const AGENDA_STATUS_COLORS: Record<string, string> = {
  agendada: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  realizada: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  cancelada: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  remarcada: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

export const AGENDA_STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};

export const AGENDA_VIEW_OPTIONS: { value: AgendaViewMode; label: string }[] = [
  { value: "dia", label: "Dia" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mês" },
];

export const AGENDA_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "todas_ativas", label: "Ativas (sem canceladas)" },
  { value: "todos", label: "Todos os status" },
  { value: "agendada", label: "Agendada" },
  { value: "realizada", label: "Realizada" },
  { value: "cancelada", label: "Cancelada" },
  { value: "remarcada", label: "Remarcada" },
];

export const AGENDA_TIPO_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "todos", label: "Todos os tipos" },
  { value: "regular", label: "Regular" },
  { value: "livre", label: "Livre" },
];

export const AGENDA_WEEK_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const AGENDA_DEFAULT_FILTERS: AgendaFilterState = {
  searchAssistido: "",
  status: "todas_ativas",
  entrevistador: "todos",
  tipo: "todos",
};

export const getAgendaStatusLabel = (s: string) => AGENDA_STATUS_LABELS[s] || s;
export const getAgendaStatusColor = (s: string) => AGENDA_STATUS_COLORS[s] || "";
