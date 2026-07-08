/**
 * SAAS-05-E4 — Contratos das RPCs internas tenant-aware de Relatórios,
 * Dashboards, Observabilidade e Central IA (lote 4).
 *
 * Roda no CI sem banco. Valida estruturalmente:
 *   1. Migration cria overloads com `p_instituicao_id` + validação
 *      (NOT NULL, auth, membership OU platform_admin, filtro explícito por
 *      tenant via join com T-DIR pai, SET LOCAL app.current_instituicao).
 *   2. Services/páginas adaptados enviam `p_instituicao_id` via
 *      `requireInstituicaoId()` (fail-closed, sem localStorage).
 *   3. Overloads foram REVOKE de PUBLIC/anon e GRANT apenas a authenticated.
 *   4. Assinaturas legadas preservadas (backward-compat).
 *   5. Migration não mexe em RLS/policies/NOT NULL/cutover/tabelas T-DIR
 *      nem em edge functions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const MIGRATIONS_DIR = "supabase/migrations";
const MIGRATION_TAG = "SAAS-05-E4";

function findMigration(): string {
  const files = readdirSync(join(ROOT, MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const c = read(join(MIGRATIONS_DIR, f));
    if (c.includes(MIGRATION_TAG)) return c;
  }
  throw new Error("Migration SAAS-05-E4 não encontrada");
}

const migration = findMigration();

const RPCS = [
  "dashboard_admin",
  "relatorio_tratamentos_concluidos",
  "relatorio_carga_tarefeiro",
  "relatorio_frequencia_presenca",
  "relatorio_faltas_periodo",
  "fn_observabilidade_operacional",
  "metricas_ia_whatsapp",
] as const;

function blockOf(fn: string): string {
  return (migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "").split("$function$;")[0] ?? "";
}

function blockOfMetricas(): string {
  return (migration.split(/FUNCTION public\.metricas_ia_whatsapp\b/)[1] ?? "").split("$function$;")[0] ?? "";
}

describe("SAAS-05-E4 — Migration: overloads com p_instituicao_id", () => {
  it.each(RPCS)("cria overload de %s com parâmetro p_instituicao_id uuid", (fn) => {
    const re = new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${fn}\\b[\\s\\S]*?p_instituicao_id uuid`,
    );
    expect(migration).toMatch(re);
  });

  it.each(RPCS)("%s valida p_instituicao_id NOT NULL com ERRCODE 22023", (fn) => {
    const upTo = blockOf(fn);
    expect(upTo).toMatch(/p_instituicao_id IS NULL/);
    expect(upTo).toMatch(/22023/);
  });

  it.each(RPCS)("%s exige autenticação (auth.uid) e retorna 42501", (fn) => {
    const upTo = blockOf(fn);
    expect(upTo).toContain("auth.uid()");
    expect(upTo).toMatch(/42501/);
  });

  it.each(RPCS)("%s exige platform_admin OU membership ativa", (fn) => {
    const upTo = blockOf(fn);
    expect(upTo).toContain("is_platform_admin(v_uid)");
    expect(upTo).toContain("is_member_of_instituicao(v_uid, p_instituicao_id)");
  });

  it.each(RPCS)("%s aplica SET LOCAL app.current_instituicao", (fn) => {
    const upTo = blockOf(fn);
    expect(upTo).toMatch(
      /set_config\('app\.current_instituicao', p_instituicao_id::text, true\)/,
    );
  });

  it.each(RPCS)("%s REVOGA de PUBLIC/anon e concede a authenticated", (fn) => {
    const revokes = migration.match(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon`, "g"),
    );
    const grants = migration.match(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated`, "g"),
    );
    expect(revokes?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(grants?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  const RPCS_ASSISTIDOS = [
    "dashboard_admin",
    "relatorio_tratamentos_concluidos",
    "relatorio_carga_tarefeiro",
    "relatorio_frequencia_presenca",
    "relatorio_faltas_periodo",
  ] as const;
  it.each(RPCS_ASSISTIDOS)(
    "%s filtra agregações por assistidos.instituicao_id",
    (fn) => {
      const upTo = blockOf(fn);
      expect(upTo).toMatch(/public\.assistidos/);
      expect(upTo).toMatch(/instituicao_id IS NULL OR instituicao_id = p_instituicao_id/);
    },
  );

  it("dashboard_admin filtra público de palestras por palestras.instituicao_id", () => {
    const upTo = blockOf("dashboard_admin");
    expect(upTo).toMatch(/public\.palestras/);
    expect(upTo).toMatch(/pl\.instituicao_id IS NULL OR pl\.instituicao_id = p_instituicao_id/);
  });

  it("fn_observabilidade_operacional filtra por assistidos via notificacoes_fila", () => {
    const upTo = blockOf("fn_observabilidade_operacional");
    expect(upTo).toMatch(/public\.notificacoes_fila/);
    expect(upTo).toMatch(/public\.assistidos/);
    expect(upTo).toMatch(/a\.instituicao_id IS NULL OR a\.instituicao_id = p_instituicao_id/);
  });

  it("metricas_ia_whatsapp filtra logs por assistidos via notificacoes_fila e whatsapp_conversas", () => {
    const upTo = blockOfMetricas();
    expect(upTo).toMatch(/public\.notificacoes_fila/);
    expect(upTo).toMatch(/public\.whatsapp_conversas/);
    expect(upTo).toMatch(/public\.assistidos/);
    expect(upTo).toMatch(/a1\.instituicao_id IS NULL OR a1\.instituicao_id = p_instituicao_id/);
    expect(upTo).toMatch(/a2\.instituicao_id IS NULL OR a2\.instituicao_id = p_instituicao_id/);
  });

  it("não altera policies, RLS, NOT NULL, tabelas T-DIR nem cutover", () => {
    expect(migration).not.toMatch(/\bCREATE POLICY\b/i);
    expect(migration).not.toMatch(/\bDROP POLICY\b/i);
    expect(migration).not.toMatch(/\bALTER TABLE\b/i);
    expect(migration).not.toMatch(/\bENABLE ROW LEVEL SECURITY\b/i);
    expect(migration).not.toMatch(/\bDISABLE ROW LEVEL SECURITY\b/i);
    expect(migration).not.toMatch(/SET NOT NULL/i);
    expect(migration).not.toMatch(/DROP NOT NULL/i);
    expect(migration).not.toMatch(/\bCREATE TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP TABLE\b/i);
  });

  it("não cria/altera edge functions", () => {
    expect(migration).not.toMatch(/supabase\/functions/);
  });
});

describe("SAAS-05-E4 — Frontend/services enviam p_instituicao_id (fail-closed)", () => {
  const dashboardSrc = read("src/services/dashboard/adminDashboard.ts");
  const cargaSrc = read("src/services/relatorios/cargaTarefeiro.ts");
  const faltasSrc = read("src/services/relatorios/faltas.ts");
  const frequenciaSrc = read("src/services/relatorios/frequencia.ts");
  const concluidosSrc = read("src/services/relatorios/tratamentosConcluidos.ts");
  const observabilidadeSrc = read("src/services/observabilidade/observabilidadeService.ts");
  const metricasSrc = read("src/components/central-ia/MetricasWhatsApp.tsx");

  it.each([
    ["dashboard", dashboardSrc],
    ["cargaTarefeiro", cargaSrc],
    ["faltas", faltasSrc],
    ["frequencia", frequenciaSrc],
    ["tratamentosConcluidos", concluidosSrc],
    ["observabilidade", observabilidadeSrc],
    ["metricasWhatsApp", metricasSrc],
  ] as const)("%s importa requireInstituicaoId e não lê localStorage", (_label, src) => {
    expect(src).toContain("requireInstituicaoId");
    expect(src).toContain('from "@/lib/tenant/currentTenant"');
    expect(src).not.toMatch(/localStorage/);
  });

  it.each([
    ["dashboard_admin", dashboardSrc],
    ["relatorio_carga_tarefeiro", cargaSrc],
    ["relatorio_faltas_periodo", faltasSrc],
    ["relatorio_frequencia_presenca", frequenciaSrc],
    ["relatorio_tratamentos_concluidos", concluidosSrc],
    ["fn_observabilidade_operacional", observabilidadeSrc],
    ["metricas_ia_whatsapp", metricasSrc],
  ] as const)("RPC %s envia p_instituicao_id", (rpc, src) => {
    const re = new RegExp(
      `supabase\\.rpc\\(\\s*"${rpc}"[\\s\\S]{0,500}p_instituicao_id`,
    );
    expect(src).toMatch(re);
  });
});

describe("SAAS-05-E4 — Assinaturas legadas preservadas (backward-compat)", () => {
  const readAllMigrations = () => {
    const files = readdirSync(join(ROOT, MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    return files.map((f) => read(join(MIGRATIONS_DIR, f))).join("\n---\n");
  };
  const all = readAllMigrations();

  it.each([
    "dashboard_admin(date, date)",
    "relatorio_tratamentos_concluidos(date, date, uuid, text, uuid, uuid, integer, integer)",
    "relatorio_carga_tarefeiro(date, date, uuid, uuid, integer, integer)",
    "relatorio_frequencia_presenca(date, date, uuid, uuid, uuid, uuid, integer, integer)",
    "relatorio_faltas_periodo(date, date, uuid, uuid, uuid, uuid, integer, integer)",
    "fn_observabilidade_operacional(text)",
    "metricas_ia_whatsapp(timestamptz, timestamptz)",
  ])("mantém referência à assinatura legada %s", (sig) => {
    expect(all).toContain(sig);
  });
});
