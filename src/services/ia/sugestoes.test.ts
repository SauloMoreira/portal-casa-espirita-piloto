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

import { recordDecisaoFinal } from "./sugestoes";

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

describe("recordDecisaoFinal — persistência da decisão humana", () => {
  it("grava feedback com classificação automática 'acertou totalmente'", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s1",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5)],
      atribuidos: [atr("a", "Passe", 5)],
    });

    expect(inserts).toHaveLength(1);
    const fb = inserts[0];
    expect(fb.table).toBe("ia_feedback");
    expect(fb.payload.sugestao_ia_id).toBe("s1");
    expect(fb.payload.avaliador_id).toBe("u1");
    expect(fb.payload.classificacao).toBe("acertou totalmente");
  });

  it("calcula diferenças e classifica 'acertou parcialmente' ao ajustar quantidade", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s2",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5), sug("b", "Água", 2)],
      atribuidos: [atr("a", "Passe", 8)],
    });

    const fb = inserts[0].payload;
    expect(fb.classificacao).toBe("acertou parcialmente");
    expect(fb.diferencas_json.alterados).toEqual([
      { tratamento_id: "a", nome: "Passe", de: 5, para: 8 },
    ]);
    expect(fb.diferencas_json.removidos.map((x: any) => x.tratamento_id)).toEqual(["b"]);
  });

  it("respeita classificação informada manualmente pelo humano", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s3",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5)],
      atribuidos: [atr("a", "Passe", 5)],
      classificacao: "inconclusiva",
      motivo: "Caso atípico",
      observacao: "Revisar depois",
    });

    const fb = inserts[0].payload;
    expect(fb.classificacao).toBe("inconclusiva");
    expect(fb.motivo_ajuste).toBe("Caso atípico");
    expect(fb.observacao).toBe("Revisar depois");
  });

  it("marca a sugestão como 'avaliada' após o feedback", async () => {
    await recordDecisaoFinal({
      sugestaoId: "s4",
      avaliadorId: "u1",
      sugeridos: [sug("a", "Passe", 5)],
      atribuidos: [atr("a", "Passe", 5)],
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("ia_sugestoes");
    expect(updates[0].payload.status).toBe("avaliada");
    expect(updates[0].eq).toEqual(["id", "s4"]);
  });
});
