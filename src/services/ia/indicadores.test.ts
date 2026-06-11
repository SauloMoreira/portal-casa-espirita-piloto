import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock do client supabase para validar a aplicação dos filtros de período.
const calls: Record<string, unknown> = {};

vi.mock("@/integrations/supabase/client", () => {
  const sugestoesData = [
    { id: "s1", created_at: "2026-01-10T10:00:00Z", status: "avaliada", tratamentos_sugeridos_json: [{ nome: "Passe" }], queixas_identificadas_json: [{ nome: "Ansiedade" }] },
  ];
  const feedbackData = [
    { sugestao_ia_id: "s1", classificacao: "acertou totalmente", atribuicao_final_json: [{ nome: "Passe" }] },
  ];

  const makeBuilder = (table: string) => {
    const state: { gte?: string; lte?: string; inIds?: string[] } = {};
    const builder: any = {
      select: () => builder,
      order: () => builder,
      gte: (_c: string, v: string) => { state.gte = v; return builder; },
      lte: (_c: string, v: string) => { state.lte = v; return builder; },
      in: (_c: string, ids: string[]) => { state.inIds = ids; return builder; },
      then: (resolve: (r: { data: unknown[] }) => void) => {
        calls[table] = state;
        if (table === "ia_sugestoes") return resolve({ data: sugestoesData });
        if (table === "ia_feedback") return resolve({ data: feedbackData });
        return resolve({ data: [] });
      },
    };
    return builder;
  };

  return {
    supabase: { from: (table: string) => makeBuilder(table) },
  };
});

import { fetchIndicadoresIA } from "./indicadores";

describe("fetchIndicadoresIA", () => {
  beforeEach(() => {
    for (const k of Object.keys(calls)) delete calls[k];
  });

  it("agrega indicadores reais a partir de sugestões e feedbacks", async () => {
    const res = await fetchIndicadoresIA();
    expect(res.totalSugestoes).toBe(1);
    expect(res.avaliadas).toBe(1);
    expect(res.aderenciaTotal).toBe(1);
    expect(res.taxaAderenciaTotal).toBe(100);
    expect(res.tratamentosMaisSugeridos[0]).toEqual({ nome: "Passe", total: 1 });
  });

  it("aplica o filtro de período nas sugestões", async () => {
    await fetchIndicadoresIA({ inicio: "2026-01-01", fim: "2026-01-31" });
    expect((calls.ia_sugestoes as any).gte).toBe("2026-01-01");
    expect((calls.ia_sugestoes as any).lte).toBe("2026-01-31T23:59:59.999Z");
  });

  it("restringe feedbacks às sugestões do período", async () => {
    await fetchIndicadoresIA({ inicio: "2026-01-01" });
    expect((calls.ia_feedback as any).inIds).toEqual(["s1"]);
  });
});
