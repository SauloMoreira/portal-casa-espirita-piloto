import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-C1-FIX01 — Clareza do seletor/informativo de instituição no header.
 *
 * Regras validadas por pattern-matching sobre o componente TenantSwitcher:
 *  - 1 instituição vinculada: badge informativo, sem ChevronDown/Dropdown;
 *  - ≥2 instituições: usa DropdownMenu com ChevronDown;
 *  - dropdown desabilita itens sem vínculo ativo (nunca lista cross-tenant);
 *  - badge single expõe tooltip "Instituição atual: <nome>";
 *  - documento SAAS-06-C1 registra a nota FIX01.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("SAAS-06-C1-FIX01 — TenantSwitcher", () => {
  const src = read("src/components/TenantSwitcher.tsx");

  it("caso 1 instituição: badge informativo com tooltip 'Instituição atual'", () => {
    expect(src).toMatch(/data-testid="tenant-badge-single"/);
    expect(src).toMatch(/title=\{`Instituição atual: \$\{inst\.nome\}`\}/);
    expect(src).toMatch(/aria-label=\{`Instituição atual: \$\{inst\.nome\}`\}/);
  });

  it("caso 1 instituição: sem ChevronDown/Dropdown no ramo single", () => {
    const singleBranch = src.split("const rotuloAtual")[0];
    expect(singleBranch).not.toMatch(/ChevronDown/);
    expect(singleBranch).not.toMatch(/DropdownMenu[^C]/);
  });

  it("caso múltiplas: usa DropdownMenu com ChevronDown", () => {
    expect(src).toMatch(/<DropdownMenu>/);
    expect(src).toMatch(/<ChevronDown/);
    expect(src).toMatch(/aria-label="Trocar instituição ativa"/);
  });

  it("dropdown desabilita instituições sem vínculo ativo", () => {
    expect(src).toMatch(/podeSelecionar = inst\.vinculo_status === "ativo"/);
    expect(src).toMatch(/disabled=\{!podeSelecionar\}/);
    expect(src).toMatch(/if \(podeSelecionar\) selectInstituicao/);
  });

  it("esconde totalmente quando não há vínculo", () => {
    expect(src).toMatch(/instituicoes\.length === 0\) return null/);
  });
});

describe("SAAS-06-C1-FIX01 — guards preservados", () => {
  const app = read("src/App.tsx");

  it("Portal Admin permanece restrito a PlatformAdminRoute", () => {
    expect(app).toMatch(
      /path=\{ROUTES\.portalAdmin\}[^\n]*<PlatformAdminRoute>/,
    );
  });

  it("Usuários permanece restrito a admin", () => {
    expect(app).toMatch(
      /path=\{ROUTES\.usuarios\}[^\n]*allowedRoles=\{\["admin"\]\}/,
    );
  });
});

describe("SAAS-06-C1-FIX01 — documento", () => {
  const doc = read("docs/SAAS-06-C1-HOMOLOGACAO-FUNCIONAL-FER-PILOTO.md");

  it("registra a nota FIX01", () => {
    expect(doc).toMatch(/FIX01 — Clareza do componente de instituição atual no header/);
  });

  it("mantém declaração de projeto Tratamentos FER original intocado", () => {
    expect(doc).toMatch(/Tratamentos FER original[^\n]*intocado/i);
  });
});
