import { describe, it, expect } from "vitest";
import {
  aggregateIndicadores,
  PENDENTE_ANTIGA_DIAS,
  type SugestaoRow,
  type FeedbackRow,
} from "@/lib/iaAssertividade";

// Q2-A3.1 — Correção de leitura dos indicadores da IA.
// Testes de lógica pura: base de aderência, volume, pendências e motivos.

const sug = (id: string, created_at: string, extra: Partial<SugestaoRow> = {}): SugestaoRow => ({
  id,
  created_at,
  status: "pendente",
  tratamentos_sugeridos_json: [],
  queixas_identificadas_json: [],
  ...extra,
});

const fb = (id: string, classificacao: string, motivo?: string | null): FeedbackRow => ({
  sugestao_ia_id: id,
  classificacao,
  atribuicao_final_json: [],
  motivo_ajuste: motivo ?? null,
});

const NOW = new Date("2026-07-06T00:00:00Z");
const diasAtras = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("Q2-A3.1 — base de aderência", () => {
  it("exclui 'sem uso' e 'inconclusiva' da base da taxa principal", () => {
    const sugestoes = ["s1", "s2", "s3", "s4", "s5"].map((id) => sug(id, diasAtras(1)));
    const feedbacks = [
      fb("s1", "acertou totalmente"),
      fb("s2", "acertou parcialmente"),
      fb("s3", "inadequada"),
      fb("s4", "sem uso"),
      fb("s5", "inconclusiva"),
    ];
    const r = aggregateIndicadores(sugestoes, feedbacks, NOW);
    // base = total + parcial + divergencia = 3 (exclui sem uso + inconclusiva)
    expect(r.baseAderencia).toBe(3);
    expect(r.taxaAderenciaTotal).toBe(Math.round((1 / 3) * 100));
    expect(r.taxaAderenciaParcial).toBe(Math.round((1 / 3) * 100));
    expect(r.taxaDivergencia).toBe(Math.round((1 / 3) * 100));
  });

  it("preserva os contadores de 'sem uso' e 'inconclusiva' fora da taxa principal", () => {
    const sugestoes = ["s1", "s2", "s3"].map((id) => sug(id, diasAtras(1)));
    const feedbacks = [
      fb("s1", "acertou totalmente"),
      fb("s2", "sem uso"),
      fb("s3", "inconclusiva"),
    ];
    const r = aggregateIndicadores(sugestoes, feedbacks, NOW);
    expect(r.semUso).toBe(1);
    expect(r.inconclusiva).toBe(1);
    expect(r.baseAderencia).toBe(1);
    expect(r.avaliadas).toBe(3); // total de feedbacks preservado
    expect(r.taxaAderenciaTotal).toBe(100); // 1/1 sobre a base
  });
});

describe("Q2-A3.1 — volume, pendências e motivos", () => {
  it("calcula o volume da amostra (avaliadas e base)", () => {
    const sugestoes = ["s1", "s2"].map((id) => sug(id, diasAtras(1)));
    const feedbacks = [fb("s1", "acertou totalmente")];
    const r = aggregateIndicadores(sugestoes, feedbacks, NOW);
    expect(r.totalSugestoes).toBe(2);
    expect(r.avaliadas).toBe(1);
    expect(r.pendentes).toBe(1);
    expect(r.baseAderencia).toBe(1);
  });

  it("identifica pendências e conta as antigas a partir de created_at", () => {
    const sugestoes = [
      sug("s1", diasAtras(PENDENTE_ANTIGA_DIAS + 5)), // antiga, pendente
      sug("s2", diasAtras(1)), // recente, pendente
      sug("s3", diasAtras(PENDENTE_ANTIGA_DIAS + 10)), // antiga, mas avaliada
    ];
    const feedbacks = [fb("s3", "acertou totalmente")];
    const r = aggregateIndicadores(sugestoes, feedbacks, NOW);
    expect(r.pendentes).toBe(2);
    expect(r.pendentesAntigas).toBe(1); // só s1 (s3 tem feedback)
  });

  it("agrega motivo_ajuste por CONTAGEM, sem expor texto sensível cru", () => {
    const sugestoes = ["s1", "s2", "s3"].map((id) => sug(id, diasAtras(1)));
    const feedbacks = [
      fb("s1", "inadequada", "Caso exigiu tratamento diferente"),
      fb("s2", "acertou parcialmente", "   "), // em branco → não conta
      fb("s3", "acertou totalmente", null),
    ];
    const r = aggregateIndicadores(sugestoes, feedbacks, NOW);
    expect(r.motivosPreenchidos).toBe(1);
    // Garante que o agregado não carrega o texto livre.
    expect(JSON.stringify(r)).not.toContain("Caso exigiu tratamento diferente");
  });
});

describe("Q2-A3.1 — bordas preservadas", () => {
  it("sem feedbacks: taxas em 0 e base 0 (comportamento anterior preservado)", () => {
    const sugestoes = ["s1", "s2"].map((id) => sug(id, diasAtras(1)));
    const r = aggregateIndicadores(sugestoes, [], NOW);
    expect(r.avaliadas).toBe(0);
    expect(r.baseAderencia).toBe(0);
    expect(r.taxaAderenciaTotal).toBe(0);
    expect(r.taxaDivergencia).toBe(0);
    expect(r.pendentes).toBe(2);
    expect(r.motivosPreenchidos).toBe(0);
  });

  it("amostra pequena não quebra o cálculo", () => {
    const r = aggregateIndicadores([sug("s1", diasAtras(1))], [fb("s1", "acertou totalmente")], NOW);
    expect(r.baseAderencia).toBe(1);
    expect(r.taxaAderenciaTotal).toBe(100);
  });
});
