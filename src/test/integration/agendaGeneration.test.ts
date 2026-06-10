import { describe, it, expect } from "vitest";
import { buildValidDesignacoes, generateSessionDates } from "@/lib/fazerEntrevista";

/**
 * Integration-style test for the interview -> treatment -> agenda pipeline.
 * Combines the pure helpers exactly as the real submission flow does and
 * asserts the generated real agenda is coherent (correct count, no duplicate
 * dates, weekday respected). This protects the "agenda real" source of truth.
 */
describe("Pipeline entrevista -> agenda real", () => {
  const tratamentoMap = {
    t1: { quantidade_padrao_sessoes: 4 },
    t2: { quantidade_padrao_sessoes: 6 },
  };

  it("gera a agenda real coerente a partir das designações válidas", () => {
    const designacoes = buildValidDesignacoes({ t1: "", t2: "3" }, tratamentoMap);
    expect(designacoes).toEqual([
      { tratamento_id: "t1", quantidade_total: 4 },
      { tratamento_id: "t2", quantidade_total: 3 },
    ]);

    const base = new Date("2026-06-10T12:00:00"); // Wednesday
    const agenda = designacoes.flatMap((d) =>
      generateSessionDates(base, 3, "19:00", 1, "semanas", d.quantidade_total).map((s) => ({
        tratamento_id: d.tratamento_id,
        ...s,
      })),
    );

    // total sessions == sum of quantities
    expect(agenda).toHaveLength(4 + 3);

    // no duplicate (treatment, date) pairs
    const keys = agenda.map((s) => `${s.tratamento_id}:${s.data_sessao}`);
    expect(new Set(keys).size).toBe(keys.length);

    // all sessions land on the configured weekday (Wednesday = day 3)
    for (const s of agenda) {
      expect(new Date(s.data_sessao + "T00:00:00").getDay()).toBe(3);
    }
  });

  it("ignora tratamentos sem quantidade efetiva (sem agenda infinita)", () => {
    const designacoes = buildValidDesignacoes({ unknown: "5" }, tratamentoMap);
    expect(designacoes).toEqual([]);
  });
});
