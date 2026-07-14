/**
 * Types specific to the Admin Dashboard. View models normalized by the
 * admin dashboard service and consumed by the page hook/components.
 */

export type PeriodKey = "hoje" | "7d" | "30d" | "mes" | "ano";

export interface DateRange {
  start: string;
  end: string;
}

/** Minimal assistido shape needed for dashboard aggregations. */
export interface DashboardAssistido {
  id: string;
  nome: string;
  data_nascimento: string | null;
  status: string | null;
  created_at: string;
  quantidade_palestras: number | null;
}

export interface DashboardTratamentoTipo {
  nome: string;
  count: number;
}

export interface DashboardCargaTarefeiro {
  nome: string;
  total: number;
}


export interface DashboardEntrevistaPeriodo {
  id: string;
  data: string;
  status: string;
  tipo_entrevista: string | null;
}

export interface DashboardEntrevistaRecente {
  id: string;
  data: string;
  status: string;
  assistido_id: string;
  entrevistador_id: string | null;
  tipo_entrevista: string | null;
  assistido_nome: string;
  entrevistador_nome: string;
}

export interface DashboardAguardandoItem {
  id: string;
  assistido_id: string;
  tratamento_id: string;
  created_at: string;
  prioridade: string | null;
  status: string;
  assistido_nome: string;
  tratamento_nome: string;
}

export interface DashboardGraficoSerie {
  name: string;
  value: number;
}

export interface DashboardPresencaSerie {
  data: string;
  Presenças: number;
  Ausências: number;
}

export interface EntrevistasPorTipo {
  regulares: number;
  livres: number;
  realizadas: number;
  total: number;
}

export type DashboardPendenciaTipo = "aguardando" | "lista_espera" | "faltas";

export interface DashboardPendencia {
  tipo: DashboardPendenciaTipo;
  label: string;
  count: number;
}

/** Ponto agregado da série de presenças (já calculado no servidor). */
export interface DashboardPresencaPonto {
  data: string;
  presentes: number;
  ausentes: number;
}

/**
 * Dados do dashboard administrativo, agregados 100% no servidor (RPC
 * `dashboard_admin`). O cliente apenas formata séries leves para os gráficos.
 */
export interface AdminDashboardData {
  range: DateRange;
  assistidosTotal: number;
  tratAtivos: number;
  tratConcluidos: number;
  entAgendadas: number;
  presencasHoje: number;
  listaEspera: number;
  aguardandoAgend: number;
  faltasMes: number;
  publicoPalestras: number;
  entRecentes: DashboardEntrevistaRecente[];
  tratPorTipo: DashboardTratamentoTipo[];
  cargaTarefeiros: DashboardCargaTarefeiro[];
  presencaPontos: DashboardPresencaPonto[];
  entrevistasPorTipo: EntrevistasPorTipo;
  faixaEtaria: DashboardGraficoSerie[];
}
