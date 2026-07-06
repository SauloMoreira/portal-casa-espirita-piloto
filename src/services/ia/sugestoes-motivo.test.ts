import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IaTratamentoSugerido, IaTratamentoAtribuido } from "@/types/ia";

// --- Mock do cliente Supabase (encadeável) ----------------------------------
const inserts: Array<{ table: string; payload: any }> = [];
const updates: Array<{ table: string; payload: any; eq: [string, string] | null }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: any) => {
        inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
      update: (payload: any) => {
        const rec = { table, payload, eq: null as [string, string] | null };
        updates.push(rec);
        return {
          eq: (col: string, val: string) => {
            rec.eq = [col, val];
            return Promise.resolve({ error: null });
          },
        };
      },
    }),
  },
}));

import { recordDecisaoFinal } from "@/services/ia/sugestoes";

const sug = (id: string, nome: string, q: number): IaTratamentoSugerido => ({
  tratamento_id: id,
  nome,
  quantidade: q,
});
const atr = (id: string, nome: string, q: number): IaTratamentoAtribuido => ({
  tratamento_id: id,
  nome,
  quantidade: q,
});

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
});

describe("Q2-A2.1 — Registro opcional de rejeição/ajuste da sugestão IA", () => {
  it("comportamento atual por diff permanece: classificação automática sem motivo", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s1",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5)],
      atribuidos: [atr("a", "Passe", 5)],
    });
    const fb = inserts[0].payload;
    expect(fb.classificacao).toBe("acertou totalmente");
    expect(fb.motivo_ajuste).toBeNull();
  });

  it("ausência de motivo (null) preserva o comportamento atual", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s2",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5)],
      atribuidos: [atr("a", "Passe", 8)],
      motivo: null,
    });
    const fb = inserts[0].payload;
    // classificação continua vindo do diff (não sobrescrita)
    expect(fb.classificacao).toBe("acertou parcialmente");
    expect(fb.motivo_ajuste).toBeNull();
  });

  it("rejeição/ajuste explícito opcional grava ia_feedback com motivo_ajuste", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s3",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5)],
      atribuidos: [atr("b", "Água", 3)],
      motivo: "Caso exigiu tratamento diferente do sugerido",
    });
    const fb = inserts[0].payload;
    expect(inserts[0].table).toBe("ia_feedback");
    expect(fb.motivo_ajuste).toBe("Caso exigiu tratamento diferente do sugerido");
    // A classificação continua sendo derivada por diff, não pelo motivo.
    expect(fb.classificacao).toBe("inadequada");
  });

  it("motivo informado NÃO sobrescreve a classificação por diff", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s4",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5)],
      atribuidos: [atr("a", "Passe", 5)],
      motivo: "Anotação livre do entrevistador",
    });
    const fb = inserts[0].payload;
    expect(fb.classificacao).toBe("acertou totalmente");
    expect(fb.motivo_ajuste).toBe("Anotação livre do entrevistador");
  });

  it("ia_sugestoes.status continua indo de pendente para 'avaliada' após a decisão", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s5",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5)],
      atribuidos: [atr("a", "Passe", 6)],
      motivo: "Ajuste de quantidade",
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("ia_sugestoes");
    expect(updates[0].payload.status).toBe("avaliada");
    expect(updates[0].eq).toEqual(["id", "s5"]);
  });

  it("não cria atribuição automática de tratamento (só grava feedback + status)", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s6",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5)],
      atribuidos: [atr("a", "Passe", 5)],
    });
    // Nenhum insert em assistido_tratamentos / agenda; apenas ia_feedback.
    expect(inserts.map((i) => i.table)).toEqual(["ia_feedback"]);
    expect(updates.map((u) => u.table)).toEqual(["ia_sugestoes"]);
  });
});
