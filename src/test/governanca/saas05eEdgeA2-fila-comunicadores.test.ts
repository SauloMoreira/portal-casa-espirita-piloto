/**
 * SAAS-05-E-EDGE-A2 — Overloads tenant-aware para fila_humana_pendente
 * e comunicadores_elegiveis + adaptação da central-fila-alerta.
 *
 * Valida estruturalmente (sem banco):
 *   1. Migration cria overloads com p_instituicao_id (NOT NULL 22023),
 *      validação auth-condicional (auth.uid IS NOT NULL → membership OR
 *      platform_admin, 42501), SET LOCAL app.current_instituicao e filtro
 *      explícito por tenant (assistidos.instituicao_id / voluntarios.instituicao_id).
 *   2. Overloads foram REVOKE de PUBLIC/anon e GRANT a authenticated + service_role.
 *   3. Assinaturas legadas preservadas.
 *   4. central-fila-alerta chama overload tenant-aware quando há tenantId
 *      e mantém fallback legado.
 *   5. Escopo: nenhuma outra edge function (notif/comunicacao/whatsapp/IA) foi tocada.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const MIGRATIONS_DIR = "supabase/migrations";
const TAG = "SAAS-05-E-EDGE-A2";

function findMigration(): string {
  const files = readdirSync(join(ROOT, MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const c = read(join(MIGRATIONS_DIR, f));
    if (c.includes(TAG)) return c;
  }
  throw new Error("Migration SAAS-05-E-EDGE-A2 não encontrada");
}

const migration = findMigration();
const centralFila = read("supabase/functions/central-fila-alerta/index.ts");

function blockOf(fn: string): string {
  const parts = migration.split(new RegExp(`FUNCTION public\\.${fn}\\(p_instituicao_id uuid\\)`));
  return (parts[1] ?? "").split("$function$;")[0] ?? "";
}

describe("SAAS-05-E-EDGE-A2 — Migration: overloads tenant-aware", () => {
  it.each(["fila_humana_pendente", "comunicadores_elegiveis"])(
    "cria overload de %s com p_instituicao_id uuid",
    (fn) => {
      const re = new RegExp(
        `CREATE OR REPLACE FUNCTION public\\.${fn}\\(p_instituicao_id uuid\\)`
      );
      expect(migration).toMatch(re);
    }
  );

  it.each(["fila_humana_pendente", "comunicadores_elegiveis"])(
    "%s valida p_instituicao_id NOT NULL com ERRCODE 22023",
    (fn) => {
      const block = blockOf(fn);
      expect(block).toMatch(/p_instituicao_id IS NULL/);
      expect(block).toMatch(/22023/);
    }
  );

  it.each(["fila_humana_pendente", "comunicadores_elegiveis"])(
    "%s valida membership OU platform_admin quando auth.uid() presente (42501)",
    (fn) => {
      const block = blockOf(fn);
      expect(block).toMatch(/auth\.uid\(\)/);
      expect(block).toMatch(/is_platform_admin/);
      expect(block).toMatch(/is_member_of_instituicao/);
      expect(block).toMatch(/42501/);
    }
  );

  it.each(["fila_humana_pendente", "comunicadores_elegiveis"])(
    "%s aplica SET LOCAL app.current_instituicao após validação",
    (fn) => {
      const block = blockOf(fn);
      expect(block).toMatch(/set_config\('app\.current_instituicao'/);
    }
  );

  it("fila_humana_pendente filtra por assistidos.instituicao_id (fail-closed sem assistido)", () => {
    const block = blockOf("fila_humana_pendente");
    expect(block).toMatch(/JOIN public\.whatsapp_conversas/);
    expect(block).toMatch(/JOIN public\.assistidos/);
    expect(block).toMatch(/a\.instituicao_id = p_instituicao_id/);
  });

  it("comunicadores_elegiveis filtra por voluntarios.instituicao_id", () => {
    const block = blockOf("comunicadores_elegiveis");
    expect(block).toMatch(/v\.instituicao_id = p_instituicao_id/);
  });

  it.each(["fila_humana_pendente", "comunicadores_elegiveis"])(
    "%s tem REVOKE de PUBLIC/anon e GRANT a authenticated + service_role",
    (fn) => {
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(uuid\\) FROM PUBLIC`));
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\(uuid\\) FROM anon`));
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(uuid\\) TO authenticated`));
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(uuid\\) TO service_role`));
    }
  );

  it("migration não altera RLS/policies/NOT NULL/cutover/tabelas T-DIR", () => {
    expect(migration).not.toMatch(/CREATE POLICY/i);
    expect(migration).not.toMatch(/DROP POLICY/i);
    expect(migration).not.toMatch(/ALTER TABLE[^;]*SET NOT NULL/i);
    expect(migration).not.toMatch(/CREATE TABLE/i);
    expect(migration).not.toMatch(/DROP TABLE/i);
  });
});

describe("SAAS-05-E-EDGE-A2 — central-fila-alerta usa overloads tenant-aware", () => {
  it("marca o recorte no arquivo", () => {
    expect(centralFila).toMatch(/SAAS-05-E-EDGE-A2/);
  });

  it("chama fila_humana_pendente com p_instituicao_id quando há tenantId", () => {
    expect(centralFila).toMatch(
      /rpc\("fila_humana_pendente",\s*\{\s*p_instituicao_id:\s*tenantId\s*\}\)/
    );
  });

  it("chama comunicadores_elegiveis com p_instituicao_id quando há tenantId", () => {
    expect(centralFila).toMatch(
      /rpc\("comunicadores_elegiveis",\s*\{\s*p_instituicao_id:\s*tenantId\s*\}\)/
    );
  });

  it("opera em loop por tenant, enumerando instituicoes", () => {
    expect(centralFila).toMatch(/from\("instituicoes"\)/);
    expect(centralFila).toMatch(/for \(const tenantId of tenantsIds\)/);
  });

  it("registra tenant_resolvido na auditoria em vez de null estático", () => {
    expect(centralFila).toMatch(/tenant_resolvido: tenantId/);
    expect(centralFila).toMatch(/saas05_e_edge_a2/);
  });

  it("remove o marcador de pendência do EDGE-A", () => {
    expect(centralFila).not.toMatch(/saas05_e_edge_a_pendencia/);
  });

  it("preserva fallback legado sem parâmetro (compat pré-cutover)", () => {
    // Quando tenantId é null, chama assinatura legada sem argumento.
    expect(centralFila).toMatch(/rpc\("fila_humana_pendente"\)/);
    expect(centralFila).toMatch(/rpc\("comunicadores_elegiveis"\)/);
  });
});

describe("SAAS-05-E-EDGE-A2 — escopo isolado", () => {
  const naoAlteradas = [
    "supabase/functions/notificacoes-dispatch/index.ts",
    "supabase/functions/comunicacao-dispatch/index.ts",
    "supabase/functions/whatsapp-inbound/index.ts",
    "supabase/functions/whatsapp-responder/index.ts",
    "supabase/functions/assistente-entrevista/index.ts",
    "supabase/functions/insights-dashboard/index.ts",
    "supabase/functions/ia-site-ingestao/index.ts",
    "supabase/functions/conteudo-imagem-ia/index.ts",
    "supabase/functions/checkin-publico/index.ts",
    "supabase/functions/alertas-operacionais/index.ts",
  ];
  it.each(naoAlteradas)("%s não menciona o marcador EDGE-A2", (path) => {
    expect(read(path)).not.toMatch(/SAAS-05-E-EDGE-A2/);
  });

  it("assinaturas legadas das RPCs permanecem disponíveis (docs)", () => {
    const doc = read("docs/SAAS-05-E-EDGE-A2-RPCS-FILA-COMUNICADORES.md");
    expect(doc).toMatch(/legada preservada/i);
    expect(doc).toMatch(/backward.compat/i);
  });
});
