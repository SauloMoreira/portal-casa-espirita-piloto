import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-A1 — Branding tenant-aware.
 *
 * Cobre:
 *  - Hook useTenantBranding compõe tenant + fallback global.
 *  - Sem tenant ativo → scope global (Portal Casa Espírita), nunca "Tratamentos FER".
 *  - Portal.tsx consome o hook e exibe rótulo neutro quando não há tenant.
 *  - Migração aditiva com os campos opcionais de branding e seed do tenant demo.
 *  - Documento e checklist da primeira casa piloto existem.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("SAAS-06-A1 — Hook useTenantBranding", () => {
  const src = read("src/hooks/useTenantBranding.ts");

  it("depende de InstituicaoContext e do branding global neutro", () => {
    expect(src).toMatch(/from "@\/contexts\/InstituicaoContext"/);
    expect(src).toMatch(/from "@\/config\/saasBranding"/);
    expect(src).toMatch(/SAAS_BRANDING/);
  });

  it("expõe union de escopo tenant/global", () => {
    expect(src).toMatch(/scope:\s*"tenant"\s*\|\s*"global"/);
  });

  it("faz fallback global quando não há instituição ativa", () => {
    expect(src).toMatch(/if \(!selecionada\) return GLOBAL_BRANDING/);
  });

  it("lê tenant-scoped instituicao_config sem localStorage", () => {
    expect(src).toMatch(/from\("instituicao_config"\)/);
    expect(src).not.toMatch(/localStorage/);
  });

  it("não usa 'Tratamentos FER' como valor exibido nem fer-icon", () => {
    // Ignora ocorrência em comentários explicativos; procura só literais de string.
    expect(src).not.toMatch(/"Tratamentos FER"/);
    expect(src).not.toMatch(/fer-icon/);
  });
});

describe("SAAS-06-A1 — Portal.tsx aplica branding tenant-aware", () => {
  const src = read("src/pages/Portal.tsx");

  it("consome useTenantBranding e SAAS_BRANDING", () => {
    expect(src).toMatch(/useTenantBranding/);
    expect(src).toMatch(/SAAS_BRANDING\.name/);
  });

  it("mostra branding do tenant somente quando scope === 'tenant'", () => {
    expect(src).toMatch(/branding\.scope === "tenant"/);
  });

  it("não menciona 'Tratamentos FER'", () => {
    expect(src).not.toMatch(/Tratamentos FER/);
  });
});

describe("SAAS-06-A1 — Migração aditiva de branding", () => {
  const files = readdirSync(resolve(root, "supabase/migrations")).filter((f) =>
    f.endsWith(".sql"),
  );
  const combined = files
    .map((f) => read(`supabase/migrations/${f}`))
    .join("\n\n");

  it("adiciona colunas opcionais em instituicao_config", () => {
    expect(combined).toMatch(/ADD COLUMN IF NOT EXISTS slogan/);
    expect(combined).toMatch(/ADD COLUMN IF NOT EXISTS cor_primaria/);
    expect(combined).toMatch(/ADD COLUMN IF NOT EXISTS cor_secundaria/);
    expect(combined).toMatch(/ADD COLUMN IF NOT EXISTS texto_institucional/);
    expect(combined).toMatch(/ADD COLUMN IF NOT EXISTS assinatura_rodape/);
  });

  it("faz seed idempotente do branding do tenant demo (casa-demo)", () => {
    expect(combined).toMatch(/casa-demo/);
    expect(combined).toMatch(/Ambiente de demonstração/);
    expect(combined).toMatch(/COALESCE\(slogan/);
  });

  it("não altera RLS/policies nem cria SECURITY DEFINER neste lote", () => {
    // Buscar apenas a migração deste lote (última que menciona SAAS-06-A1 no bloco).
    const a1 = files
      .map((f) => read(`supabase/migrations/${f}`))
      .filter((sql) => sql.includes("SAAS-06-A1 — Branding tenant-aware"));
    expect(a1.length).toBeGreaterThan(0);
    const sql = a1.join("\n\n");
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/SECURITY DEFINER/i);
  });
});

describe("SAAS-06-A1 — Documentação obrigatória", () => {
  it("documento oficial existe com seções essenciais", () => {
    const doc = read("docs/SAAS-06-A1-BRANDING-TENANT-AWARE-PILOTO.md");
    expect(doc).toMatch(/SAAS-06-A1/);
    expect(doc).toMatch(/Estratégia de branding/i);
    expect(doc).toMatch(/Campos suportados/i);
    expect(doc).toMatch(/Fallback global/i);
    expect(doc).toMatch(/Casa Espírita Demo/);
    expect(doc).toMatch(/primeira casa piloto/i);
    expect(doc).toMatch(/Indicadores/i);
    expect(doc).toMatch(/Projeto Tratamentos FER original/i);
  });

  it("checklist da primeira casa piloto existe", () => {
    const p = "docs/saas-06-a/11-checklist-branding-piloto.md";
    expect(existsSync(resolve(root, p))).toBe(true);
    const doc = read(p);
    expect(doc).toMatch(/Identidade visual/i);
    expect(doc).toMatch(/Termo de Adesão SaaS/);
    expect(doc).toMatch(/Nenhum dado real/i);
  });
});

describe("SAAS-06-A1 — Preservação do branding global e do projeto FER", () => {
  it("saasBranding.ts continua neutro (Portal Casa Espírita / SC Moreira Tech)", () => {
    const src = read("src/config/saasBranding.ts");
    expect(src).toMatch(/Portal Casa Espírita/);
    expect(src).toMatch(/SC Moreira Tech/);
    expect(src).not.toMatch(/"Tratamentos FER"/);
  });

  it("Login continua neutro (sem regressão para Tratamentos FER)", () => {
    const src = read("src/pages/Login.tsx");
    expect(src).toMatch(/SAAS_BRANDING/);
    expect(src).not.toMatch(/Tratamentos FER/);
  });
});
