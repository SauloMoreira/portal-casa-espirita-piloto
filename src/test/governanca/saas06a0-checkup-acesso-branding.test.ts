import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-A0 — Check-up de acesso, branding e entendimento operacional.
 *
 * Cobertura:
 *  - Branding neutro/comercial nas superfícies pré-login (Login, Cadastro, MFA).
 *  - Config global centralizada em src/config/saasBranding.ts.
 *  - Assinatura "SC Moreira Tech" no login.
 *  - Meta tags do documento (index.html) sem referência a "Tratamentos FER".
 *  - Nenhuma menção a "Tratamentos FER" nas superfícies globais.
 *  - Migração idempotente de seed de platform_owner para saulocmoreira@gmail.com.
 *  - Documento oficial SAAS-06-A0.
 *  - Tenant demo Casa Espírita Demo referenciado.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("SAAS-06-A0 — Branding global do SaaS", () => {
  it("expõe config central saasBranding.ts com nome, subtítulo e assinatura", () => {
    const src = read("src/config/saasBranding.ts");
    expect(src).toMatch(/Portal Casa Espírita/);
    expect(src).toMatch(/Gestão espiritual, assistencial e administrativa/);
    expect(src).toMatch(/SC Moreira Tech/);
  });

  it("Login usa SAAS_BRANDING e ícone neutro, sem menções a Tratamentos FER", () => {
    const src = read("src/pages/Login.tsx");
    expect(src).toMatch(/SAAS_BRANDING/);
    expect(src).toMatch(/portal-casa-espirita-icon/);
    expect(src).toMatch(/signature/);
    expect(src).not.toMatch(/Tratamentos FER/);
    expect(src).not.toMatch(/fer-icon\.png/);
    expect(src).not.toMatch(/Harmonia · Equilíbrio · Renovação/);
  });

  it("SolicitarCadastro usa ícone e branding neutros", () => {
    const src = read("src/pages/SolicitarCadastro.tsx");
    expect(src).toMatch(/portal-casa-espirita-icon/);
    expect(src).toMatch(/SAAS_BRANDING/);
    expect(src).not.toMatch(/fer-icon\.png/);
    expect(src).not.toMatch(/alt="Tratamentos FER"/);
  });

  it("MfaVerify usa ícone e branding neutros", () => {
    const src = read("src/pages/MfaVerify.tsx");
    expect(src).toMatch(/portal-casa-espirita-icon/);
    expect(src).toMatch(/SAAS_BRANDING/);
    expect(src).not.toMatch(/fer-icon\.png/);
    expect(src).not.toMatch(/alt="Tratamentos FER"/);
  });

  it("SegurancaConta gera arquivo de códigos com branding neutro", () => {
    const src = read("src/pages/SegurancaConta.tsx");
    expect(src).toMatch(/Códigos de recuperação - Portal Casa Espírita/);
    expect(src).not.toMatch(/Códigos de recuperação - Tratamentos FER/);
    expect(src).not.toMatch(/codigos-recuperacao-fer\.txt/);
  });

  it("index.html expõe metadados neutros do SaaS", () => {
    const html = read("index.html");
    expect(html).toMatch(/Portal Casa Espírita/);
    expect(html).toMatch(/SC Moreira Tech/);
    expect(html).not.toMatch(/Tratamentos FER/);
    expect(html).not.toMatch(/Sistema de Gestão de Tratamentos e Acompanhamentos da FER/);
  });

  it("asset neutro Portal Casa Espírita presente", () => {
    expect(existsSync(resolve(root, "src/assets/portal-casa-espirita-icon.png"))).toBe(true);
  });
});

describe("SAAS-06-A0 — Acesso platform_admin do proprietário", () => {
  it("existe migração idempotente que promove saulocmoreira@gmail.com a platform_owner", () => {
    const sql = read("supabase/migrations/20260708150000_saas06a0_seed_platform_owner.sql");
    expect(sql).toMatch(/saulocmoreira@gmail\.com/);
    expect(sql).toMatch(/platform_owner/);
    expect(sql).toMatch(/ON CONFLICT DO NOTHING/);
    expect(sql).toMatch(/CREATE TRIGGER trg_saas06a0_seed_platform_owner/);
    // Não cria/altera tabela nova, apenas seed + trigger.
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/ALTER TABLE .* DROP/i);
  });
});

describe("SAAS-06-A0 — Documento oficial", () => {
  it("existe docs/SAAS-06-A0-CHECKUP-ACESSO-BRANDING-OPERACIONAL.md com seções obrigatórias", () => {
    const doc = read("docs/SAAS-06-A0-CHECKUP-ACESSO-BRANDING-OPERACIONAL.md");
    expect(doc).toMatch(/SAAS-06-A0/);
    expect(doc).toMatch(/Origem do branding Tratamentos FER/i);
    expect(doc).toMatch(/Estratégia de branding global/i);
    expect(doc).toMatch(/Estratégia de branding por (tenant|instituição)/i);
    expect(doc).toMatch(/platform_admin/i);
    expect(doc).toMatch(/Fluxo operacional/i);
    expect(doc).toMatch(/Casa Espírita Demo/);
    expect(doc).toMatch(/Projeto FER original/i);
    expect(doc).toMatch(/Indicadores/i);
  });
});

describe("SAAS-06-A0 — Preservação do projeto FER original", () => {
  it("assets legados da FER permanecem disponíveis (não apagar, só remover como padrão global)", () => {
    expect(existsSync(resolve(root, "src/assets/fer-icon.png"))).toBe(true);
  });
});
