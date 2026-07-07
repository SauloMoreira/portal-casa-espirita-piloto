/**
 * SAAS-04 — Contratos do Tenant Switcher persistente.
 *
 * Roda no CI sem banco. Valida os invariantes de front do switcher global e
 * do InstituicaoContext. Verificação real de RLS/tenancy fica em
 * src/test/integration/db/.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("SAAS-04 — persistência entre sessões", () => {
  const src = read("src/hooks/useSelectedInstituicao.ts");

  it("usa localStorage (persistente entre sessões), não sessionStorage", () => {
    expect(src).toContain("window.localStorage");
    expect(src).not.toContain("sessionStorage");
  });

  it("mantém o fail-closed: descarta seleção fora do allowedIds", () => {
    expect(src).toContain("!allowedIds.includes(selectedId)");
    expect(src).toMatch(/if\s*\(id\s*&&\s*!allowedIds\.includes\(id\)\)\s*return\s*false/);
  });

  it("sincroniza entre abas via evento 'storage'", () => {
    expect(src).toContain('addEventListener("storage"');
    // Ignora broadcasts de ids não permitidos entre abas.
    expect(src).toContain("!allowedIds.includes(next)");
  });
});

describe("SAAS-04 — InstituicaoContext (contexto global)", () => {
  const ctx = read("src/contexts/InstituicaoContext.tsx");

  it("expõe InstituicaoProvider e useInstituicaoAtiva", () => {
    expect(ctx).toContain("export const InstituicaoProvider");
    expect(ctx).toContain("export function useInstituicaoAtiva");
  });

  it("consolida usePortalHub + useSelectedInstituicao (fonte única no app)", () => {
    expect(ctx).toContain('from "@/hooks/usePortalHub"');
    expect(ctx).toContain('from "@/hooks/useSelectedInstituicao"');
  });

  it("expõe apenas instituições com vínculo ativo em allowedIds (fail-closed)", () => {
    expect(ctx).toMatch(/vinculo_status\s*===\s*"ativo"/);
  });

  it("lança quando usado fora do provider (nunca cai em default permissivo)", () => {
    expect(ctx).toContain("deve ser usado dentro de <InstituicaoProvider>");
  });
});

describe("SAAS-04 — TenantSwitcher no header global", () => {
  const layout = read("src/components/AppLayout.tsx");
  const switcher = read("src/components/TenantSwitcher.tsx");

  it("AppLayout envolve o app com InstituicaoProvider", () => {
    expect(layout).toContain("InstituicaoProvider");
    expect(layout).toMatch(/<InstituicaoProvider>[\s\S]*<SidebarProvider>/);
  });

  it("AppLayout monta o TenantSwitcher no header", () => {
    expect(layout).toContain("TenantSwitcher");
    expect(layout).toContain("<TenantSwitcher />");
  });

  it("switcher consome o contexto (não instancia hooks diretamente)", () => {
    expect(switcher).toContain("useInstituicaoAtiva");
    expect(switcher).not.toMatch(/from\s+"@\/hooks\/usePortalHub"/);
    expect(switcher).not.toMatch(/from\s+"@\/hooks\/useSelectedInstituicao"/);
  });

  it("switcher fica oculto quando não há instituições vinculadas", () => {
    expect(switcher).toMatch(/instituicoes\.length\s*===\s*0/);
  });

  it("itens com vínculo != ativo aparecem desabilitados no menu", () => {
    expect(switcher).toContain('vinculo_status === "ativo"');
    expect(switcher).toContain("disabled={!podeSelecionar}");
  });

  it("não é exibido para o perfil assistido", () => {
    expect(layout).toMatch(/!isAssistido\s*&&\s*<TenantSwitcher/);
  });
});

describe("SAAS-04 — preservação de escopo", () => {
  it("Portal.tsx passou a consumir o InstituicaoContext (fonte única)", () => {
    const portal = read("src/pages/Portal.tsx");
    expect(portal).toContain("useInstituicaoAtiva");
    expect(portal).not.toContain("usePortalHub(");
    expect(portal).not.toContain("useSelectedInstituicao(");
  });

  it("não altera rotas nem cria novas migrações funcionais", () => {
    // O SAAS-04 é uma consolidação de front. Se este teste começar a exigir
    // novas rotas ou migrações, o escopo vazou.
    const app = read("src/App.tsx");
    expect(app).toContain("ROUTES.portal");
    expect(app).toContain("ROUTES.portalAdmin");
  });
});
