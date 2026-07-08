// ============================================================================
// Acesso a dados do relatório de Faltas por Período.
// Agregação 100% server-side via RPC `relatorio_faltas_periodo`.
// A função no banco aplica os mesmos filtros e a visão por perfil.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";
import type {
  FaltasResult,
  PaginacaoParams,
  RelatorioPresencaFiltros,
} from "@/types/relatorios";
import { EXPORT_PAGE_SIZE } from "./frequencia";


function norm(v?: string | null): string | null {
  if (!v || v === "todos") return null;
  return v;
}

export async function fetchFaltasPorPeriodo(
  filtros: RelatorioPresencaFiltros,
  paginacao: PaginacaoParams,
): Promise<FaltasResult> {
  const { data, error } = await supabase.rpc("relatorio_faltas_periodo", {
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_tratamento_id: norm(filtros.tratamentoId),
    p_assistido_id: norm(filtros.assistidoId),
    p_tarefeiro_id: norm(filtros.tarefeiroId),
    p_coordenador_id: norm(filtros.coordenadorId),
    p_page: paginacao.page,
    p_page_size: paginacao.pageSize,
  });

  if (error) throw error;

  const payload = (data ?? {}) as any;
  const totais = payload.totais ?? {};
  return {
    registros: Number(payload.registros ?? 0),
    totais: {
      totalFaltas: Number(totais.total_faltas ?? 0),
      assistidosComFalta: Number(totais.assistidos_com_falta ?? 0),
      pctMedio: Number(totais.pct_medio ?? 0),
      vinculosComFalta: Number(totais.vinculos_com_falta ?? 0),
    },
    rows: (payload.rows ?? []).map((r: any) => ({
      assistido: r.assistido,
      tratamento: r.tratamento,
      totalFaltas: Number(r.total_faltas ?? 0),
      datasFaltas: (r.datas ?? []) as string[],
      totalSessoes: Number(r.total_sessoes ?? 0),
      percentual: Number(r.percentual ?? 0),
    })),
  };
}

/** Busca TODAS as linhas filtradas para exportação coerente com a tabela. */
export async function fetchFaltasParaExport(
  filtros: RelatorioPresencaFiltros,
): Promise<FaltasResult> {
  return fetchFaltasPorPeriodo(filtros, { page: 1, pageSize: EXPORT_PAGE_SIZE });
}
