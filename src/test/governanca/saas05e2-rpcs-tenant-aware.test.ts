/**
 * SAAS-05-E2 — Contratos das RPCs internas tenant-aware do núcleo
 * Assistidos/Agenda/Tratamentos (lote 2).
 *
 * Roda no CI sem banco. Valida estruturalmente:
 *   1. Migration cria overloads com `p_instituicao_id` + validação
 *      (NOT NULL, membership, join com T-DIR pai, SET LOCAL).
 *   2. Services adaptados enviam `p_instituicao_id` via
 *      `requireInstituicaoId()` (fail-closed, sem localStorage).
 *   3. Overloads foram REVOKE de PUBLIC/anon e GRANT apenas a authenticated.
 *   4. Nenhuma edge function foi tocada neste recorte.
 *   5. Migration não mexe em RLS/policies/NOT NULL/cutover/tabelas T-DIR.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const MIGRATIONS_DIR = "supabase/migrations";
const MIGRATION_TAG = "SAAS-05-E2";

function findMigration(): string {
  const files = readdirSync(join(ROOT, MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const c = read(join(MIGRATIONS_DIR, f));
    if (c.includes(MIGRATION_TAG)) return c;
  }
  throw new Error("Migration SAAS-05-E2 não encontrada");
}

const migration = findMigration();

const RPCS = [
  "pts_registrar_presenca",
  "pts_registrar_ausencia",
  "pts_rollback_piloto",
  "pts_homologacao_auditar",
  "pts_converter_assistido",
  "pts_persistir_plano",
  "registrar_presenca",
] as const;

describe("SAAS-05-E2 — Migration: overloads com p_instituicao_id", () => {
  it.each(RPCS)("cria overload de %s com parâmetro p_instituicao_id uuid", (fn) => {
    const re = new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${fn}\\b[\\s\\S]*?p_instituicao_id uuid`,
    );
    expect(migration).toMatch(re);
  });

  it.each(RPCS)("%s valida p_instituicao_id NOT NULL", (fn) => {
    const block = migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toMatch(/p_instituicao_id IS NULL/);
    expect(upTo).toMatch(/22023/);
  });

  it.each(RPCS)("%s exige platform_admin OU membership ativa", (fn) => {
    const block = migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toContain("is_platform_admin(v_uid)");
    expect(upTo).toContain("is_member_of_instituicao(v_uid, p_instituicao_id)");
    expect(upTo).toMatch(/42501/);
  });

  it.each(RPCS)("%s aplica SET LOCAL app.current_instituicao", (fn) => {
    const block = migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
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

  const RPCS_VINCULO = [
    "pts_registrar_presenca",
    "pts_registrar_ausencia",
    "pts_persistir_plano",
    "registrar_presenca",
  ] as const;

  it.each(RPCS_VINCULO)(
    "%s valida pertinência do vínculo via join assistido_tratamentos → assistidos",
    (fn) => {
      const block = migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "";
      const upTo = block.split("$function$;")[0] ?? "";
      expect(upTo).toMatch(/public\.assistido_tratamentos/);
      expect(upTo).toMatch(/public\.assistidos/);
      expect(upTo).toContain("Vínculo não pertence à instituição informada");
    },
  );

  const RPCS_ASSISTIDO = [
    "pts_rollback_piloto",
    "pts_homologacao_auditar",
    "pts_converter_assistido",
  ] as const;

  it.each(RPCS_ASSISTIDO)(
    "%s valida pertinência do assistido diretamente na T-DIR",
    (fn) => {
      const block = migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "";
      const upTo = block.split("$function$;")[0] ?? "";
      expect(upTo).toMatch(/public\.assistidos/);
      expect(upTo).toContain("Assistido não pertence à instituição informada");
    },
  );

  it("não altera policies, RLS, NOT NULL, edge functions, cutover ou tabelas T-DIR", () => {
    expect(migration).not.toMatch(/\bCREATE POLICY\b/i);
    expect(migration).not.toMatch(/\bDROP POLICY\b/i);
    expect(migration).not.toMatch(/\bALTER TABLE\b/i);
    expect(migration).not.toMatch(/\bENABLE ROW LEVEL SECURITY\b/i);
    expect(migration).not.toMatch(/\bDISABLE ROW LEVEL SECURITY\b/i);
    expect(migration).not.toMatch(/SET NOT NULL/i);
    expect(migration).not.toMatch(/DROP NOT NULL/i);
  });

  it("não menciona edge functions", () => {
    expect(migration).not.toMatch(/supabase\/functions/);
    expect(migration).not.toMatch(/checkin[-_]publico/);
    expect(migration).not.toMatch(/notificacoes[-_]dispatch/);
    expect(migration).not.toMatch(/whatsapp[-_](inbound|responder)/);
  });
});

describe("SAAS-05-E2 — Frontend/services enviam p_instituicao_id (fail-closed)", () => {
  const planoSrc = read("src/services/agendaPlano/planoRpcService.ts");
  const orqSrc = read("src/services/agendaPlano/orquestracao.ts");

  it("planoRpcService importa requireInstituicaoId e não lê localStorage", () => {
    expect(planoSrc).toContain("requireInstituicaoId");
    expect(planoSrc).toContain('from "@/lib/tenant/currentTenant"');
    expect(planoSrc).not.toMatch(/localStorage/);
  });

  it("orquestracao importa requireInstituicaoId e não lê localStorage", () => {
    expect(orqSrc).toContain("requireInstituicaoId");
    expect(orqSrc).toContain('from "@/lib/tenant/currentTenant"');
    expect(orqSrc).not.toMatch(/localStorage/);
  });

  it.each([
    ["pts_registrar_presenca", planoSrc],
    ["pts_registrar_ausencia", planoSrc],
    ["pts_rollback_piloto", planoSrc],
    ["pts_homologacao_auditar", planoSrc],
    ["pts_converter_assistido", orqSrc],
    ["pts_persistir_plano", orqSrc],
    ["registrar_presenca", orqSrc],
  ] as const)("RPC %s envia p_instituicao_id", (rpc, src) => {
    const re = new RegExp(
      `supabase\\.rpc\\(\\s*"${rpc}"[\\s\\S]{0,600}p_instituicao_id`,
    );
    expect(src).toMatch(re);
  });
});
