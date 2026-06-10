/**
 * Presentation/analytics types for dashboards and reports. These are
 * client-side view models (not direct table rows) used to decouple chart and
 * card components from raw query shapes.
 */

export interface IndicadorDashboard {
  label: string;
  value: number | string;
  delta?: number;
  hint?: string;
}

export interface RelatorioFrequencia {
  assistidoId: string;
  assistidoNome: string;
  totalSessoes: number;
  presencas: number;
  faltas: number;
  percentual: number;
}

export interface RelatorioFaltas {
  assistidoId: string;
  assistidoNome: string;
  faltas: number;
  periodoInicio: string;
  periodoFim: string;
}

export interface InsightIA {
  titulo: string;
  descricao: string;
  tipo: "retencao" | "operacional" | "alerta" | "sugestao";
  prioridade?: "baixa" | "media" | "alta";
}

export interface FaixaEtariaDado {
  faixa: string;
  total: number;
}
