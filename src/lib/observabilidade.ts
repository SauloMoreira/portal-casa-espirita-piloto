/**
 * P1.2 — Observabilidade operacional consolidada.
 *
 * Camada de tradução (código → rótulo/tom) para os indicadores produzidos pela
 * RPC única `fn_observabilidade_operacional`. O backend é a fonte de verdade:
 * esta lib NÃO calcula indicador nem deriva regra de negócio — apenas traduz
 * códigos em rótulos amigáveis para a UI.
 *
 * INV-OBS-001 — Indicadores operacionais são somente leitura, derivados de
 * fontes canônicas do backend, e nunca disparam efeito colateral.
 */
import { rotuloMotivo } from "@/lib/notificacaoElegibilidade";

/** Janelas temporais válidas para o bloco histórico. */
export const JANELAS_OBSERVABILIDADE = ["24h", "7d", "30d"] as const;
export type JanelaObservabilidade = (typeof JANELAS_OBSERVABILIDADE)[number];

/** Janela padrão (decisão de produto): últimos 7 dias. */
export const JANELA_PADRAO: JanelaObservabilidade = "7d";

export const JANELA_LABEL: Record<JanelaObservabilidade, string> = {
  "24h": "Últimas 24h",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

export function ehJanelaValida(v: string): v is JanelaObservabilidade {
  return (JANELAS_OBSERVABILIDADE as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Shape do payload (espelho TS do contrato da RPC)
// ---------------------------------------------------------------------------

export interface ContagemPorChave {
  qtd: number;
}

export interface PendenciaStatus extends ContagemPorChave {
  status: string;
}
export interface DiagnosticoContagem extends ContagemPorChave {
  motivo_codigo: string;
}
export interface AnomaliaLembrete extends ContagemPorChave {
  assistido_id: string;
  evento: string;
}
export interface InconsistenciaAgendaFila {
  fila_id: string;
  motivo_codigo: string;
}
export interface OrigemContagem extends ContagemPorChave {
  origem: string;
}

export interface ObservabilidadeSnapshot {
  pendencias_por_status: PendenciaStatus[];
  aguardando_janela_limite: DiagnosticoContagem[];
  avisos_ausencia: { abertos: number; em_tratamento: number };
  anomalias_lembrete_por_vinculo: AnomaliaLembrete[];
  inconsistencias_agenda_fila: InconsistenciaAgendaFila[];
}

export interface ObservabilidadeHistorico {
  falhas_por_motivo: DiagnosticoContagem[];
  saneados_por_motivo: DiagnosticoContagem[];
  distribuicao_por_origem: OrigemContagem[];
}

export interface ObservabilidadePayload {
  schema_version: number;
  generated_at: string;
  snapshot_reference_time: string;
  historical_window: { code: string; from: string; to: string };
  snapshot: ObservabilidadeSnapshot;
  historico: ObservabilidadeHistorico;
}

/** Versão de schema que o frontend sabe consumir. */
export const SCHEMA_VERSION_SUPORTADA = 1;

// ---------------------------------------------------------------------------
// Tradução de códigos → rótulos (UI nunca inventa rótulo)
// ---------------------------------------------------------------------------

export const ORIGEM_LABEL: Record<string, string> = {
  automatico: "Automático",
  manual: "Manual",
  excecao: "Exceção",
};

export function rotuloOrigem(codigo: string): string {
  return ORIGEM_LABEL[codigo] ?? codigo;
}

export const STATUS_FILA_LABEL: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendada",
  enviado: "Enviada",
  falha: "Falha",
  cancelado: "Cancelada",
};

export function rotuloStatusFila(codigo: string): string {
  return STATUS_FILA_LABEL[codigo] ?? codigo;
}

/**
 * Traduz códigos de motivo do histórico (falhas/saneamento). Reusa o catálogo
 * canônico `rotuloMotivo`; cai para o próprio código quando desconhecido,
 * sem mascarar dados.
 */
export function rotuloMotivoObservabilidade(codigo: string): string {
  if (codigo === "desconhecido") return "Sem motivo registrado";
  return rotuloMotivo(codigo) ?? codigo;
}

/** Soma utilitária para totais de blocos (apresentação, sem regra de negócio). */
export function somaQtd(itens: ReadonlyArray<{ qtd: number }>): number {
  return itens.reduce((acc, i) => acc + (i.qtd ?? 0), 0);
}
