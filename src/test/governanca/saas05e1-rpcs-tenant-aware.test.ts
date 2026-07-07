/**
 * SAAS-05-E1 — Contratos das RPCs internas tenant-aware do lote 1.
 *
 * Roda no CI sem banco. Valida estruturalmente:
 *   1. A migration cria os overloads com `p_instituicao_id` + validação
 *      (NOT NULL, membership, `SET LOCAL app.current_instituicao`).
 *   2. Os services adaptados enviam `p_instituicao_id` obtido via
 *      `requireInstituicaoId()` (fail-closed, sem localStorage).
 *   3. Os overloads foram REVOKE de PUBLIC/anon e GRANT apenas a
 *      authenticated (defesa em profundidade sobre 0028).
 *   4. Nenhuma edge function foi tocada neste recorte.
 *   5. Nenhuma migration nova mexe em RLS, policies, NOT NULL,
 *      cutover ou tabelas T-DIR.
 *
 * Validação real com banco (usuário A/B, vínculo inativo, platform_admin)
 * fica em src/test/integration/db/ para o cutover posterior (05-F).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const MIGRATIONS_DIR = "supabase/migrations";
const MIGRATION_TAG = "SAAS-05-E1";

function findMigration(): string {
  const files = readdirSync(join(ROOT, MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const c = read(join(MIGRATIONS_DIR, f));
    if (c.includes(MIGRATION_TAG)) return c;
  }
  throw new Error("Migration SAAS-05-E1 não encontrada");
}

const migration = findMigration();

const RPCS = [
  "gerenciar_voluntario",
  "gerenciar_termo_voluntario",
  "fn_buscar_pessoa_para_voluntario",
  "fn_processar_excecao_notificacoes",
  "fn_monitor_excecao_notificacoes",
] as const;

describe("SAAS-05-E1 — Migration: overloads com p_instituicao_id", () => {
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
    expect(upTo).toMatch(/22023/); // ERRCODE de invalid_parameter_value
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
    // Alguns overloads têm assinatura mais longa; matchamos em cima do nome.
    const revokes = migration.match(
      new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon`, "g"),
    );
    const grants = migration.match(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO authenticated`, "g"),
    );
    expect(revokes?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(grants?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("gerenciar_voluntario bloqueia voluntário de outro tenant", () => {
    const block = migration.split(/FUNCTION public\.gerenciar_voluntario\b/)[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toContain("Voluntário não pertence à instituição informada");
  });

  it("gerenciar_termo_voluntario bloqueia voluntário de outro tenant", () => {
    const block = migration.split(/FUNCTION public\.gerenciar_termo_voluntario\b/)[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toContain("Voluntário não pertence à instituição informada");
  });

  it("fn_processar_excecao_notificacoes bloqueia exceção de outro tenant", () => {
    const block = migration.split(/FUNCTION public\.fn_processar_excecao_notificacoes\b/)[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toContain("Exceção não pertence à instituição informada");
  });

  it("não altera policies, RLS, NOT NULL, edge functions, cutover ou tabelas T-DIR", () => {
    expect(migration).not.toMatch(/\bCREATE POLICY\b/i);
    expect(migration).not.toMatch(/\bDROP POLICY\b/i);
    expect(migration).not.toMatch(/\bALTER TABLE\b/i);
    expect(migration).not.toMatch(/\bENABLE ROW LEVEL SECURITY\b/i);
    expect(migration).not.toMatch(/\bDISABLE ROW LEVEL SECURITY\b/i);
    expect(migration).not.toMatch(/SET NOT NULL/i);
    expect(migration).not.toMatch(/DROP NOT NULL/i);
  });
});

describe("SAAS-05-E1 — Frontend/services enviam p_instituicao_id (fail-closed)", () => {
  const volSrc = read("src/services/voluntarios/voluntariosService.ts");
  const excSrc = read("src/services/programacao/excecoesService.ts");

  it("voluntariosService importa requireInstituicaoId (fail-closed)", () => {
    expect(volSrc).toContain("requireInstituicaoId");
    expect(volSrc).toContain('from "@/lib/tenant/currentTenant"');
    expect(volSrc).not.toMatch(/localStorage/);
  });

  it("gerenciar_voluntario RPC envia p_instituicao_id", () => {
    expect(volSrc).toMatch(
      /supabase\.rpc\("gerenciar_voluntario",[\s\S]*?p_instituicao_id:\s*instituicaoId/,
    );
  });

  it("gerenciar_termo_voluntario RPC envia p_instituicao_id", () => {
    expect(volSrc).toMatch(
      /supabase\.rpc\("gerenciar_termo_voluntario",[\s\S]*?p_instituicao_id:\s*instituicaoId/,
    );
  });

  it("fn_buscar_pessoa_para_voluntario RPC envia p_instituicao_id", () => {
    expect(volSrc).toMatch(
      /supabase\.rpc\("fn_buscar_pessoa_para_voluntario",[\s\S]*?p_instituicao_id:\s*instituicaoId/,
    );
  });

  it("excecoesService importa requireInstituicaoId (fail-closed)", () => {
    expect(excSrc).toContain("requireInstituicaoId");
    expect(excSrc).toContain('from "@/lib/tenant/currentTenant"');
    expect(excSrc).not.toMatch(/localStorage/);
  });

  it("fn_processar_excecao_notificacoes RPC envia p_instituicao_id", () => {
    expect(excSrc).toMatch(
      /supabase\.rpc\(\s*"fn_processar_excecao_notificacoes",[\s\S]*?p_instituicao_id:\s*instituicaoId/,
    );
  });

  it("fn_monitor_excecao_notificacoes RPC envia p_instituicao_id", () => {
    expect(excSrc).toMatch(
      /supabase\.rpc\("fn_monitor_excecao_notificacoes",[\s\S]*?p_instituicao_id:\s*instituicaoId/,
    );
  });
});

describe("SAAS-05-E1 — Escopo preservado (não toca fora do lote E1)", () => {
  it("nenhuma edge function tocada nesta migration", () => {
    // Migration lida apenas com functions em public.*; smoke sanity check.
    expect(migration).not.toMatch(/supabase\/functions/);
  });

  it("não existem novas migrations tocando edge functions em SAAS-05-E1", () => {
    // Sinal contratual: nenhum arquivo em supabase/functions/ foi
    // marcado como parte deste recorte.
    const files = readdirSync(join(ROOT, MIGRATIONS_DIR));
    const e1s = files.filter((f) => {
      try {
        return read(join(MIGRATIONS_DIR, f)).includes(MIGRATION_TAG);
      } catch {
        return false;
      }
    });
    expect(e1s.length).toBeGreaterThanOrEqual(1);
    for (const f of e1s) {
      const c = read(join(MIGRATIONS_DIR, f));
      expect(c).not.toMatch(/checkin[-_]publico/);
      expect(c).not.toMatch(/notificacoes[-_]dispatch/);
      expect(c).not.toMatch(/whatsapp[-_](inbound|responder)/);
    }
  });
});
