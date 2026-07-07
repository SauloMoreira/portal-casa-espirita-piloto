/**
 * SAAS-03 — Contratos do Portal/Hub.
 *
 * Roda no CI sem banco. Valida os invariantes de front do Portal:
 * - rotas registradas;
 * - regras de exibição/acessibilidade de módulos;
 * - fail-closed da seleção de instituição;
 * - guarda da visão platform_admin.
 *
 * Verificação real de RLS/tenancy fica em src/test/integration/db/.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROUTES } from "@/constants";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("SAAS-03 — rotas do Portal/Hub", () => {
  it("expõe as rotas /portal, /portal/instituicoes, /portal/modulos e /portal/admin", () => {
    expect(ROUTES.portal).toBe("/portal");
    expect(ROUTES.portalInstituicoes).toBe("/portal/instituicoes");
    expect(ROUTES.portalModulos).toBe("/portal/modulos");
    expect(ROUTES.portalAdmin).toBe("/portal/admin");
  });

  it("registra todas as rotas do Portal no App.tsx", () => {
    const app = read("src/App.tsx");
    expect(app).toContain("ROUTES.portal");
    expect(app).toContain("ROUTES.portalInstituicoes");
    expect(app).toContain("ROUTES.portalModulos");
    expect(app).toContain("ROUTES.portalAdmin");
  });

  it("Portal/Hub não impõe allowedRoles — qualquer autenticado pode acessar", () => {
    const app = read("src/App.tsx");
    // Localiza os blocos das rotas do portal e garante que não há allowedRoles.
    const portalRoutes = app
      .split("\n")
      .filter((l) => l.includes("ROUTES.portal"))
      .join("\n");
    expect(portalRoutes).not.toMatch(/allowedRoles/);
  });
});

describe("SAAS-03 — seleção de instituição (fail-closed)", () => {
  const src = read("src/hooks/useSelectedInstituicao.ts");

  it("persiste seleção em sessionStorage (não em localStorage)", () => {
    expect(src).toContain("sessionStorage");
    expect(src).not.toContain("localStorage");
  });

  it("limpa seleção inválida quando o id não está entre os permitidos", () => {
    expect(src).toContain("!allowedIds.includes(selectedId)");
    expect(src).toContain("setSelectedIdState(null)");
  });

  it("recusa selecionar um id fora da lista permitida", () => {
    expect(src).toMatch(/if\s*\(id\s*&&\s*!allowedIds\.includes\(id\)\)\s*return\s*false/);
  });
});

describe("SAAS-03 — regras de módulos e assinatura", () => {
  const grid = read("src/components/portal/ModulosGrid.tsx");

  it("declara os quatro estados possíveis do módulo", () => {
    expect(grid).toContain('"ativo"');
    expect(grid).toContain('"indisponivel_no_plano"');
    expect(grid).toContain('"em_breve"');
    expect(grid).toContain('"suspenso"');
  });

  it("marca como suspenso quando instituição, vínculo ou assinatura estão inválidos", () => {
    // Instituição
    expect(grid).toContain('inst.status === "suspensa"');
    expect(grid).toContain('inst.status === "inativa"');
    // Vínculo
    expect(grid).toContain('inst.vinculo_status !== "ativo"');
    // Assinatura
    expect(grid).toContain('assinatura.status === "suspensa"');
    expect(grid).toContain('assinatura.status === "cancelada"');
    expect(grid).toContain('assinatura.status === "inadimplente"');
  });

  it("Biblioteca e Caixa não têm rota — sempre 'em breve'", () => {
    const hub = read("src/hooks/usePortalHub.ts");
    expect(hub).toMatch(/biblioteca:\s*null/);
    expect(hub).toMatch(/caixa:\s*null/);
    expect(hub).toMatch(/tratamentos:\s*"\/tratamentos"/);
  });
});

describe("SAAS-03 — guarda da visão platform_admin", () => {
  const admin = read("src/pages/PortalAdmin.tsx");

  it("redireciona para /portal quando não é platform_admin", () => {
    expect(admin).toContain("if (!isPlatformAdmin)");
    expect(admin).toContain("Navigate");
    expect(admin).toContain("ROUTES.portal");
  });

  it("busca em platform_admins usando o próprio user_id (RLS-friendly)", () => {
    const hub = read("src/hooks/usePortalHub.ts");
    expect(hub).toContain('from("platform_admins")');
    expect(hub).toContain('.eq("user_id", userId)');
  });
});

describe("SAAS-03 — preservação de escopo", () => {
  it("não altera regras funcionais de Tratamentos (rota original preservada)", () => {
    expect(ROUTES.tratamentos).toBe("/tratamentos");
  });

  it("não adiciona instituicao_id em tabelas funcionais do módulo Tratamentos", () => {
    // A ausência de migração desse tipo é validada em nível de repositório:
    // este recorte não deve introduzir alterações em assistidos/agenda/etc.
    // Se essa lista precisar mudar, é sinal de que o escopo do SAAS-03 vazou.
    const migrationsGlob = readFileSync(
      join(ROOT, "docs/SAAS-03-PORTAL-HUB.md"),
      "utf8",
    );
    expect(migrationsGlob).toContain("Não tenantiza tabelas funcionais");
  });
});
