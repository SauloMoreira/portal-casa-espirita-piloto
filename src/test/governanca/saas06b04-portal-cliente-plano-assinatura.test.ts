import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-B0.4 — Portal do Cliente: Plano, Assinatura, Módulos e Solicitações.
 *
 * Pattern-matching sobre migração + UI + doc para garantir:
 *  - tabela solicitacoes_comerciais com RLS que separa admin local de platform_admin;
 *  - página do admin local que consulta plano e módulos, mas NÃO altera diretamente;
 *  - página do platform_admin que gerencia status das solicitações;
 *  - sidebar e rotas registradas;
 *  - documento SAAS-06-B0.4 presente e completo.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

function migrations(): string {
  const dir = resolve(root, "supabase/migrations");
  if (!existsSync(dir)) return "";
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(resolve(dir, f), "utf8"))
    .join("\n---\n");
}

describe("SAAS-06-B0.4 — migração", () => {
  const sql = migrations();

  it("cria tabela solicitacoes_comerciais", () => {
    expect(sql).toMatch(
      /CREATE TABLE IF NOT EXISTS public\.solicitacoes_comerciais/,
    );
  });

  it("tipos e status esperados", () => {
    expect(sql).toMatch(/novo_modulo/);
    expect(sql).toMatch(/desabilitar_modulo/);
    expect(sql).toMatch(/alterar_plano/);
    expect(sql).toMatch(/segunda_via_cobranca/);
    expect(sql).toMatch(/cancelamento/);
    expect(sql).toMatch(/contato_comercial/);
    expect(sql).toMatch(/pendente/);
    expect(sql).toMatch(/em_analise/);
    expect(sql).toMatch(/aguardando_pagamento/);
    expect(sql).toMatch(/aprovada/);
    expect(sql).toMatch(/recusada/);
    expect(sql).toMatch(/concluida/);
  });

  it("ativa RLS e adiciona GRANT para authenticated", () => {
    expect(sql).toMatch(
      /ALTER TABLE public\.solicitacoes_comerciais ENABLE ROW LEVEL SECURITY/,
    );
    expect(sql).toMatch(
      /GRANT[^;]+ON public\.solicitacoes_comerciais[^;]+authenticated/,
    );
  });

  it("policy de SELECT combina platform_admin e admin_instituicao", () => {
    expect(sql).toMatch(/solicitacoes_comerciais_select/);
    expect(sql).toMatch(/fn_is_platform_admin/);
    expect(sql).toMatch(/fn_is_admin_instituicao/);
  });

  it("UPDATE restrito a platform_admin (admin local não altera)", () => {
    expect(sql).toMatch(/solicitacoes_comerciais_update_platform/);
    expect(sql).toMatch(
      /FOR UPDATE[\s\S]{0,120}fn_is_platform_admin\(auth\.uid\(\)\)/,
    );
  });

  it("assinatura ganha classificacao e observacoes_cliente", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS classificacao/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS observacoes_cliente/);
    expect(sql).toMatch(/producao_assistida/);
  });
});

describe("SAAS-06-B0.4 — UI admin local", () => {
  const page = read("src/pages/PortalPlanoAssinatura.tsx");

  it("página existe e expõe módulos comerciais oficiais", () => {
    expect(page).toMatch(/Tratamentos/);
    expect(page).toMatch(/Caixa \/ Cantina/);
    expect(page).toMatch(/Biblioteca/);
    expect(page).toMatch(/Portal Institucional/);
    expect(page).toMatch(/Financeiro/);
  });

  it("declara cobrança manual e ausência de gateway", () => {
    expect(page).toMatch(/Cobrança manual/);
  });

  it("admin local NÃO altera plano/status/módulos diretamente — só solicita", () => {
    // Não deve chamar update em assinaturas / assinatura_modulos.
    expect(page).not.toMatch(/from\(["']assinaturas["']\)[\s\S]{0,80}\.update\(/);
    expect(page).not.toMatch(
      /from\(["']assinatura_modulos["']\)[\s\S]{0,80}\.(update|upsert|insert|delete)\(/,
    );
    // Deve haver inserção em solicitacoes_comerciais.
    expect(page).toMatch(
      /from\(["']solicitacoes_comerciais["']\)[\s\S]{0,80}\.insert\(/,
    );
  });

  it("bloqueia perfis sem admin_instituicao / platform_admin", () => {
    expect(page).toMatch(/podeAcessar/);
    expect(page).toMatch(/admin_instituicao/);
    expect(page).toMatch(/isPlatformAdmin/);
    expect(page).toMatch(/Navigate to=\{ROUTES\.portal\}/);
  });
});

describe("SAAS-06-B0.4 — UI platform_admin", () => {
  const page = read("src/pages/PortalSolicitacoesComerciais.tsx");

  it("página existe e filtra por instituição e status", () => {
    expect(page).toMatch(/filtroInst/);
    expect(page).toMatch(/filtroStatus/);
  });

  it("permite alterar status e observação interna", () => {
    expect(page).toMatch(/observacao_interna/);
    expect(page).toMatch(/\.update\(/);
  });

  it("guarda platform_admin via PlatformAdminRoute + isPlatformAdmin", () => {
    expect(page).toMatch(/isPlatformAdmin/);
  });

  it("deixa explícito que aprovar NÃO habilita módulo", () => {
    expect(page).toMatch(/não habilita módulo/i);
  });
});

describe("SAAS-06-B0.4 — rotas e navegação", () => {
  const app = read("src/App.tsx");
  const routes = read("src/constants/routes.ts");
  const sidebar = read("src/components/AppSidebar.tsx");

  it("routes.ts declara as novas rotas", () => {
    expect(routes).toMatch(/portalPlanoAssinatura:\s*"\/portal\/plano-assinatura"/);
    expect(routes).toMatch(/portalSolicitacoes:\s*"\/portal\/admin\/solicitacoes"/);
  });

  it("App.tsx registra ambas as rotas", () => {
    expect(app).toMatch(/ROUTES\.portalPlanoAssinatura/);
    expect(app).toMatch(/ROUTES\.portalSolicitacoes/);
    expect(app).toMatch(/PortalPlanoAssinatura/);
    expect(app).toMatch(/PortalSolicitacoesComerciais/);
    // Solicitações protegidas por PlatformAdminRoute.
    expect(app).toMatch(
      /portalSolicitacoes[\s\S]{0,200}PlatformAdminRoute/,
    );
  });

  it("sidebar tem item Plano e Assinatura", () => {
    expect(sidebar).toMatch(/Plano e Assinatura/);
    expect(sidebar).toMatch(/\/portal\/plano-assinatura/);
  });
});

describe("SAAS-06-B0.4 — documentação", () => {
  const doc = read("docs/SAAS-06-B0.4-PORTAL-CLIENTE-PLANO-ASSINATURA.md");

  it("cobre seções obrigatórias", () => {
    for (const secao of [
      "admin local",
      "platform_admin",
      "módulos",
      "solicitações",
      "cobrança manual",
      "documentos",
      "testes",
      "gateway",
    ]) {
      expect(doc.toLowerCase()).toContain(secao.toLowerCase());
    }
  });

  it("registra que aprovar não habilita módulo automaticamente", () => {
    expect(doc.toLowerCase()).toMatch(/não habilita.*automaticamente/i);
  });

  it("cita módulos comerciais oficiais", () => {
    for (const m of [
      "Tratamentos",
      "Caixa",
      "Biblioteca",
      "Portal Institucional",
      "Financeiro",
    ]) {
      expect(doc).toContain(m);
    }
  });
});
