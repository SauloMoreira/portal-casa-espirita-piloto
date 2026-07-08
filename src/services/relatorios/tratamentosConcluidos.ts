// ============================================================================
// Acesso a dados do relatório de Tratamentos Concluídos.
// Agregação 100% server-side via RPC `relatorio_tratamentos_concluidos`.
// A função no banco aplica os mesmos filtros e a visão por perfil.
// ============================================================================
import { supabase } from "@/integrations/supabase/client";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";
import type {
  PaginacaoParams,
  TratamentosConcluidosFiltros,
  TratamentosConcluidosResult,
} from "@/types/relatorios";
import { EXPORT_PAGE_SIZE } from "./frequencia";


/** Normaliza "todos"/vazio para null (a RPC trata null como "sem filtro"). */
function norm(v?: string | null): string | null {
  if (!v || v === "todos") return null;
  return v;
}

function ptDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

export async function fetchTratamentosConcluidos(
  filtros: TratamentosConcluidosFiltros,
  paginacao: PaginacaoParams,
): Promise<TratamentosConcluidosResult> {
  const { data, error } = await supabase.rpc("relatorio_tratamentos_concluidos", {
    p_data_inicio: filtros.dataInicio,
    p_data_fim: filtros.dataFim,
    p_tratamento_id: norm(filtros.tratamentoId),
    p_tipo: norm(filtros.tipoTratamento),
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
      total: Number(totais.total ?? 0),
      assistidos: Number(totais.assistidos ?? 0),
      tipos: Number(totais.tipos ?? 0),
      sessoes: Number(totais.sessoes ?? 0),
    },
    porTratamento: (payload.por_tratamento ?? []).map((r: any) => ({
      nome: r.nome ?? "—",
      count: Number(r.count ?? 0),
    })),
    porTipo: (payload.por_tipo ?? []).map((r: any) => ({
      nome: r.nome ?? "—",
      count: Number(r.count ?? 0),
    })),
    rows: (payload.rows ?? []).map((r: any) => ({
      id: r.id,
      assistido: r.assistido ?? "—",
      tratamento: r.tratamento ?? "—",
      tipoTratamento: r.tipo ?? "—",
      dataInicio: ptDate(r.data_inicio),
      dataConclusao: ptDate(r.data_conclusao),
      total: Number(r.total ?? 0),
      realizada: Number(r.realizada ?? 0),
      tarefeiro: r.tarefeiro ?? "—",
      coordenador: r.coordenador ?? "—",
    })),
  };
}

/** Busca TODAS as linhas filtradas para exportação coerente com a tabela. */
export async function fetchTratamentosConcluidosParaExport(
  filtros: TratamentosConcluidosFiltros,
): Promise<TratamentosConcluidosResult> {
  return fetchTratamentosConcluidos(filtros, { page: 1, pageSize: EXPORT_PAGE_SIZE });
}
