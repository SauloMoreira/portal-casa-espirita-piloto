/**
 * SAAS-05-C — Contratos dos helpers RLS multi-tenant e policies shadow
 * para as 13 tabelas T-DIR base do módulo Tratamentos.
 *
 * Este teste roda no CI sem banco. Valida invariantes estáticos sobre a
 * migration:
 *  - cria os 3 helpers de contexto/tenant (current_instituicao_id,
 *    is_member_of_instituicao, has_role_in_instituicao);
 *  - helpers são wrappers dos helpers SAAS-02 e não são SECURITY DEFINER;
 *  - grants revogam PUBLIC/anon e concedem authenticated/service_role;
 *  - cria policy shadow `shadow_tenant_all_<tabela>` para as 13 tabelas T-DIR;
 *  - policies são PERMISSIVE (modo shadow) e não restringem o acesso atual;
 *  - policies verificam tenant ativo + membership + bypass platform_admin;
 *  - NÃO altera policies legadas, NÃO aplica NOT NULL, NÃO altera RLS estado,
 *    NÃO cria tabelas/triggers/colunas.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIG_DIR = join(ROOT, "supabase/migrations");

const TDIR_BASE = [
  "assistidos",
  "voluntarios",
  "palestras",
  "sessoes_publicas",
  "avisos_internos",
  "campanhas",
  "eventos",
  "acao_social_alimentos",
  "regras_operacionais",
  "excecoes_operacionais",
  "programacao_padrao",
  "configuracoes_gerais",
  "comunicacoes_institucionais",
] as const;

function loadSaas05cMigration(): string {
  const files = readdirSync(MIG_DIR).sort();
  for (const f of files.reverse()) {
    const body = readFileSync(join(MIG_DIR, f), "utf8");
    if (body.includes("SAAS-05-C")) return body;
  }
  throw new Error("SAAS-05-C: migration não encontrada em supabase/migrations");
}

const SQL = loadSaas05cMigration();

describe("SAAS-05-C — helpers de contexto multi-tenant", () => {
  it("cria current_instituicao_id() lendo app.current_instituicao", () => {
    expect(SQL).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.current_instituicao_id\s*\(\s*\)/i,
    );
    expect(SQL).toMatch(/current_setting\('app\.current_instituicao',\s*true\)/i);
  });

  it("cria is_member_of_instituicao como wrapper de user_pertence_instituicao", () => {
    expect(SQL).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.is_member_of_instituicao\s*\(/i,
    );
    expect(SQL).toMatch(
      /public\.user_pertence_instituicao\s*\(\s*_user_id,\s*_instituicao_id\s*\)/i,
    );
  });

  it("cria has_role_in_instituicao como wrapper de user_tem_papel_local", () => {
    expect(SQL).toMatch(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.has_role_in_instituicao\s*\(/i,
    );
    expect(SQL).toMatch(
      /public\.user_tem_papel_local\s*\(\s*_user_id,\s*_instituicao_id,\s*_papel\s*\)/i,
    );
  });

  it("helpers novos não são SECURITY DEFINER (preservam indicador 0029)", () => {
    // Cada CREATE OR REPLACE FUNCTION deve estar acompanhado de LANGUAGE sql
    // e, nas 3 novas funções, não deve aparecer SECURITY DEFINER.
    const functionBlocks = SQL.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(current_instituicao_id|is_member_of_instituicao|has_role_in_instituicao)[\s\S]*?\$\$;/gi,
    );
    expect(functionBlocks).toHaveLength(3);
    for (const block of functionBlocks ?? []) {
      expect(block, "helper não deve ser SECURITY DEFINER").not.toMatch(
        /SECURITY\s+DEFINER/i,
      );
    }
  });

  it("revoca execução pública/anônima e concede a authenticated/service_role", () => {
    expect(SQL).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.current_instituicao_id\s*\(\s*\)\s+FROM\s+PUBLIC,\s*anon/i,
    );
    expect(SQL).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.current_instituicao_id\s*\(\s*\)\s+TO\s+authenticated,\s*service_role/i,
    );
  });
});

describe("SAAS-05-C — policies shadow multi-tenant", () => {
  it("cria policy shadow para cada uma das 13 tabelas T-DIR base", () => {
    for (const t of TDIR_BASE) {
      expect(SQL, `tabela ${t} deve ter policy shadow`).toContain(
        `shadow_tenant_all_${t}`,
      );
    }
  });

  it("policies são PERMISSIVE (modo shadow — não restringem acesso atual)", () => {
    const permissiveMatches = SQL.match(/AS\s+PERMISSIVE/gi) || [];
    expect(permissiveMatches.length).toBeGreaterThanOrEqual(TDIR_BASE.length);
    // Garante que não há policies RESTRICTIVE sendo criadas nesta fase
    expect(SQL).not.toMatch(/AS\s+RESTRICTIVE/i);
  });

  it("policies verificam tenant ativo via current_instituicao_id()", () => {
    expect(SQL).toMatch(
      /public\.current_instituicao_id\s*\(\)\s+IS\s+NOT\s+NULL/i,
    );
    expect(SQL).toMatch(
      /instituicao_id\s*=\s*public\.current_instituicao_id\s*\(\)/i,
    );
  });

  it("policies verificam membership do usuário no tenant", () => {
    expect(SQL).toMatch(
      /public\.is_member_of_instituicao\s*\(\s*auth\.uid\s*\(\)\s*,\s*instituicao_id\s*\)/i,
    );
  });

  it("policies preservam bypass de platform_admin", () => {
    expect(SQL).toMatch(/public\.is_platform_admin\s*\(\s*auth\.uid\s*\(\)\s*\)/i);
  });

  it("policies shadow são idempotentes (DROP IF EXISTS + CREATE) sem afetar legadas", () => {
    const drops = SQL.match(/DROP\s+POLICY\s+IF\s+EXISTS/gi) || [];
    expect(drops.length).toBe(TDIR_BASE.length);
    expect(SQL).not.toMatch(/ALTER\s+POLICY/i);
    // Nenhum DROP POLICY sem IF EXISTS (só as shadow são dropadas, e de forma segura)
    expect(SQL).not.toMatch(/DROP\s+POLICY(?!\s+IF\s+EXISTS)/i);
  });
});

describe("SAAS-05-C — invariantes de escopo (o que NÃO pode acontecer)", () => {
  it("NÃO aplica NOT NULL em instituicao_id (cutover é SAAS-05-F)", () => {
    expect(SQL).not.toMatch(/ALTER\s+COLUMN\s+instituicao_id\s+SET\s+NOT\s+NULL/i);
    expect(SQL).not.toMatch(/instituicao_id\s+uuid\s+NOT\s+NULL/i);
  });

  it("NÃO altera RLS estado das tabelas (enable/disable)", () => {
    expect(SQL).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(SQL).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
  });

  it("NÃO cria/altera tabelas, triggers ou colunas além das policies shadow", () => {
    expect(SQL).not.toMatch(/CREATE\s+TABLE/i);
    expect(SQL).not.toMatch(/ALTER\s+TABLE[\s\S]*?ADD\s+COLUMN/i);
    expect(SQL).not.toMatch(/CREATE\s+TRIGGER/i);
  });

  it("NÃO cria novas funções SECURITY DEFINER", () => {
    const newSecdef = SQL.match(
      /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.[\s\S]*?SECURITY\s+DEFINER/gi,
    );
    expect(newSecdef).toBeNull();
  });

  it("registra marcador de rastreabilidade do recorte", () => {
    expect(SQL).toMatch(/SAAS-05-C/);
    expect(SQL).toMatch(
      /COMMENT\s+ON\s+FUNCTION\s+public\.current_instituicao_id/i,
    );
  });
});

describe("SAAS-05-C — cobertura documental", () => {
  it("documento docs/SAAS-05-C-RLS-MULTITENANT-SHADOW.md existe e cobre escopo", () => {
    const doc = readFileSync(
      join(ROOT, "docs/SAAS-05-C-RLS-MULTITENANT-SHADOW.md"),
      "utf8",
    );
    expect(doc).toMatch(/SAAS-05-C/);
    for (const t of TDIR_BASE) {
      expect(doc, `doc deve citar a tabela ${t}`).toContain(t);
    }
  });
});
