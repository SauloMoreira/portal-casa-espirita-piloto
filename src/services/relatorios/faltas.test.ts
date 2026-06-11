import { describe, it, expect, vi, beforeEach } from "vitest";

let lastRpc: { fn: string; args: Record<string, unknown> } | null = null;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      lastRpc = { fn, args };
      return Promise.resolve({
        data: {
          registros: 2,
          totais: { total_faltas: 14, assistidos_com_falta: 2, pct_medio: 33, vinculos_com_falta: 2 },
          rows: [
            { assistido: "Bruno", tratamento: "Passe", total_faltas: 9, datas: ["2025-05-09", "2025-05-16"], total_sessoes: 24, percentual: 38 },
          ],
        },
        error: null,
      });
    },
  },
}));

import { fetchFaltasPorPeriodo, fetchFaltasParaExport } from "./faltas";
import { EXPORT_PAGE_SIZE } from "./frequencia";

const filtros = {
  dataInicio: "2025-05-01",
  dataFim: "2025-06-01",
  tratamentoId: "t1",
  assistidoId: "todos",
  tarefeiroId: "todos",
  coordenadorId: "todos",
};

describe("fetchFaltasPorPeriodo", () => {
  beforeEach(() => { lastRpc = null; });

  it("envia filtros normalizados e paginação", async () => {
    await fetchFaltasPorPeriodo(filtros, { page: 1, pageSize: 25 });
    expect(lastRpc?.fn).toBe("relatorio_faltas_periodo");
    expect(lastRpc?.args).toMatchObject({
      p_tratamento_id: "t1",
      p_assistido_id: null,
      p_tarefeiro_id: null,
      p_coordenador_id: null,
      p_page: 1,
      p_page_size: 25,
    });
  });

  it("mapeia totais e linhas (datas e percentuais)", async () => {
    const res = await fetchFaltasPorPeriodo(filtros, { page: 1, pageSize: 25 });
    expect(res.registros).toBe(2);
    expect(res.totais).toEqual({ totalFaltas: 14, assistidosComFalta: 2, pctMedio: 33, vinculosComFalta: 2 });
    expect(res.rows[0].datasFaltas).toEqual(["2025-05-09", "2025-05-16"]);
    expect(res.rows[0].percentual).toBe(38);
  });

  it("exportação respeita filtros e usa page size amplo", async () => {
    await fetchFaltasParaExport(filtros);
    expect(lastRpc?.args.p_page_size).toBe(EXPORT_PAGE_SIZE);
    expect(lastRpc?.args.p_tratamento_id).toBe("t1");
  });
});
