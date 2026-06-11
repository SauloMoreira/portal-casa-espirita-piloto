import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from "date-fns";
import type {
  AdminDashboardData,
  DashboardAguardandoItem,
  DashboardCargaTarefeiro,
  DashboardEntrevistaRecente,
  DashboardTratamentoTipo,
  DateRange,
  PeriodKey,
} from "@/types/adminDashboard";

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

/**
 * Load and normalize all data blocks for the admin dashboard for one period.
 * Centralizes every Supabase query + aggregation so the UI stays declarative.
 */
export async function fetchAdminDashboard(
  period: PeriodKey,
): Promise<AdminDashboardData> {
  const range = getPeriodRange(period);
  const today = format(new Date(), "yyyy-MM-dd");

  const [
    { data: assistidosData },
    { count: tratAtivosC },
    { count: tratConcluidosC },
    { count: entAgendasC },
    { count: presencasHojeC },
    { count: listaEsperaC },
    { count: aguardAgendC },
    { data: recentesData },
    { data: tratData },
    { data: presData },
    { data: palData },
    { data: entData },
    { count: faltasMesC },
    { data: tiposTrat },
  ] = await Promise.all([
    supabase.from("assistidos").select("id, nome, data_nascimento, status, created_at, quantidade_palestras").is("deleted_at", null).limit(5000),
    supabase.from("assistido_tratamentos").select("*", { count: "exact", head: true }).in("status", ["aguardando_inicio", "em_andamento"]),
    supabase.from("assistido_tratamentos").select("*", { count: "exact", head: true }).eq("status", "concluido").gte("updated_at", range.start + "T00:00:00").lte("updated_at", range.end + "T23:59:59"),
    supabase.from("entrevistas_fraternas").select("*", { count: "exact", head: true }).eq("status", "agendada"),
    supabase.from("presencas_tratamentos").select("*", { count: "exact", head: true }).eq("data", today),
    supabase.from("assistido_tratamentos").select("*", { count: "exact", head: true }).eq("status", "aguardando_liberacao"),
    supabase.from("assistido_tratamentos").select("*", { count: "exact", head: true }).eq("status", "aguardando_agendamento"),
    supabase.from("entrevistas_fraternas").select("id, data, status, assistido_id, entrevistador_id, tipo_entrevista").order("data", { ascending: false }).limit(5),
    supabase.from("assistido_tratamentos").select("tratamento_id, status, tratamento:tipos_tratamento(nome, tarefeiro_id)").in("status", ["aguardando_inicio", "em_andamento"]).limit(5000),
    supabase.from("presencas_tratamentos").select("data, status_presenca").gte("data", range.start).lte("data", range.end).limit(5000),
    supabase.from("presencas_palestras").select("palestra_id, presente, palestra:palestras(data)").limit(5000),
    supabase.from("entrevistas_fraternas").select("id, data, status, tipo_entrevista").gte("data", range.start + "T00:00:00").lte("data", range.end + "T23:59:59").limit(5000),
    supabase.from("presencas_tratamentos").select("*", { count: "exact", head: true }).eq("status_presenca", "ausente").gte("data", range.start).lte("data", range.end),
    supabase.from("tipos_tratamento").select("id, nome, tarefeiro_id, coordenador_responsavel_id").eq("status", "ativo"),
  ]);

  const entRecentes = await buildEntrevistasRecentes((recentesData ?? []) as unknown as RecenteRow[]);
  const tratPorTipo = buildTratamentoDistribuicao((tratData ?? []) as unknown as TratRow[]);
  const cargaTarefeiros = await buildCargaTarefeiros((tratData ?? []) as unknown as TratRow[]);
  const publicoPalestras = (palData ?? []).filter((p) => p.presente).length;

  return {
    range,
    assistidos: (assistidosData ?? []) as AdminDashboardData["assistidos"],
    tratAtivos: tratAtivosC ?? 0,
    tratConcluidos: tratConcluidosC ?? 0,
    entAgendadas: entAgendasC ?? 0,
    presencasHoje: presencasHojeC ?? 0,
    listaEspera: listaEsperaC ?? 0,
    aguardandoAgend: aguardAgendC ?? 0,
    faltasMes: faltasMesC ?? 0,
    publicoPalestras,
    entRecentes,
    tratPorTipo,
    presencas: (presData ?? []) as AdminDashboardData["presencas"],
    cargaTarefeiros,
    entrevistas: (entData ?? []) as AdminDashboardData["entrevistas"],
  };
}

interface RecenteRow {
  id: string;
  data: string;
  status: string;
  assistido_id: string;
  entrevistador_id: string | null;
  tipo_entrevista: string | null;
}

async function buildEntrevistasRecentes(
  recentes: RecenteRow[],
): Promise<DashboardEntrevistaRecente[]> {
  if (recentes.length === 0) return [];
  const ids = [...new Set(recentes.map((r) => r.assistido_id))];
  const entIds = [...new Set(recentes.map((r) => r.entrevistador_id).filter(Boolean))] as string[];
  const [{ data: nomes }, { data: entNomes }] = await Promise.all([
    supabase.from("assistidos").select("id, nome").in("id", ids),
    supabase.rpc("staff_names", { _ids: entIds }),
  ]);
  const nomeMap = new Map((nomes ?? []).map((n) => [n.id, n.nome]));
  const entMap = new Map((entNomes ?? []).map((n) => [n.user_id, n.nome_completo]));
  return recentes.map((r) => ({
    ...r,
    assistido_nome: nomeMap.get(r.assistido_id) ?? "—",
    entrevistador_nome: (r.entrevistador_id && entMap.get(r.entrevistador_id)) || "—",
  }));
}

interface TratRow {
  tratamento_id: string;
  status: string;
  tratamento: { nome: string; tarefeiro_id: string | null } | null;
}

function buildTratamentoDistribuicao(
  tratData: TratRow[],
): DashboardTratamentoTipo[] {
  const map = new Map<string, DashboardTratamentoTipo>();
  tratData.forEach((d) => {
    if (!d.tratamento) return;
    const key = d.tratamento_id;
    if (!map.has(key)) map.set(key, { nome: d.tratamento.nome, count: 0 });
    map.get(key)!.count++;
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

async function buildCargaTarefeiros(
  tratData: TratRow[],
): Promise<DashboardCargaTarefeiro[]> {
  const tarefeiroMap = new Map<string, number>();
  tratData.forEach((d) => {
    const tarefeiroId = d.tratamento?.tarefeiro_id;
    if (!tarefeiroId) return;
    tarefeiroMap.set(tarefeiroId, (tarefeiroMap.get(tarefeiroId) ?? 0) + 1);
  });
  const tIds = [...tarefeiroMap.keys()];
  if (tIds.length === 0) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, nome_completo")
    .in("user_id", tIds);
  const pMap = new Map((profiles ?? []).map((p) => [p.user_id, p.nome_completo || "Sem nome"]));
  return [...tarefeiroMap.entries()]
    .map(([id, total]) => ({ nome: pMap.get(id) || id.slice(0, 8), total }))
    .sort((a, b) => b.total - a.total);
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
