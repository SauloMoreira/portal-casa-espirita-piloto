import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-C1-FIX03 — Ajuste visual da área Solicitações comerciais no
 * Plano e Assinatura e padronização do label de módulo.
 *
 * Regras validadas por pattern-matching:
 *  - módulo "caixa" aparece com label comercial "Caixa / Cantina" na listagem;
 *  - status "Pendente" continua sendo renderizado;
 *  - criação de solicitação insere em solicitacoes_comerciais e NÃO altera
 *    assinatura_modulos/assinaturas (não habilita módulo automaticamente);
 *  - container da página tem padding-bottom adequado para não colidir com o
 *    botão flutuante "Fale Conosco";
 *  - documento SAAS-06-C1 registra a nota FIX03.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("SAAS-06-C1-FIX03 — UI de Solicitações comerciais", () => {
  const page = read("src/pages/PortalPlanoAssinatura.tsx");

  it("exibe label comercial 'Caixa / Cantina' para módulo caixa", () => {
    // A função de lookup deve existir e apontar para o label oficial.
    expect(page).toMatch(/labelModuloComercial/);
    expect(page).toMatch(/LABEL_MODULO_COMERCIAL\[codigo\]/);
    expect(page).toMatch(/Caixa \/ Cantina/);
    // A célula da tabela deve chamar a função de label, não exibir raw.
    expect(page).toMatch(/\{labelModuloComercial\(s\.modulo_codigo\)\}/);
  });

  it("não renderiza raw 'caixa' na célula de módulo", () => {
    expect(page).not.toMatch(/\{s\.modulo_codigo \?\? "—"\}/);
    expect(page).not.toMatch(/\{s\.modulo_codigo\}/);
  });

  it("mantém status Pendente visível na listagem", () => {
    expect(page).toMatch(/STATUS_SOLICITACAO_LABEL\[s\.status\]/);
    expect(page).toMatch(/pendente/);
  });

  it("não habilita/desabilita módulos automaticamente ao criar solicitação", () => {
    // Admin local só insere em solicitacoes_comerciais; nunca altera
    // assinatura_modulos ou assinaturas na mesma tela.
    expect(page).not.toMatch(
      /from\(["']assinatura_modulos["']\)[\s\S]{0,120}\.(update|upsert|insert|delete)\(/,
    );
    expect(page).not.toMatch(
      /from\(["']assinaturas["']\)[\s\S]{0,80}\.update\(/,
    );
    expect(page).toMatch(
      /from\(["']solicitacoes_comerciais["']\)[\s\S]{0,80}\.insert\(/,
    );
  });

  it("adiciona padding-bottom no container para evitar o botão flutuante", () => {
    // O botão flutuante fica em bottom-20 (mobile) / bottom-6 (desktop) com h-14.
    // O container principal deve reservar espaço extra.
    expect(page).toMatch(/space-y-6 pb-24 sm:pb-16/);
  });

  it("módulos comerciais oficiais estão centralizados no componente", () => {
    for (const nome of [
      "Tratamentos",
      "Caixa / Cantina",
      "Biblioteca",
      "Portal Institucional",
      "Financeiro",
    ]) {
      expect(page).toContain(nome);
    }
  });
});

describe("SAAS-06-C1-FIX03 — widget flutuante", () => {
  const widget = read("src/components/FaleConoscoButton.tsx");

  it("botão flutuante usa posicionamento fixo conhecido", () => {
    expect(widget).toMatch(/fixed z-50/);
    expect(widget).toMatch(/right-4 bottom-20 sm:bottom-6/);
  });

  it("página reserva espaço suficiente para o widget em mobile", () => {
    const page = read("src/pages/PortalPlanoAssinatura.tsx");
    expect(page).toMatch(/pb-24/);
  });
});

describe("SAAS-06-C1-FIX03 — escopo e segurança", () => {
  const page = read("src/pages/PortalPlanoAssinatura.tsx");

  it("não altera RLS, permissões, assinatura, plano ou fluxo de cobrança", () => {
    // A página não deve conter chamadas de DDL/RLS ou mutação de assinatura.
    expect(page).not.toMatch(/CREATE POLICY/);
    expect(page).not.toMatch(/ALTER TABLE/);
    expect(page).not.toMatch(/GRANT /);
  });
});

describe("SAAS-06-C1-FIX03 — documentação", () => {
  const doc = read("docs/SAAS-06-C1-HOMOLOGACAO-FUNCIONAL-FER-PILOTO.md");

  it("registra a nota FIX03", () => {
    expect(doc).toMatch(
      /FIX03 — Ajuste visual da área Solicitações comerciais e padronização do label de módulo/,
    );
  });

  it("nota FIX03 menciona label comercial 'Caixa / Cantina'", () => {
    expect(doc).toMatch(/Caixa \/ Cantina/);
  });

  it("mantém declaração de projeto Tratamentos FER original intocado", () => {
    expect(doc).toMatch(/Tratamentos FER original[^\n]*intocado/i);
  });
});
