import { describe, it, expect, vi, beforeEach } from "vitest";

let lastRpc: { fn: string; args: Record<string, unknown> } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      lastRpc = { fn, args };
      return Promise.resolve({
        data: {
          registros: 2,
          totais: { sessoes: 50, assistidos: 12, presencas: 40, ausencias: 10, em_andamento: 6, concluidos: 4, maior_carga: "Carlos Silva" },
          rows: [
            { tarefeiro_id: "u1", tarefeiro: "Carlos Silva", total_assistidos: 8, total_sessoes: 30, presencas: 25, ausencias: 5, em_andamento: 4, concluidos: 2, tratamentos: ["Passe", "Água Fluida"] },
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

import { fetchCargaTarefeiro, fetchCargaTarefeiroParaExport } from "./cargaTarefeiro";
import { EXPORT_PAGE_SIZE } from "./frequencia";


const filtros = {
  dataInicio: "2025-05-01",
  dataFim: "2025-05-31",
  tratamentoId: "todos",
  tarefeiroId: "u1",
};

describe("fetchCargaTarefeiro", () => {
  beforeEach(() => { lastRpc = null; });

  it("normaliza filtros e envia paginação", async () => {
    await fetchCargaTarefeiro(filtros, { page: 1, pageSize: 25 });
    expect(lastRpc?.fn).toBe("relatorio_carga_tarefeiro");
    expect(lastRpc?.args).toMatchObject({
      p_data_inicio: "2025-05-01",
      p_data_fim: "2025-05-31",
      p_tratamento_id: null,
      p_tarefeiro_id: "u1",
      p_page: 1,
      p_page_size: 25,
    });
  });

  it("mapeia totalizadores e linhas (count real)", async () => {
    const res = await fetchCargaTarefeiro(filtros, { page: 1, pageSize: 25 });
    expect(res.registros).toBe(2);
    expect(res.totais).toEqual({ sessoes: 50, assistidos: 12, presencas: 40, ausencias: 10, emAndamento: 6, concluidos: 4, maiorCarga: "Carlos Silva" });
    expect(res.rows[0].tratamentos).toEqual(["Passe", "Água Fluida"]);
    expect(res.rows[0].presencas).toBe(25);
  });

  it("exportação respeita filtros e usa page size amplo", async () => {
    await fetchCargaTarefeiroParaExport(filtros);
    expect(lastRpc?.args.p_page_size).toBe(EXPORT_PAGE_SIZE);
    expect(lastRpc?.args.p_tarefeiro_id).toBe("u1");
  });
});
