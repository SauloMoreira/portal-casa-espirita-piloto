import { supabase } from "@/integrations/supabase/client";
import { measureAsync } from "@/lib/perfMonitor";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import type {
  AdminDashboardData,
  DashboardAguardandoItem,
  DateRange,
  PeriodKey,
} from "@/types/adminDashboard";

interface DashboardAdminRpcResult {
  autorizado: boolean;
  assistidos_total?: number;
  trat_ativos?: number;
  trat_concluidos?: number;
  ent_agendadas?: number;
  presencas_hoje?: number;
  lista_espera?: number;
  aguardando_agend?: number;
  faltas_mes?: number;
  publico_palestras?: number;
  ent_recentes?: {
    id: string;
    data: string;
    status: string;
    assistido_id: string;
    entrevistador_id: string | null;
    tipo_entrevista: string;
    assistido_nome: string;
    entrevistador_nome: string;
  }[];
  trat_por_tipo?: { nome: string; count: number }[];
  carga_tarefeiros?: { nome: string; total: number }[];
  presenca_pontos?: { data: string; presentes: number; ausentes: number }[];
  entrevistas_por_tipo?: { regulares: number; livres: number; realizadas: number; total: number };
  faixa_etaria?: { name: string; value: number }[];
}


/** Resolve the date range for a given period key. */
export function getPeriodRange(key: PeriodKey): DateRange {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  switch (key) {
    case "hoje":
      return { start: today, end: today };
    case "7d":
      return { start: format(subDays(now, 7), "yyyy-MM-dd"), end: today };
    case "30d":
      return { start: format(subDays(now, 30), "yyyy-MM-dd"), end: today };
    case "mes":
      return {
        start: format(startOfMonth(now), "yyyy-MM-dd"),
        end: format(endOfMonth(now), "yyyy-MM-dd"),
      };
    case "ano":
      return { start: format(startOfYear(now), "yyyy-MM-dd"), end: today };
  }
}

const EMPTY = (range: DateRange): AdminDashboardData => ({
  range,
  assistidosTotal: 0,
  tratAtivos: 0,
  tratConcluidos: 0,
  entAgendadas: 0,
  presencasHoje: 0,
  listaEspera: 0,
  aguardandoAgend: 0,
  faltasMes: 0,
  publicoPalestras: 0,
  entRecentes: [],
  tratPorTipo: [],
  cargaTarefeiros: [],
  presencaPontos: [],
  entrevistasPorTipo: { regulares: 0, livres: 0, realizadas: 0, total: 0 },
  faixaEtaria: [],
});

/**
 * Load every dashboard block for one period in a single server-side RPC call
 * (`dashboard_admin`). All aggregation happens in the database, so the client
 * only normalizes the typed payload.
 */
export async function fetchAdminDashboard(
  period: PeriodKey,
): Promise<AdminDashboardData> {
  const range = getPeriodRange(period);

  const { data, error } = await measureAsync("rpc:dashboard_admin", async () =>
    supabase.rpc("dashboard_admin", {
      p_inicio: range.start,
      p_fim: range.end,
      p_instituicao_id: requireInstituicaoId(),
    }),
  );
  if (error) throw error;

  const p = (data ?? {}) as any;
  if (!p.autorizado) return EMPTY(range);

  const et = p.entrevistas_por_tipo ?? {};
  return {
    range,
    assistidosTotal: Number(p.assistidos_total ?? 0),
    tratAtivos: Number(p.trat_ativos ?? 0),
    tratConcluidos: Number(p.trat_concluidos ?? 0),
    entAgendadas: Number(p.ent_agendadas ?? 0),
    presencasHoje: Number(p.presencas_hoje ?? 0),
    listaEspera: Number(p.lista_espera ?? 0),
    aguardandoAgend: Number(p.aguardando_agend ?? 0),
    faltasMes: Number(p.faltas_mes ?? 0),
    publicoPalestras: Number(p.publico_palestras ?? 0),
    entRecentes: (p.ent_recentes ?? []).map((r: any) => ({
      id: r.id,
      data: r.data,
      status: r.status,
      assistido_id: r.assistido_id,
      entrevistador_id: r.entrevistador_id,
      tipo_entrevista: r.tipo_entrevista,
      assistido_nome: r.assistido_nome ?? "—",
      entrevistador_nome: r.entrevistador_nome ?? "—",
    })),
    tratPorTipo: (p.trat_por_tipo ?? []).map((r: any) => ({
      nome: r.nome ?? "—",
      count: Number(r.count ?? 0),
    })),
    cargaTarefeiros: (p.carga_tarefeiros ?? []).map((r: any) => ({
      nome: r.nome ?? "—",
      total: Number(r.total ?? 0),
    })),
    presencaPontos: (p.presenca_pontos ?? []).map((r: any) => ({
      data: r.data,
      presentes: Number(r.presentes ?? 0),
      ausentes: Number(r.ausentes ?? 0),
    })),
    entrevistasPorTipo: {
      regulares: Number(et.regulares ?? 0),
      livres: Number(et.livres ?? 0),
      realizadas: Number(et.realizadas ?? 0),
      total: Number(et.total ?? 0),
    },
    faixaEtaria: (p.faixa_etaria ?? []).map((r: any) => ({
      name: r.name ?? "—",
      value: Number(r.value ?? 0),
    })),
  };
}

/** Load the "aguardando agendamento" detail list shown in the dialog. */
export async function fetchAguardandoList(): Promise<DashboardAguardandoItem[]> {
  const { data } = await supabase
    .from("assistido_tratamentos")
    .select("id, assistido_id, tratamento_id, created_at, prioridade, urgencia, status, assistido:assistidos(nome), tratamento:tipos_tratamento(nome)")
    .eq("status", "aguardando_agendamento")
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((d) => ({
    id: d.id,
    assistido_id: d.assistido_id,
    tratamento_id: d.tratamento_id,
    created_at: d.created_at,
    prioridade: d.prioridade,
    status: d.status,
    assistido_nome: (d.assistido as { nome: string } | null)?.nome || "—",
    tratamento_nome: (d.tratamento as { nome: string } | null)?.nome || "—",
  }));
}
