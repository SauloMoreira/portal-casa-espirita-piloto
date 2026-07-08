import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-B0 — Central de Assinaturas e Controle Comercial Manual.
 *
 * Cobre em pattern-matching (mesmo padrão das outras suítes de governança):
 *  - Página PortalAssinaturas existe e é lazy-carregada em App.tsx;
 *  - Rota portalAssinaturas em ROUTES;
 *  - Guard duplo (isPlatformAdmin + <Navigate>);
 *  - usePortalHub bloqueia suspensa/cancelada/encerrada;
 *  - Enum estendido com "encerrada";
 *  - Migração cria enum saas_classificacao_comercial e trigger de validação;
 *  - Sem integração de gateway;
 *  - Projeto Tratamentos FER original intocado.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("SAAS-06-B0 — Página PortalAssinaturas", () => {
  const src = read("src/pages/PortalAssinaturas.tsx");

  it("existe como página do Portal", () => {
    expect(existsSync(resolve(root, "src/pages/PortalAssinaturas.tsx"))).toBe(true);
  });

  it("usa guard duplo isPlatformAdmin + <Navigate to portal>", () => {
    expect(src).toMatch(/usePortalHub/);
    expect(src).toMatch(/isPlatformAdmin/);
    expect(src).toMatch(/<Navigate to={ROUTES\.portal} replace/);
  });

  it("expõe todos os status controlados", () => {
    for (const s of [
      "trial",
      "ativa",
      "inadimplente",
      "suspensa",
      "cancelada",
      "encerrada",
    ]) {
      expect(src).toContain(`"${s}"`);
    }
  });

  it("expõe todas as classificações comerciais", () => {
    for (const c of ["demo", "piloto", "producao_assistida", "cliente_ativo"]) {
      expect(src).toContain(`"${c}"`);
    }
  });

  it("expõe todas as formas de pagamento manuais", () => {
    for (const f of ["pix", "boleto", "link_manual", "transferencia", "outro"]) {
      expect(src).toContain(`"${f}"`);
    }
  });

  it("não integra gateway de cobrança automática", () => {
    expect(src).not.toMatch(/stripe|paddle|mercadopago|mercado[-_ ]?pago/i);
  });

  it("edita instituições e assinaturas via supabase client (sem edge/rpc nova)", () => {
    expect(src).toMatch(/from\("assinaturas"\)/);
    expect(src).toMatch(/from\("instituicoes"\)/);
  });
});

describe("SAAS-06-B0 — Rota e navegação", () => {
  it("ROUTES.portalAssinaturas registrado", () => {
    const src = read("src/constants/routes.ts");
    expect(src).toMatch(/portalAssinaturas:\s*"\/portal\/admin\/assinaturas"/);
  });

  it("App.tsx registra a rota com lazy load", () => {
    const src = read("src/App.tsx");
    expect(src).toMatch(/PortalAssinaturas\s*=\s*lazy/);
    expect(src).toMatch(/ROUTES\.portalAssinaturas/);
  });

  it("PortalAdmin exibe link para a Central de Assinaturas", () => {
    const src = read("src/pages/PortalAdmin.tsx");
    expect(src).toMatch(/ROUTES\.portalAssinaturas/);
    expect(src).toMatch(/Central de Assinaturas/);
  });
});

describe("SAAS-06-B0 — Regras no usePortalHub", () => {
  const src = read("src/hooks/usePortalHub.ts");

  it("status 'encerrada' está no union de SaasAssinaturaStatus", () => {
    expect(src).toMatch(/"encerrada"/);
  });

  it("acessivel bloqueia suspensa, cancelada e encerrada", () => {
    expect(src).toMatch(/status !== "cancelada"/);
    expect(src).toMatch(/status !== "suspensa"/);
    expect(src).toMatch(/status !== "encerrada"/);
  });
});

describe("SAAS-06-B0 — Migração", () => {
  const dir = resolve(root, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const all = files.map((f) => read(`supabase/migrations/${f}`)).join("\n");

  it("adiciona 'encerrada' ao enum saas_assinatura_status", () => {
    expect(all).toMatch(/ADD VALUE 'encerrada'/);
  });

  it("cria enum saas_classificacao_comercial com os 4 valores", () => {
    expect(all).toMatch(/saas_classificacao_comercial/);
    for (const c of ["demo", "piloto", "producao_assistida", "cliente_ativo"]) {
      expect(all).toContain(`'${c}'`);
    }
  });

  it("adiciona campos comerciais em assinaturas", () => {
    for (const col of [
      "valor_mensal_cents",
      "forma_pagamento",
      "proximo_vencimento",
      "ultimo_pagamento_em",
      "observacoes_comerciais",
      "condicao_especial",
    ]) {
      expect(all).toContain(col);
    }
  });

  it("cria trigger de validação leve", () => {
    expect(all).toMatch(/saas_tg_valida_assinatura_comercial/);
    expect(all).toMatch(/tg_assinaturas_valida_comercial/);
  });

  it("concede UPDATE em assinaturas para authenticated (RLS mantém autorização)", () => {
    expect(all).toMatch(/GRANT\s+UPDATE.*ON\s+public\.assinaturas\s+TO\s+authenticated/);
  });

  it("não cria integração com gateway", () => {
    expect(all).not.toMatch(/stripe|paddle|mercadopago/i);
  });
});

describe("SAAS-06-B0 — Integridade do projeto FER original", () => {
  it("documento SAAS-06-B0 existe", () => {
    expect(existsSync(resolve(root, "docs/SAAS-06-B0-CENTRAL-ASSINATURAS.md"))).toBe(true);
  });

  it("documento reafirma que projeto Tratamentos FER original não é alterado", () => {
    const doc = read("docs/SAAS-06-B0-CENTRAL-ASSINATURAS.md");
    expect(doc).toMatch(/Tratamentos FER/);
    expect(doc).toMatch(/intocado|não migra|Nenhum ajuste/i);
  });
});
