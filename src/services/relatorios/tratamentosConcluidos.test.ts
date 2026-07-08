import { describe, it, expect, vi, beforeEach } from "vitest";

let lastRpc: { fn: string; args: Record<string, unknown> } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      lastRpc = { fn, args };
      return Promise.resolve({
        data: {
          registros: 5,
          totais: { total: 5, assistidos: 4, tipos: 2, sessoes: 40 },
          por_tratamento: [{ nome: "Passe", count: 3 }, { nome: "Água Fluida", count: 2 }],
          por_tipo: [{ nome: "energetico", count: 3 }, { nome: "espiritual", count: 2 }],
          rows: [
            { id: "x1", assistido: "Ana", tratamento: "Passe", tipo: "energetico", data_inicio: "2025-01-01", data_conclusao: "2025-03-01T10:00:00", total: 10, realizada: 10, tarefeiro: "Carlos", coordenador: "Marta" },
          ],
        },
        error: null,
      });
    },
  },
}));

vi.mock("@/lib/tenant/currentTenant", () => ({
  requireInstituicaoId: () => "inst-e4",
  getCurrentInstituicaoId: () => "inst-e4",
}));

import { fetchTratamentosConcluidos, fetchTratamentosConcluidosParaExport } from "./tratamentosConcluidos";
import { EXPORT_PAGE_SIZE } from "./frequencia";


const filtros = {
  dataInicio: "2025-01-01",
  dataFim: "2025-03-31",
  tratamentoId: "todos",
  tipoTratamento: "energetico",
  tarefeiroId: "t1",
  coordenadorId: "todos",
};

describe("fetchTratamentosConcluidos", () => {
  beforeEach(() => { lastRpc = null; });

  it("normaliza 'todos' para null e envia paginação", async () => {
    await fetchTratamentosConcluidos(filtros, { page: 2, pageSize: 50 });
    expect(lastRpc?.fn).toBe("relatorio_tratamentos_concluidos");
    expect(lastRpc?.args).toMatchObject({
      p_data_inicio: "2025-01-01",
      p_data_fim: "2025-03-31",
      p_tratamento_id: null,
      p_tipo: "energetico",
      p_tarefeiro_id: "t1",
      p_coordenador_id: null,
      p_page: 2,
      p_page_size: 50,
      p_instituicao_id: "inst-e4",
    });
  });

  it("mapeia totais, agregações de gráfico e linhas (count real)", async () => {
    const res = await fetchTratamentosConcluidos(filtros, { page: 1, pageSize: 25 });
    expect(res.registros).toBe(5);
    expect(res.totais).toEqual({ total: 5, assistidos: 4, tipos: 2, sessoes: 40 });
    expect(res.porTratamento[0]).toEqual({ nome: "Passe", count: 3 });
    expect(res.porTipo[1]).toEqual({ nome: "espiritual", count: 2 });
    expect(res.rows[0].tipoTratamento).toBe("energetico");
    expect(res.rows[0].realizada).toBe(10);
  });

  it("exportação usa o mesmo filtro com page size amplo", async () => {
    await fetchTratamentosConcluidosParaExport(filtros);
    expect(lastRpc?.args.p_page).toBe(1);
    expect(lastRpc?.args.p_page_size).toBe(EXPORT_PAGE_SIZE);
    expect(lastRpc?.args.p_tipo).toBe("energetico");
  });
});
