import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-B0.3 — Habilitação de módulos por instituição.
 *
 * A Central de Assinaturas passa a permitir que o platform_admin sobreponha,
 * por instituição, quais módulos comerciais estão habilitados — sem alterar
 * a composição do plano.
 *
 * Contratos verificados por pattern-matching:
 *  - Tabela assinatura_modulos + RLS + GRANT na migração;
 *  - Escrita restrita a platform_admin (is_platform_admin);
 *  - Leitura restrita a platform_admin OU vínculo ativo com a instituição;
 *  - PortalAssinaturas renderiza toggles por módulo dentro do diálogo Editar;
 *  - usePortalHub aplica override na visão dos módulos do tenant;
 *  - Nenhuma cobrança automática é adicionada.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

function findMigrationWithTable(): string | null {
  const dir = resolve(root, "supabase/migrations");
  for (const f of readdirSync(dir).sort()) {
    const content = readFileSync(resolve(dir, f), "utf8");
    if (/CREATE TABLE (IF NOT EXISTS )?public\.assinatura_modulos/i.test(content)) {
      return content;
    }
  }
  return null;
}

describe("SAAS-06-B0.3 — assinatura_modulos (banco)", () => {
  const migration = findMigrationWithTable();

  it("cria tabela public.assinatura_modulos", () => {
    expect(migration).not.toBeNull();
    expect(migration!).toMatch(/CREATE TABLE (IF NOT EXISTS )?public\.assinatura_modulos/i);
  });

  it("possui GRANTs para authenticated e service_role", () => {
    expect(migration!).toMatch(/GRANT[^;]+ON public\.assinatura_modulos TO authenticated/);
    expect(migration!).toMatch(/GRANT ALL ON public\.assinatura_modulos TO service_role/);
  });

  it("habilita RLS", () => {
    expect(migration!).toMatch(/ALTER TABLE public\.assinatura_modulos ENABLE ROW LEVEL SECURITY/);
  });

  it("escrita restrita a is_platform_admin(auth.uid())", () => {
    expect(migration!).toMatch(/POLICY assinatura_modulos_platform_write[\s\S]+is_platform_admin\(auth\.uid\(\)\)/);
    expect(migration!).toMatch(/WITH CHECK \(public\.is_platform_admin\(auth\.uid\(\)\)\)/);
  });

  it("leitura restrita a platform_admin OU vínculo ativo do tenant", () => {
    expect(migration!).toMatch(/POLICY assinatura_modulos_read[\s\S]+is_platform_admin/);
    expect(migration!).toMatch(/instituicao_usuarios[\s\S]+iu\.status = 'ativo'/);
  });

  it("garante unicidade (assinatura_id, modulo_id)", () => {
    expect(migration!).toMatch(/UNIQUE \(assinatura_id, modulo_id\)/);
  });
});

describe("SAAS-06-B0.3 — Central de Assinaturas (UI)", () => {
  const src = read("src/pages/PortalAssinaturas.tsx");

  it("carrega catálogo de módulos e composição do plano", () => {
    expect(src).toMatch(/from\("modulos"\)/);
    expect(src).toMatch(/from\("plano_modulos"\)/);
  });

  it("renderiza toggles de módulo dentro do diálogo Editar", () => {
    expect(src).toContain("Módulos habilitados para esta instituição");
    expect(src).toMatch(/<Switch\b[\s\S]*?onCheckedChange/);
  });

  it("persiste overrides em assinatura_modulos (upsert/delete)", () => {
    expect(src).toMatch(/from\("assinatura_modulos"\)[\s\S]*?\.upsert/);
    expect(src).toMatch(/from\("assinatura_modulos"\)[\s\S]*?\.delete\(\)/);
  });

  it("recalcula módulos ao trocar o plano preservando overrides", () => {
    expect(src).toContain("onPlanoChange");
    expect(src).toContain("modulosDoPlano");
  });
});

describe("SAAS-06-B0.3 — Portal (visão do tenant)", () => {
  const src = read("src/hooks/usePortalHub.ts");

  it("hub lê overrides por assinatura", () => {
    expect(src).toMatch(/from\("assinatura_modulos"\)/);
  });

  it("override prevalece sobre plano ao calcular ativo_no_plano", () => {
    expect(src).toMatch(/override !== undefined \? override : modulosPlano\.has/);
  });
});

describe("SAAS-06-B0.4 — Módulos na criação de nova instituição", () => {
  const src = read("src/pages/PortalAssinaturas.tsx");

  it("formulário de criação renderiza seção de módulos habilitados", () => {
    expect(src).toContain('data-testid="criar-modulos-section"');
    expect(src).toContain("Módulos habilitados para esta instituição");
  });

  it("mantém estado próprio de módulos na criação (createModulos)", () => {
    expect(src).toMatch(/createModulos/);
    expect(src).toMatch(/setCreateModulos/);
  });

  it("recomenda Tratamentos habilitado por padrão ao escolher o plano", () => {
    expect(src).toMatch(/codigo === "tratamentos"/);
  });

  it("persiste módulos selecionados em assinatura_modulos após criar assinatura", () => {
    // insere assinatura, obtém id, faz upsert em assinatura_modulos
    expect(src).toMatch(/\.from\("assinaturas"\)[\s\S]*?\.insert[\s\S]*?\.select\("id"\)[\s\S]*?\.single\(\)/);
    expect(src).toMatch(/assinatura_modulos[\s\S]*?\.upsert[\s\S]*?onConflict:\s*"assinatura_id,modulo_id"/);
  });

  it("não cria overrides quando efetivo coincide com o padrão do plano", () => {
    // guard de diff no criarInstituicao
    expect(src).toMatch(/efetivo !== padrao/);
  });
});


describe("SAAS-06-B0.3 — Sem cobrança automática", () => {
  const src = read("src/pages/PortalAssinaturas.tsx");
  it("não referencia gateway de cobrança", () => {
    for (const gw of ["stripe", "paddle", "mercadopago", "mercado_pago", "asaas"]) {
      expect(src.toLowerCase()).not.toContain(gw);
    }
  });
});
