// ============================================================================
// Acesso a dados do relatório de Frequência de Presença.
// Agregação 100% server-side via RPC `relatorio_frequencia_presenca`.
// A função no banco aplica os mesmos filtros e a visão por perfil.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { measureAsync } from "@/lib/perfMonitor";
import type {
  FrequenciaResult,
  PaginacaoParams,
  RelatorioPresencaFiltros,
} from "@/types/relatorios";

/** Normaliza "todos"/vazio para null (a RPC trata null como "sem filtro"). */
function norm(v?: string | null): string | null {
  if (!v || v === "todos") return null;
  return v;
}

/** Limite usado para exportação (todas as linhas filtradas, sem paginar). */
export const EXPORT_PAGE_SIZE = 100000;

export async function fetchFrequenciaPresenca(
  filtros: RelatorioPresencaFiltros,
  paginacao: PaginacaoParams,
): Promise<FrequenciaResult> {
  const { data, error } = await measureAsync("rpc:relatorio_frequencia_presenca", () =>
    supabase.rpc("relatorio_frequencia_presenca", {
      p_data_inicio: filtros.dataInicio,
      p_data_fim: filtros.dataFim,
      p_tratamento_id: norm(filtros.tratamentoId),
      p_assistido_id: norm(filtros.assistidoId),
      p_tarefeiro_id: norm(filtros.tarefeiroId),
      p_coordenador_id: norm(filtros.coordenadorId),
      p_page: paginacao.page,
      p_page_size: paginacao.pageSize,
    }),
  );

  if (error) throw error;

  const payload = (data ?? {}) as any;
  const totais = payload.totais ?? {};
  return {
    registros: Number(payload.registros ?? 0),
    totais: {
      total: Number(totais.total ?? 0),
      presencas: Number(totais.presencas ?? 0),
      ausencias: Number(totais.ausencias ?? 0),
    },
    rows: (payload.rows ?? []).map((r: any) => ({
      nome: r.nome,
      tratamento: r.tratamento,
      presencas: Number(r.presencas ?? 0),
      ausencias: Number(r.ausencias ?? 0),
      total: Number(r.total ?? 0),
      percentual: Number(r.percentual ?? 0),
    })),
  };
}

/** Busca TODAS as linhas filtradas para exportação coerente com a tabela. */
export async function fetchFrequenciaParaExport(
  filtros: RelatorioPresencaFiltros,
): Promise<FrequenciaResult> {
  return fetchFrequenciaPresenca(filtros, { page: 1, pageSize: EXPORT_PAGE_SIZE });
}
