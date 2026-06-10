import type { PeriodKey } from "@/types/adminDashboard";

/** Chart palette shared across dashboard charts. */
export const CHART_COLORS = [
  "hsl(174, 42%, 35%)",
  "hsl(152, 55%, 42%)",
  "hsl(38, 60%, 55%)",
  "hsl(200, 80%, 50%)",
  "hsl(280, 45%, 55%)",
  "hsl(0, 72%, 51%)",
  "hsl(174, 42%, 55%)",
  "hsl(152, 55%, 62%)",
] as const;

/** Period filter options for the dashboard header. */
export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
  { key: "mes", label: "Mês" },
  { key: "ano", label: "Ano" },
];

export const ENTREVISTA_STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  remarcada: "Remarcada",
};

export const getEntrevistaStatusLabel = (status: string): string =>
  ENTREVISTA_STATUS_LABELS[status] ?? status;
