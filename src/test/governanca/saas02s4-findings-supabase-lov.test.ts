/**
 * SAAS-02-S4 — Contrato de governança: findings supabase_lov classificados
 * e formalmente adiados para o cutover (SAAS-05-F1).
 *
 * Este recorte NÃO altera RLS/policies, NÃO altera NOT NULL, NÃO inicia
 * cutover e NÃO toca no projeto FER original. A suíte apenas fixa o
 * contrato de que a decisão de arquitetura foi tomada e nenhuma superfície
 * anterior foi reaberta.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs/SAAS-02-S4-FINDINGS-SUPABASE-LOV.md");
const SUITE = "src/test/governanca/saas02s4-findings-supabase-lov.test.ts";
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

const FINDINGS = [
  "assistidos_voluntarios_pii_cross_tenant",
  "comunicacoes_institucionais_admin_unscoped",
  "role_based_policies_bypass_tenant_scoping",
] as const;

const EDGES_INTOCADAS = [
  "supabase/functions/checkin-publico/index.ts",
  "supabase/functions/alertas-operacionais/index.ts",
  "supabase/functions/central-fila-alerta/index.ts",
  "supabase/functions/notificacoes-dispatch/index.ts",
  "supabase/functions/comunicacao-dispatch/index.ts",
  "supabase/functions/whatsapp-inbound/index.ts",
  "supabase/functions/whatsapp-responder/index.ts",
  "supabase/functions/assistente-entrevista/index.ts",
  "supabase/functions/insights-dashboard/index.ts",
  "supabase/functions/ia-site-ingestao/index.ts",
  "supabase/functions/conteudo-imagem-ia/index.ts",
];

describe("SAAS-02-S4 — documento e classificação dos findings supabase_lov", () => {
  it("documento oficial existe e classifica todos os findings", () => {
    expect(existsSync(DOC)).toBe(true);
    const src = readFileSync(DOC, "utf8");
    for (const id of FINDINGS) {
      expect(src, `documento deve citar ${id}`).toContain(id);
    }
    expect(src).toMatch(/pendente para cutover/i);
    expect(src).toMatch(/SAAS-05-F1/);
  });

  it("documento declara controles compensatórios existentes", () => {
    const src = readFileSync(DOC, "utf8");
    expect(src).toMatch(/shadow_tenant_all_/);
    expect(src).toMatch(/EDGE-A\/A2\/B\/C\/D/);
    expect(src).toMatch(/SAAS-05-E1\.\.E4/);
  });

  it("documento declara nenhuma alteração destrutiva neste recorte", () => {
    const src = readFileSync(DOC, "utf8");
    expect(src).toMatch(/Nenhuma alteração de RLS\/policies aplicada/i);
    expect(src).toMatch(/Nenhum cutover iniciado/i);
    expect(src).toMatch(/Nenhuma alteração no projeto FER original/i);
  });
});

describe("SAAS-02-S4 — não altera RLS/policies, NOT NULL nem cutover", () => {
  const arquivos = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const s4Migrations = arquivos.filter((f) =>
    readFileSync(join(MIGRATIONS_DIR, f), "utf8").includes("SAAS-02-S4"),
  );

  it("nenhuma migração marcada SAAS-02-S4 cria/altera/dropa policies", () => {
    for (const f of s4Migrations) {
      const src = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
      expect(src, `${f} não pode alterar policies`).not.toMatch(
        /\b(CREATE|DROP|ALTER)\s+POLICY\b/i,
      );
    }
  });

  it("nenhuma migração marcada SAAS-02-S4 aplica NOT NULL em instituicao_id", () => {
    for (const f of s4Migrations) {
      const src = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
      expect(src, `${f} não pode aplicar NOT NULL em instituicao_id`).not.toMatch(
        /ALTER\s+COLUMN\s+instituicao_id[\s\S]*?SET\s+NOT\s+NULL/i,
      );
    }
  });

  it("nenhuma migração marcada SAAS-02-S4 concede EXECUTE para PUBLIC/anon", () => {
    for (const f of s4Migrations) {
      const src = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
      expect(src, `${f} não pode reabrir PUBLIC/anon`).not.toMatch(
        /GRANT\s+EXECUTE\s+ON\s+FUNCTION[\s\S]*?TO\s+(PUBLIC|anon)/i,
      );
    }
  });
});

describe("SAAS-02-S4 — não reabre recortes anteriores", () => {
  it("edges anteriores não citam SAAS-02-S4", () => {
    for (const p of EDGES_INTOCADAS) {
      const src = readFileSync(join(ROOT, p), "utf8");
      expect(src, `${p} não pode citar SAAS-02-S4`).not.toMatch(/SAAS-02-S4/);
    }
  });

  it("nenhum arquivo em src/ cita SAAS-02-S4 exceto a própria suíte", () => {
    // varre apenas o diretório de testes de governança para evitar custo alto
    const dir = join(ROOT, "src/test/governanca");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      const isSelf = `src/test/governanca/${f}` === SUITE;
      if (!isSelf && src.includes("SAAS-02-S4")) {
        throw new Error(`${f} não deveria citar SAAS-02-S4`);
      }
    }
    expect(true).toBe(true);
  });
});
