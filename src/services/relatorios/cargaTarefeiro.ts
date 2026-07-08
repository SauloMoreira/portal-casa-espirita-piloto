// ============================================================================
// Acesso a dados do relatório de Carga por Tarefeiro.
// Agregação 100% server-side via RPC `relatorio_carga_tarefeiro`.
// A função no banco aplica os mesmos filtros e a visão por perfil.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";
import type {
  CargaTarefeiroFiltros,
  CargaTarefeiroResult,
  PaginacaoParams,
} from "@/types/relatorios";
import { EXPORT_PAGE_SIZE } from "./frequencia";


function norm(v?: string | null): string | null {
  if (!v || v === "todos") return null;
  return v;
}

export async function fetchCargaTarefeiro(
  filtros: CargaTarefeiroFiltros,
  paginacao: PaginacaoParams,
): Promise<CargaTarefeiroResult> {
  const { data, error } = await supabase.rpc("relatorio_carga_tarefeiro", {
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_tratamento_id: norm(filtros.tratamentoId),
    p_tarefeiro_id: norm(filtros.tarefeiroId),
    p_page: paginacao.page,
    p_page_size: paginacao.pageSize,
  });

  if (error) throw error;

  const payload = (data ?? {}) as any;
  const totais = payload.totais ?? {};
  return {
    registros: Number(payload.registros ?? 0),
    totais: {
      sessoes: Number(totais.sessoes ?? 0),
      assistidos: Number(totais.assistidos ?? 0),
      presencas: Number(totais.presencas ?? 0),
      ausencias: Number(totais.ausencias ?? 0),
      emAndamento: Number(totais.em_andamento ?? 0),
      concluidos: Number(totais.concluidos ?? 0),
      maiorCarga: totais.maior_carga ?? "—",
    },
    rows: (payload.rows ?? []).map((r: any) => ({
      tarefeiroId: r.tarefeiro_id,
      tarefeiro: r.tarefeiro ?? "—",
      totalAssistidos: Number(r.total_assistidos ?? 0),
      totalSessoes: Number(r.total_sessoes ?? 0),
      presencas: Number(r.presencas ?? 0),
      ausencias: Number(r.ausencias ?? 0),
      emAndamento: Number(r.em_andamento ?? 0),
      concluidos: Number(r.concluidos ?? 0),
      tratamentos: (r.tratamentos ?? []) as string[],
    })),
  };
}

/** Busca TODAS as linhas filtradas para exportação coerente com a tabela. */
export async function fetchCargaTarefeiroParaExport(
  filtros: CargaTarefeiroFiltros,
): Promise<CargaTarefeiroResult> {
  return fetchCargaTarefeiro(filtros, { page: 1, pageSize: EXPORT_PAGE_SIZE });
}
