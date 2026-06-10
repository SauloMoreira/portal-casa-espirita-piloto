import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type {
  AgendaData,
  AgendaDateRange,
  AgendaEntrevistador,
  EntrevistaAgendaItem,
} from "@/types/agenda";

/**
 * Load scheduled interviews (entrevistas_fraternas) within a date range and
 * normalize them for calendar display, resolving assistido/entrevistador
 * names. Centralizes all Supabase access for the Agenda page.
 */
export async function fetchEntrevistasNoRange(
  range: AgendaDateRange,
): Promise<AgendaData> {
  const startStr = format(range.start, "yyyy-MM-dd");
  const endStr = format(range.end, "yyyy-MM-dd");

  const { data: rawEntrevistas, error } = await supabase
    .from("entrevistas_fraternas")
    .select("id, assistido_id, entrevistador_id, data, tipo_entrevista, status, observacoes")
    .gte("data", `${startStr}T00:00:00`)
    .lte("data", `${endStr}T23:59:59`)
    .order("data", { ascending: true });

  if (error) throw error;
  if (!rawEntrevistas || rawEntrevistas.length === 0) {
    return { entrevistas: [], entrevistadores: [] };
  }

  const assistidoIds = [...new Set(rawEntrevistas.map((e) => e.assistido_id))];
  const entrevistadorIds = [...new Set(rawEntrevistas.map((e) => e.entrevistador_id))];

  const [{ data: assistidos }, { data: profiles }] = await Promise.all([
    supabase.from("assistidos").select("id, nome").in("id", assistidoIds),
    supabase.from("profiles").select("user_id, nome_completo").in("user_id", entrevistadorIds),
  ]);

  const assistidoMap = new Map((assistidos ?? []).map((a) => [a.id, a.nome]));
  const entrevistadorMap = new Map(
    (profiles ?? []).map((p) => [p.user_id, p.nome_completo || "—"]),
  );

  const entrevistadores: AgendaEntrevistador[] = entrevistadorIds.map((id) => ({
    id,
    nome: entrevistadorMap.get(id) || "—",
  }));

  const entrevistas: EntrevistaAgendaItem[] = rawEntrevistas.map((e) => ({
    ...e,
    assistido_nome: assistidoMap.get(e.assistido_id) || "—",
    entrevistador_nome: entrevistadorMap.get(e.entrevistador_id) || "—",
  }));

  return { entrevistas, entrevistadores };
}
