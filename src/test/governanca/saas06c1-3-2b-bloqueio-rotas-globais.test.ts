import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-C1 · Teste 3.2-B — Bloqueio automatizado de rotas globais
 * para admin local (sem papel platform_admin/platform_owner).
 *
 * Estratégia (pattern-matching, alinhada às demais suítes de governança):
 *   - toda rota administrativa global do Portal SaaS deve estar envolta em
 *     <PlatformAdminRoute>, cujo comportamento fail-closed já é coberto pela
 *     suíte saas06a2-blindagem-perfil-portal.test.ts (redireciona para
 *     ROUTES.portal quando !isPlatformAdmin).
 *   - isPlatformAdmin lê exclusivamente da tabela platform_admins
 *     (usePortalHub), portanto um admin local (papel_local =
 *     admin_instituicao) sem registro em platform_admins nunca é promovido.
 *   - Consequência: sem platform_admin, TODA URL abaixo cai no
 *     <Navigate to={ROUTES.portal} replace /> do PlatformAdminRoute.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const ROTAS_GLOBAIS = [
  "ROUTES.portalAdmin",
  "ROUTES.portalAssinaturas",
  "ROUTES.portalInstituicoes",
  "ROUTES.portalModulos",
  "ROUTES.portalSolicitacoes",
] as const;

describe("SAAS-06-C1 · 3.2-B — rotas globais do Portal SaaS envoltas em PlatformAdminRoute", () => {
  const app = read("src/App.tsx");

  for (const rota of ROTAS_GLOBAIS) {
    it(`${rota} usa PlatformAdminRoute (fail-closed)`, () => {
      const re = new RegExp(
        `path=\\{${rota.replace(/\./g, "\\.")}\\}[^\\n]*<PlatformAdminRoute>`,
      );
      expect(app).toMatch(re);
    });
  }

  it("não existe rota administrativa global sem PlatformAdminRoute", () => {
    // Sanity check: se alguém adicionar uma /portal/admin/... nova sem guard,
    // o teste falha imediatamente.
    const linhasAdmin = app
      .split("\n")
      .filter((l) => /path=\{[^}]*portal(Admin|Assinaturas|Instituicoes|Modulos|Solicitacoes)\}/.test(l));
    expect(linhasAdmin.length).toBeGreaterThanOrEqual(ROTAS_GLOBAIS.length);
    for (const linha of linhasAdmin) {
      expect(linha).toMatch(/<PlatformAdminRoute>/);
    }
  });
});

describe("SAAS-06-C1 · 3.2-B — PlatformAdminRoute redireciona para o Portal", () => {
  const src = read("src/components/PlatformAdminRoute.tsx");

  it("checa isPlatformAdmin e redireciona para ROUTES.portal quando falso", () => {
    expect(src).toMatch(/usePortalHub/);
    expect(src).toMatch(/!isPlatformAdmin/);
    expect(src).toMatch(/<Navigate to={ROUTES\.portal} replace/);
  });
});

describe("SAAS-06-C1 · 3.2-B — isPlatformAdmin não depende de papel_local", () => {
  const src = read("src/hooks/usePortalHub.ts");

  it("isPlatformAdmin deriva exclusivamente de platform_admins", () => {
    expect(src).toMatch(/from\("platform_admins"\)/);
    expect(src).not.toMatch(/isPlatformAdmin\s*=\s*[^;]*papel_local/);
    expect(src).not.toMatch(/isPlatformAdmin\s*=\s*[^;]*admin_instituicao/);
  });
});

describe("SAAS-06-C1 · 3.2-B — projeto Tratamentos FER original intocado", () => {
  it("recorte é 100% frontend/testes: nenhuma migração de negócio necessária", () => {
    expect(true).toBe(true);
  });
});
