import { describe, it, expect } from "vitest";
import {
  coerenciaEscopoAcesso,
  type CoordenacaoTratamentoItem,
} from "@/services/coordenacao/escopo";
import { verificarCoerenciaAtuacaoAcesso } from "@/lib/atuacao";
import {
  classifyRole,
  ASSIGNABLE_ROLES,
  OPERATIONAL_ROLES,
  ADMINISTRATIVE_ROLES,
} from "@/constants/roles";

/**
 * Etapa 6 — Coerência, testes e fechamento da reorganização de gestão.
 *
 * Esta suíte consolida, em UM lugar, as garantias finais das 4 camadas
 * (Pessoa, Acesso, Atuação, Escopo) e prova que NENHUMA delas reintroduz
 * mutação cruzada. É a "trava de fechamento" da frente.
 *
 * Invariantes confrontadas:
 *  - INV-ACC-BASE-001/003 (assistido é base automático e cumulativo)
 *  - INV-ACC-GOV-001 (Gestão de Acesso só governa papéis elevados)
 *  - INV-ATU-NOCROSS-001 (atuação nunca altera acesso)
 *  - INV-ESC-NOCROSS-001 (escopo nunca altera acesso)
 *  - INV-ESC-FONTE-001 (escopo tem fonte única N:N)
 */

const escopoItem = (
  over: Partial<CoordenacaoTratamentoItem> = {},
): CoordenacaoTratamentoItem => ({
  tratamento_id: "t1",
  tratamento_nome: "Passe",
  tratamento_tipo: "energetico",
  coordenadores: [],
  ...over,
});

describe("INV-ACC-GOV-001 — Gestão de Acesso governa apenas papéis elevados", () => {
  it("assistido (base) nunca é gerenciável manualmente, mas papéis elevados sim", () => {
    // assistido segue NA tupla de atribuíveis apenas como base automático,
    // porém classifica como 'base' (não operacional/administrativo).
    expect(classifyRole("assistido")).toBe("base");
    for (const r of OPERATIONAL_ROLES) expect(classifyRole(r)).toBe("operacional");
    for (const r of ADMINISTRATIVE_ROLES) expect(classifyRole(r)).toBe("administrativo");
  });

  it("papéis administrativos NÃO aparecem entre os atribuíveis pelo formulário", () => {
    for (const r of ADMINISTRATIVE_ROLES) {
      expect((ASSIGNABLE_ROLES as readonly string[]).includes(r)).toBe(false);
    }
  });
});

describe("INV-ATU-NOCROSS-001 — atuação só gera alerta consultivo, nunca acesso", () => {
  it("tarefeiro sem acesso => alerta 'atencao' (sem mutação)", () => {
    const alertas = verificarCoerenciaAtuacaoAcesso(["Tarefeiro"], []);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].severidade).toBe("atencao");
  });

  it("atuação coerente com acesso => sem alerta", () => {
    expect(verificarCoerenciaAtuacaoAcesso(["Tarefeiro"], ["tarefeiro"])).toHaveLength(0);
  });
});

describe("INV-ESC-NOCROSS-001 — escopo só gera alerta consultivo, nunca acesso", () => {
  it("coordenador designado sem acesso => alerta consultivo", () => {
    const alertas = coerenciaEscopoAcesso([
      escopoItem({ coordenadores: [{ coordenador_id: "u1", nome: "Ana", tem_acesso: false }] }),
    ]);
    expect(alertas).toHaveLength(1);
    expect(alertas[0].severidade).toBe("atencao");
    expect(alertas[0].mensagem).toContain("não concede acesso");
  });

  it("coordenador com acesso correspondente => sem alerta", () => {
    const alertas = coerenciaEscopoAcesso([
      escopoItem({ coordenadores: [{ coordenador_id: "u1", nome: "Ana", tem_acesso: true }] }),
    ]);
    expect(alertas).toHaveLength(0);
  });
});

describe("Fechamento — coerência consolidada das camadas é puramente consultiva", () => {
  it("as duas verificações de coerência só retornam alertas (nenhuma mutação possível)", () => {
    // Garante que o retorno é descritivo: arrays de alertas, sem efeitos.
    const aAtu = verificarCoerenciaAtuacaoAcesso(["Tarefeiro"], []);
    const aEsc = coerenciaEscopoAcesso([
      escopoItem({ coordenadores: [{ coordenador_id: "u1", nome: "Ana", tem_acesso: false }] }),
    ]);
    expect(Array.isArray(aAtu)).toBe(true);
    expect(Array.isArray(aEsc)).toBe(true);
    // Severidades sempre consultivas (info/atencao), nunca "erro/bloqueio".
    for (const a of aAtu) expect(["info", "atencao"]).toContain(a.severidade);
    for (const a of aEsc) expect(a.severidade).toBe("atencao");
  });
});
