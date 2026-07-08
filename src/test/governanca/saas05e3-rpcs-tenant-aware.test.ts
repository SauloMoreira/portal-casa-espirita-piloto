/**
 * SAAS-05-E3 — Contratos das RPCs internas tenant-aware de Entrevistas e
 * Avisos de Ausência (lote 3).
 *
 * Roda no CI sem banco. Valida estruturalmente:
 *   1. Migration cria overloads com `p_instituicao_id` + validação
 *      (NOT NULL, auth, membership OU platform_admin, join com T-DIR pai
 *      via `assistidos`, SET LOCAL app.current_instituicao).
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
const MIGRATION_TAG = "SAAS-05-E3";

function findMigration(): string {
  const files = readdirSync(join(ROOT, MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const c = read(join(ROOT, MIGRATIONS_DIR, f));
    if (c.includes(MIGRATION_TAG)) return c;
  }
  throw new Error("Migration SAAS-05-E3 não encontrada");
}

const migration = findMigration();

const RPCS = [
  "agendar_entrevista_fraterna",
  "fn_entrevistas_operacional",
  "fn_registrar_aviso_ausencia",
  "fn_tratar_aviso_ausencia",
  "fn_avisos_ausencia_pendentes",
] as const;

describe("SAAS-05-E3 — Migration: overloads com p_instituicao_id", () => {
  it.each(RPCS)("cria overload de %s com parâmetro p_instituicao_id uuid", (fn) => {
    const re = new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${fn}\\b[\\s\\S]*?p_instituicao_id uuid`,
    );
    expect(migration).toMatch(re);
  });

  it.each(RPCS)("%s valida p_instituicao_id NOT NULL com ERRCODE 22023", (fn) => {
    const block = migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toMatch(/p_instituicao_id IS NULL/);
    expect(upTo).toMatch(/22023/);
  });

  it.each(RPCS)("%s exige autenticação (auth.uid) e retorna 42501", (fn) => {
    const block = migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toContain("auth.uid()");
    expect(upTo).toMatch(/42501/);
  });

  it.each(RPCS)("%s exige platform_admin OU membership ativa", (fn) => {
    const block = migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toContain("is_platform_admin(v_uid)");
    expect(upTo).toContain("is_member_of_instituicao(v_uid, p_instituicao_id)");
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

  const RPCS_ASSISTIDO_DIRETO = [
    "agendar_entrevista_fraterna",
    "fn_registrar_aviso_ausencia",
  ] as const;
  it.each(RPCS_ASSISTIDO_DIRETO)(
    "%s valida pertinência do assistido diretamente na T-DIR assistidos",
    (fn) => {
      const block = migration.split(new RegExp(`FUNCTION public\\.${fn}\\b`))[1] ?? "";
      const upTo = block.split("$function$;")[0] ?? "";
      expect(upTo).toMatch(/public\.assistidos/);
      expect(upTo).toContain("Assistido não pertence à instituição informada");
    },
  );

  it("fn_entrevistas_operacional valida pertinência via join entrevistas_fraternas → assistidos", () => {
    const block = migration.split(/FUNCTION public\.fn_entrevistas_operacional\b/)[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toMatch(/public\.entrevistas_fraternas/);
    expect(upTo).toMatch(/public\.assistidos/);
    expect(upTo).toContain("Entrevista não pertence à instituição informada");
  });

  it("fn_tratar_aviso_ausencia valida pertinência via join avisos_ausencia → assistidos", () => {
    const block = migration.split(/FUNCTION public\.fn_tratar_aviso_ausencia\b/)[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toMatch(/public\.avisos_ausencia/);
    expect(upTo).toMatch(/public\.assistidos/);
    expect(upTo).toContain("Aviso não pertence à instituição informada");
  });

  it("fn_avisos_ausencia_pendentes filtra explicitamente por instituicao_id do assistido", () => {
    const block = migration.split(/FUNCTION public\.fn_avisos_ausencia_pendentes\b/)[1] ?? "";
    const upTo = block.split("$function$;")[0] ?? "";
    expect(upTo).toMatch(/a\.instituicao_id IS NULL OR a\.instituicao_id = p_instituicao_id/);
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

  it("não menciona edge functions, dispatcher, WhatsApp ou check-in público", () => {
    expect(migration).not.toMatch(/supabase\/functions/);
    expect(migration).not.toMatch(/checkin[-_]publico/);
    expect(migration).not.toMatch(/notificacoes[-_]dispatch/);
    expect(migration).not.toMatch(/whatsapp[-_](inbound|responder)/);
    expect(migration).not.toMatch(/comunicacao[-_]dispatch/);
    expect(migration).not.toMatch(/alertas[-_]operacionais/);
  });
});

describe("SAAS-05-E3 — Frontend/services enviam p_instituicao_id (fail-closed)", () => {
  const avisosSrc = read("src/services/avisos/avisosAusenciaService.ts");
  const entrevistasPage = read("src/pages/Entrevistas.tsx");
  const cartaSrc = read("src/components/CartaAgendamento.tsx");

  it.each([
    ["avisosAusenciaService", avisosSrc],
    ["Entrevistas page", entrevistasPage],
    ["CartaAgendamento", cartaSrc],
  ] as const)("%s importa requireInstituicaoId e não lê localStorage", (_label, src) => {
    expect(src).toContain("requireInstituicaoId");
    expect(src).toContain('from "@/lib/tenant/currentTenant"');
    expect(src).not.toMatch(/localStorage/);
  });

  it.each([
    "fn_registrar_aviso_ausencia",
    "fn_tratar_aviso_ausencia",
    "fn_avisos_ausencia_pendentes",
  ] as const)("RPC %s em avisosAusenciaService envia p_instituicao_id", (rpc) => {
    const re = new RegExp(
      `supabase\\.rpc\\(\\s*"${rpc}"[\\s\\S]{0,400}p_instituicao_id`,
    );
    expect(avisosSrc).toMatch(re);
  });

  it("Entrevistas.tsx: fn_entrevistas_operacional envia p_instituicao_id", () => {
    expect(entrevistasPage).toMatch(
      /supabase\.rpc\(\s*"fn_entrevistas_operacional"[\s\S]{0,400}p_instituicao_id/,
    );
  });

  it("Entrevistas.tsx: agendar_entrevista_fraterna envia p_instituicao_id", () => {
    expect(entrevistasPage).toMatch(
      /supabase\.rpc\(\s*"agendar_entrevista_fraterna"[\s\S]{0,400}p_instituicao_id/,
    );
  });

  it("CartaAgendamento.tsx: fn_entrevistas_operacional envia p_instituicao_id", () => {
    expect(cartaSrc).toMatch(
      /supabase\.rpc\(\s*"fn_entrevistas_operacional"[\s\S]{0,400}p_instituicao_id/,
    );
  });
});

describe("SAAS-05-E3 — Assinaturas legadas preservadas (backward-compat)", () => {
  const readAllMigrations = () => {
    const files = readdirSync(join(ROOT, MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    return files.map((f) => read(join(MIGRATIONS_DIR, f))).join("\n---\n");
  };
  const all = readAllMigrations();

  it.each([
    "agendar_entrevista_fraterna(uuid, timestamptz, text, text)",
    "fn_entrevistas_operacional(timestamptz, timestamptz, uuid)",
    "fn_registrar_aviso_ausencia(text, uuid, text)",
    "fn_tratar_aviso_ausencia(uuid, text, text)",
    "fn_avisos_ausencia_pendentes(boolean)",
  ])("mantém referência à assinatura legada %s", (sig) => {
    expect(all).toContain(sig);
  });
});
