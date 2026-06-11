import { describe, it, expect, vi, beforeEach } from "vitest";

// Captura os argumentos passados para a RPC e devolve um payload controlado.
let lastRpc: { fn: string; args: Record<string, unknown> } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      lastRpc = { fn, args };
      return Promise.resolve({
        data: {
          registros: 3,
          totais: { total: 30, presencas: 24, ausencias: 6 },
          rows: [
            { nome: "Ana", tratamento: "Passe", presencas: 8, ausencias: 2, total: 10, percentual: 80 },
          ],
        },
        error: null,
      });
    },
  },
}));

import { fetchFrequenciaPresenca, fetchFrequenciaParaExport, EXPORT_PAGE_SIZE } from "./frequencia";

const filtros = {
  dataInicio: "2025-01-01",
  dataFim: "2025-02-01",
  tratamentoId: "todos",
  assistidoId: "a1",
  tarefeiroId: "todos",
  coordenadorId: "c1",
};

describe("fetchFrequenciaPresenca", () => {
  beforeEach(() => { lastRpc = null; });

  it("mapeia filtros 'todos' para null e envia paginação", async () => {
    await fetchFrequenciaPresenca(filtros, { page: 2, pageSize: 50 });
    expect(lastRpc?.fn).toBe("relatorio_frequencia_presenca");
    expect(lastRpc?.args).toMatchObject({
      p_data_inicio: "2025-01-01",
      p_data_fim: "2025-02-01",
      p_tratamento_id: null,
      p_assistido_id: "a1",
      p_tarefeiro_id: null,
      p_coordenador_id: "c1",
      p_page: 2,
      p_page_size: 50,
    });
  });

  it("retorna totais e linhas tipadas (count real)", async () => {
    const res = await fetchFrequenciaPresenca(filtros, { page: 1, pageSize: 25 });
    expect(res.registros).toBe(3);
    expect(res.totais).toEqual({ total: 30, presencas: 24, ausencias: 6 });
    expect(res.rows[0].percentual).toBe(80);
  });

  it("exportação usa o mesmo filtro com page size amplo", async () => {
    await fetchFrequenciaParaExport(filtros);
    expect(lastRpc?.args.p_page).toBe(1);
    expect(lastRpc?.args.p_page_size).toBe(EXPORT_PAGE_SIZE);
    expect(lastRpc?.args.p_assistido_id).toBe("a1");
  });
});
