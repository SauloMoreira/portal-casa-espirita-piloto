/**
 * SAAS-05-B — Contratos estruturais da tenantização das tabelas base T-DIR
 * do módulo Tratamentos.
 *
 * Este teste roda no CI sem banco. Valida invariantes estáticas sobre a
 * migration:
 *  - as 13 tabelas T-DIR prioritárias receberam `instituicao_id`;
 *  - todas com FK para `public.instituicoes(id)`;
 *  - todas com índice `idx_<tabela>_instituicao_id`;
 *  - backfill idempotente presente;
 *  - NOT NULL NÃO foi aplicado (é 05-F);
 *  - tabelas T-HER / G-GLB / G-PAR / A-ANA NÃO foram tenantizadas na migration;
 *  - nenhuma alteração em RLS/policies/funções nesta migration.
 *
 * A verificação real contra o banco (contagem de órfãos, FK resolvida) é
 * exercida na suíte src/test/integration/db (fora do CI).
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

// Tabelas explicitamente FORA do escopo estrutural do SAAS-05-B.
const NAO_TENANTIZAR_AGORA = [
  // T-HER — herdam via pai
  "assistido_tratamentos",
  "agenda_tratamentos_assistido",
  "presencas_tratamentos",
  "presencas_palestras",
  "entrevistas_fraternas",
  "checkins_publicos",
  "checkin_tentativas",
  "orientacoes_assistido",
  "plano_tratamento_sessoes",
  "voluntario_funcoes",
  "coordenacao_tratamento",
  "comunicacoes_institucionais_envios",
  // G-PAR — parametrização por instituição fica para recorte futuro
  "tipos_tratamento",
  "funcoes_voluntariado",
  "notificacoes_templates",
  "ia_biblioteca",
  "ia_configuracoes",
  // G-GLB — identidade, permanecem globais
  "profiles",
  "user_roles",
  "mfa_recovery_codes",
  "platform_admins",
  "modulos",
  "planos",
  "plano_modulos",
  // A-ANA — decisão futura
  "consentimentos_comunicacao",
  "whatsapp_conversas",
  "whatsapp_handoffs",
] as const;

function loadSaas05bMigration(): string {
  const files = readdirSync(MIG_DIR).sort();
  for (const f of files.reverse()) {
    const body = readFileSync(join(MIG_DIR, f), "utf8");
    if (body.includes("SAAS-05-B")) return body;
  }
  throw new Error("SAAS-05-B: migration não encontrada em supabase/migrations");
}

const SQL = loadSaas05bMigration();

describe("SAAS-05-B — tabelas T-DIR base tenantizadas", () => {
  it("declara exatamente as 13 tabelas T-DIR prioritárias no array v_tables", () => {
    for (const t of TDIR_BASE) {
      expect(SQL, `tabela ${t} deve estar no array v_tables`).toContain(`'${t}'`);
    }
  });

  it("adiciona instituicao_id (idempotente) via ADD COLUMN IF NOT EXISTS", () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS instituicao_id uuid/i);
  });

  it("cria FK <tabela>_instituicao_id_fkey → instituicoes(id) para cada tabela", () => {
    expect(SQL).toMatch(/FOREIGN KEY \(instituicao_id\) REFERENCES public\.instituicoes\(id\)/i);
    expect(SQL).toMatch(/ON DELETE RESTRICT ON UPDATE CASCADE/i);
    // Guarda idempotência da FK
    expect(SQL).toMatch(/pg_constraint[\s\S]*conname\s*=\s*format\('%s_instituicao_id_fkey'/);
  });

  it("cria índice idx_<tabela>_instituicao_id (idempotente) para cada tabela", () => {
    expect(SQL).toMatch(/CREATE INDEX IF NOT EXISTS[\s\S]*idx_%s_instituicao_id/);
  });

  it("faz backfill controlado somente das linhas órfãs (WHERE instituicao_id IS NULL)", () => {
    expect(SQL).toMatch(/UPDATE public\.%I SET instituicao_id = \$1 WHERE instituicao_id IS NULL/i);
  });

  it("usa a instituição existente (tenant demo do SAAS-02) como alvo do backfill", () => {
    expect(SQL).toMatch(/SELECT id INTO v_tenant FROM public\.instituicoes/i);
    expect(SQL).toMatch(/RAISE EXCEPTION 'SAAS-05-B: nenhuma instituição encontrada/);
  });
});

describe("SAAS-05-B — invariantes de escopo (o que NÃO pode acontecer)", () => {
  it("NÃO aplica NOT NULL em instituicao_id nesta fase (cutover é SAAS-05-F)", () => {
    expect(SQL).not.toMatch(/ALTER COLUMN instituicao_id SET NOT NULL/i);
    expect(SQL).not.toMatch(/instituicao_id uuid NOT NULL/i);
  });

  it("NÃO tenantiza nenhuma tabela T-HER / G-PAR / G-GLB / A-ANA", () => {
    for (const t of NAO_TENANTIZAR_AGORA) {
      // Não deve aparecer como alvo de ALTER TABLE ... ADD instituicao_id
      const alterPattern = new RegExp(
        `ALTER TABLE\\s+public\\.${t}[\\s\\S]{0,120}ADD COLUMN[^;]*instituicao_id`,
        "i",
      );
      expect(SQL, `${t} não pode ser tenantizada no SAAS-05-B`).not.toMatch(alterPattern);
      // E não pode aparecer no array v_tables da migration
      expect(SQL, `${t} não pode estar no array v_tables`).not.toContain(`'${t}'`);
    }
  });

  it("NÃO altera nenhuma policy / RLS / function nesta migration", () => {
    expect(SQL).not.toMatch(/CREATE\s+POLICY/i);
    expect(SQL).not.toMatch(/DROP\s+POLICY/i);
    expect(SQL).not.toMatch(/ALTER\s+POLICY/i);
    expect(SQL).not.toMatch(/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(SQL).not.toMatch(/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    expect(SQL).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    expect(SQL).not.toMatch(/DROP\s+FUNCTION/i);
    expect(SQL).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it("NÃO cria/altera triggers, tabelas ou grants nesta migration", () => {
    expect(SQL).not.toMatch(/CREATE\s+TABLE/i);
    expect(SQL).not.toMatch(/DROP\s+TABLE/i);
    expect(SQL).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(SQL).not.toMatch(/\bGRANT\b/i);
    expect(SQL).not.toMatch(/\bREVOKE\b/i);
  });

  it("registra marcador de rastreabilidade do recorte na coluna raiz", () => {
    expect(SQL).toMatch(
      /COMMENT ON COLUMN public\.assistidos\.instituicao_id IS 'SAAS-05-B/,
    );
  });
});

describe("SAAS-05-B — cobertura documental", () => {
  it("documento docs/SAAS-05-B-TENANTIZACAO-ESTRUTURAL-TABELAS-BASE.md existe e cita todas as tabelas", () => {
    const doc = readFileSync(
      join(ROOT, "docs/SAAS-05-B-TENANTIZACAO-ESTRUTURAL-TABELAS-BASE.md"),
      "utf8",
    );
    for (const t of TDIR_BASE) {
      expect(doc, `doc deve citar a tabela ${t}`).toContain(t);
    }
    // Deve referenciar a matriz do SAAS-05-A
    expect(doc).toMatch(/SAAS-05-A-MATRIZ-TENANTIZACAO-TRATAMENTOS/);
  });
});
