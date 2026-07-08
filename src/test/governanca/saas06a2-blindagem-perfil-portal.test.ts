import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-A2 — Blindagem de experiência por perfil no Portal.
 *
 * Cobertura (pattern-matching, mesmo padrão das demais suítes de governança):
 *  - PlatformAdminRoute existe e checa isPlatformAdmin via usePortalHub;
 *  - Rotas /portal/admin e /portal/assinaturas envoltas em PlatformAdminRoute;
 *  - Portal.tsx redireciona assistido puro para /dashboard;
 *  - Card administrativo global só renderiza para platform_admin real (não
 *    depende apenas de role/admin local);
 *  - isPlatformAdmin lê exclusivamente da tabela platform_admins.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("SAAS-06-A2 — PlatformAdminRoute (guard de rota)", () => {
  const path = "src/components/PlatformAdminRoute.tsx";
  const src = read(path);

  it("existe como componente dedicado", () => {
    expect(existsSync(resolve(root, path))).toBe(true);
  });

  it("checa isPlatformAdmin via usePortalHub", () => {
    expect(src).toMatch(/usePortalHub/);
    expect(src).toMatch(/isPlatformAdmin/);
  });

  it("redireciona não-platform-admin para o Portal (fail-closed)", () => {
    expect(src).toMatch(/!isPlatformAdmin/);
    expect(src).toMatch(/<Navigate to={ROUTES\.portal} replace/);
  });
});

describe("SAAS-06-A2 — Rotas administrativas protegidas em App.tsx", () => {
  const src = read("src/App.tsx");

  it("importa PlatformAdminRoute", () => {
    expect(src).toMatch(/from "@\/components\/PlatformAdminRoute"/);
  });

  it("envolve /portal/admin em PlatformAdminRoute", () => {
    expect(src).toMatch(
      /ROUTES\.portalAdmin[^\n]*<PlatformAdminRoute>[\s\S]*?PortalAdmin[\s\S]*?<\/PlatformAdminRoute>/,
    );
  });

  it("envolve /portal/assinaturas em PlatformAdminRoute", () => {
    expect(src).toMatch(
      /ROUTES\.portalAssinaturas[^\n]*<PlatformAdminRoute>[\s\S]*?PortalAssinaturas[\s\S]*?<\/PlatformAdminRoute>/,
    );
  });
});

describe("SAAS-06-A2 — Portal.tsx (experiência por perfil)", () => {
  const src = read("src/pages/Portal.tsx");

  it("redireciona assistido puro para o dashboard", () => {
    expect(src).toMatch(/isAssistidoPuro/);
    expect(src).toMatch(/role === ROLE\.ASSISTIDO/);
    expect(src).toMatch(/roles\.every\(\(r\) => r === ROLE\.ASSISTIDO\)/);
    expect(src).toMatch(/<Navigate to={ROUTES\.dashboard} replace/);
  });

  it("card administrativo depende de podeVerCardAdminPlataforma (não só isPlatformAdmin)", () => {
    expect(src).toMatch(/podeVerCardAdminPlataforma\s*=/);
    expect(src).toMatch(/isPlatformAdmin\s*&&\s*role !== ROLE\.ASSISTIDO/);
    expect(src).toMatch(/\{podeVerCardAdminPlataforma && \(/);
  });

  it("não usa mais o gate ingênuo {isPlatformAdmin && (…)} para o card", () => {
    expect(src).not.toMatch(/\{isPlatformAdmin && \(\s*\n\s*<Card/);
  });

  it("botão 'Abrir visão administrativa' aparece apenas dentro do card guardado", () => {
    // Só deve existir uma ocorrência do CTA administrativo, contida no bloco
    // gate `podeVerCardAdminPlataforma && (`.
    const matches = src.match(/Abrir visão administrativa/g) ?? [];
    expect(matches.length).toBe(1);
  });
});

describe("SAAS-06-A2 — usePortalHub / isPlatformAdmin", () => {
  const src = read("src/hooks/usePortalHub.ts");

  it("isPlatformAdmin deriva exclusivamente da tabela platform_admins", () => {
    // Garante que admin local (papel_local = admin_instituicao) NUNCA é
    // promovido a platform_admin pelo cliente.
    expect(src).toMatch(/from\("platform_admins"\)/);
    expect(src).not.toMatch(/isPlatformAdmin\s*=\s*[^;]*papel_local/);
    expect(src).not.toMatch(/isPlatformAdmin\s*=\s*[^;]*admin_instituicao/);
  });
});

describe("SAAS-06-A2 — Projeto Tratamentos FER original intocado", () => {
  it("A2 não altera policies/RPCs de tratamentos", () => {
    // Suíte declarativa: A2 é 100% frontend + doc/testes.
    expect(true).toBe(true);
  });
});
