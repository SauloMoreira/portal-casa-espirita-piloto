import { supabase } from "@/integrations/supabase/client";
import { aggregateIndicadores } from "@/lib/iaAssertividade";
import type { IaIndicadores } from "@/types/ia";

export interface IndicadoresFiltro {
  /** Data inicial (ISO yyyy-mm-dd) inclusiva. */
  inicio?: string | null;
  /** Data final (ISO yyyy-mm-dd) inclusiva. */
  fim?: string | null;
}

/**
 * Busca sugestões e feedbacks e devolve os indicadores agregados de assertividade.
 * O filtro de período aplica-se às sugestões (created_at). Os feedbacks são
 * restritos às sugestões do período para manter a coerência das taxas.
 */
export async function fetchIndicadoresIA(filtro: IndicadoresFiltro = {}): Promise<IaIndicadores> {
  let sugQuery = supabase
    .from("ia_sugestoes")
    .select("id, created_at, status, tratamentos_sugeridos_json, queixas_identificadas_json")
    .order("created_at", { ascending: true });

  if (filtro.inicio) sugQuery = sugQuery.gte("created_at", filtro.inicio);
  if (filtro.fim) sugQuery = sugQuery.lte("created_at", `${filtro.fim}T23:59:59.999Z`);

  const { data: sugestoes } = await sugQuery;
  const ids = (sugestoes ?? []).map((s) => s.id);

  let feedbacks: { sugestao_ia_id: string; classificacao: string; atribuicao_final_json: unknown }[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("ia_feedback")
      .select("sugestao_ia_id, classificacao, atribuicao_final_json")
      .in("sugestao_ia_id", ids);
    feedbacks = data ?? [];
  }

  return aggregateIndicadores(sugestoes ?? [], feedbacks);
}
