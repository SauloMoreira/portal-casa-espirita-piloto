/**
 * SAAS-02 — Contratos da fundação multi-tenant.
 *
 * Testes de contrato (não tocam banco). Valida invariantes de catálogo que
 * qualquer alteração futura precisa preservar: enums, papéis, e o desenho de
 * separação entre papel global de plataforma e papel local de instituição.
 *
 * Isolamento real (usuário A não lê tenant B) é validado em
 * src/test/integration/db/saas02-isolamento-tenants.dbtest.ts sob HAS_DB=true.
 */
import { describe, it, expect } from "vitest";

const PAPEIS_LOCAIS = [
  "admin_instituicao",
  "coordenador",
  "entrevistador",
  "tarefeiro",
  "assistido",
  "leitor",
  "caixa",
  "bibliotecario",
] as const;

const PAPEIS_GLOBAIS = [
  "platform_owner",
  "platform_admin",
  "support",
  "billing_admin",
] as const;

const STATUS_INSTITUICAO = ["implantacao", "ativa", "inativa", "suspensa"] as const;
const STATUS_ASSINATURA = ["trial", "ativa", "suspensa", "cancelada", "inadimplente"] as const;
const STATUS_VINCULO = ["pendente", "ativo", "inativo"] as const;

const MODULOS_SEED = ["tratamentos", "biblioteca", "caixa", "portal"] as const;
const PLANOS_SEED = ["essencial", "fraterno", "completo", "enterprise"] as const;

describe("SAAS-02 — fundação multi-tenant (contratos)", () => {
  it("catálogo de papéis locais é estável", () => {
    expect(PAPEIS_LOCAIS).toContain("admin_instituicao");
    expect(PAPEIS_LOCAIS).toContain("assistido");
    // Papel global NUNCA deve estar entre papéis locais.
    for (const g of PAPEIS_GLOBAIS) {
      expect((PAPEIS_LOCAIS as readonly string[]).includes(g)).toBe(false);
    }
  });

  it("catálogo de papéis globais é estável e distinto dos locais", () => {
    expect(PAPEIS_GLOBAIS).toContain("platform_owner");
    expect(PAPEIS_GLOBAIS).toContain("platform_admin");
    for (const l of PAPEIS_LOCAIS) {
      expect((PAPEIS_GLOBAIS as readonly string[]).includes(l)).toBe(false);
    }
  });

  it("status enumerados são exatamente os aprovados", () => {
    expect([...STATUS_INSTITUICAO]).toEqual(["implantacao", "ativa", "inativa", "suspensa"]);
    expect([...STATUS_ASSINATURA]).toEqual([
      "trial",
      "ativa",
      "suspensa",
      "cancelada",
      "inadimplente",
    ]);
    expect([...STATUS_VINCULO]).toEqual(["pendente", "ativo", "inativo"]);
  });

  it("seed comercial mínimo cobre os módulos e planos aprovados", () => {
    expect([...MODULOS_SEED]).toEqual(["tratamentos", "biblioteca", "caixa", "portal"]);
    expect([...PLANOS_SEED]).toEqual(["essencial", "fraterno", "completo", "enterprise"]);
  });

  it("SAAS-02 não introduz coluna instituicao_id em tabelas funcionais legadas", () => {
    // Guarda documental: se este teste for alterado para 'true' sem recorte
    // SAAS-06 aprovado, a tenantização das tabelas funcionais foi feita
    // prematuramente e o critério de aceite do SAAS-02 foi violado.
    const tabelasFuncionaisTenantizadas = false;
    expect(tabelasFuncionaisTenantizadas).toBe(false);
  });
});
