import { describe, it, expect } from "vitest";
import {
  coerenciaEscopoAcesso,
  type CoordenacaoTratamentoItem,
} from "@/services/coordenacao/escopo";

/**
 * Etapa 5 — Escopo Operacional / Coordenação N:N.
 *
 * Invariantes de independência entre ESCOPO (coordenacao_tratamento) e
 * ACESSO (user_roles). O escopo nunca concede acesso; a coerência é apenas
 * consultiva.
 */

const item = (over: Partial<CoordenacaoTratamentoItem> = {}): CoordenacaoTratamentoItem => ({
  tratamento_id: "t1",
  tratamento_nome: "Passe",
  tratamento_tipo: "energetico",
  coordenadores: [],
  ...over,
});

describe("INV-ESC-NNN — coordenação modelada como N:N", () => {
  it("um tratamento pode ter múltiplos coordenadores", () => {
    const it1 = item({
      coordenadores: [
        { coordenador_id: "u1", nome: "Ana", tem_acesso: true },
        { coordenador_id: "u2", nome: "Bruno", tem_acesso: true },
      ],
    });
    expect(it1.coordenadores).toHaveLength(2);
  });
});

describe("INV-ESC-NOCROSS — escopo nunca concede acesso", () => {
  it("designado sem acesso gera alerta consultivo (atencao), não mutação", () => {
    const alertas = coerenciaEscopoAcesso([
      item({
        coordenadores: [{ coordenador_id: "u1", nome: "Ana", tem_acesso: false }],
      }),
    ]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0]).toMatchObject({
      tratamento_id: "t1",
      coordenador_id: "u1",
      severidade: "atencao",
    });
    expect(alertas[0].mensagem).toContain("não concede acesso");
  });

  it("não há alerta quando o acesso correspondente já existe", () => {
    const alertas = coerenciaEscopoAcesso([
      item({
        coordenadores: [{ coordenador_id: "u1", nome: "Ana", tem_acesso: true }],
      }),
    ]);
    expect(alertas).toHaveLength(0);
  });

  it("alertas independentes por coordenador no mesmo tratamento", () => {
    const alertas = coerenciaEscopoAcesso([
      item({
        coordenadores: [
          { coordenador_id: "u1", nome: "Ana", tem_acesso: true },
          { coordenador_id: "u2", nome: "Bruno", tem_acesso: false },
        ],
      }),
    ]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].coordenador_id).toBe("u2");
  });
});
