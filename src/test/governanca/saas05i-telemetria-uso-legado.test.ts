/**
 * SAAS-05-I — Contrato de governança: telemetria de uso legado e fallbacks.
 *
 * Valida, sem depender de banco vivo, que:
 *  - existe migração marcada SAAS-05-I;
 *  - a migração cria as tabelas de telemetria com RLS admin-only;
 *  - os helpers SECURITY DEFINER existem com EXCEPTION handler engolindo erros;
 *  - EXECUTE dos helpers está revogado de PUBLIC e concedido a authenticated/service_role;
 *  - as edges alvo (central-fila-alerta, alertas-operacionais, whatsapp-inbound)
 *    invocam os helpers nos pontos previstos;
 *  - nenhuma RPC legada foi revogada e nenhum fallback foi removido;
 *  - contratos do F3 (NOT NULL, shadow policies) permanecem íntegros.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs/SAAS-05-I-TELEMETRIA-USO-LEGADO.md");
const MIG_DIR = join(ROOT, "supabase/migrations");
const EDGE_DIR = join(ROOT, "supabase/functions");

const ALL_MIG_SRC = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n");

const I_MIG_SRC = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .filter((s) => s.includes("SAAS-05-I"))
  .join("\n");

describe("SAAS-05-I — migração de telemetria", () => {
  it("existe migração marcada SAAS-05-I", () => {
    expect(I_MIG_SRC.length).toBeGreaterThan(0);
  });

  it("cria tabelas saas05_i_legacy_rpc_events e saas05_i_fallback_events", () => {
    expect(I_MIG_SRC).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.saas05_i_legacy_rpc_events/i);
    expect(I_MIG_SRC).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+public\.saas05_i_fallback_events/i);
  });

  it("aplica GRANT + RLS + policy admin-only nas duas tabelas", () => {
    for (const t of ["saas05_i_legacy_rpc_events", "saas05_i_fallback_events"]) {
      expect(I_MIG_SRC).toMatch(new RegExp(`GRANT\\s+SELECT\\s+ON\\s+public\\.${t}\\s+TO\\s+authenticated`, "i"));
      expect(I_MIG_SRC).toMatch(new RegExp(`GRANT\\s+ALL\\s+ON\\s+public\\.${t}\\s+TO\\s+service_role`, "i"));
      expect(I_MIG_SRC).toMatch(new RegExp(`ALTER\\s+TABLE\\s+public\\.${t}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"));
      expect(I_MIG_SRC).toMatch(new RegExp(`CREATE\\s+POLICY\\s+"${t}_admin_select"`, "i"));
    }
  });

  it("cria helpers fn_saas05_i_log_legacy_rpc e fn_saas05_i_log_fallback SECURITY DEFINER com EXCEPTION handler", () => {
    for (const fn of ["fn_saas05_i_log_legacy_rpc", "fn_saas05_i_log_fallback"]) {
      const rx = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}\\b[\\s\\S]{0,1500}SECURITY\\s+DEFINER[\\s\\S]{0,1500}EXCEPTION\\s+WHEN\\s+OTHERS\\s+THEN`, "i");
      expect(rx.test(I_MIG_SRC), `${fn} deve existir com SECURITY DEFINER e EXCEPTION handler`).toBe(true);
    }
  });

  it("revoga EXECUTE dos helpers de PUBLIC e concede a authenticated/service_role", () => {
    for (const sig of [
      "fn_saas05_i_log_legacy_rpc(text, text, uuid, boolean, jsonb)",
      "fn_saas05_i_log_fallback(text, text, uuid, text, boolean, jsonb)",
    ]) {
      const esc = sig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(I_MIG_SRC).toMatch(new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${esc}\\s+FROM\\s+PUBLIC`, "i"));
      expect(I_MIG_SRC).toMatch(new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${esc}\\s+TO\\s+authenticated,\\s*service_role`, "i"));
    }
  });

  it("não revoga EXECUTE de nenhuma RPC de negócio (não-destrutiva)", () => {
    // A migração I não deve tocar em RPCs de negócio; só nos próprios helpers.
    const revokes = Array.from(I_MIG_SRC.matchAll(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.([a-z0-9_]+)/gi));
    for (const m of revokes) {
      expect(m[1]).toMatch(/^fn_saas05_i_log_/);
    }
  });

  it("não faz DROP FUNCTION nem DROP POLICY de tabela de negócio", () => {
    expect(I_MIG_SRC).not.toMatch(/DROP\s+FUNCTION/i);
    // Único DROP POLICY permitido é para as próprias policies IF EXISTS antes de recriar.
    const drops = Array.from(I_MIG_SRC.matchAll(/DROP\s+POLICY[^;]{0,200};/gi));
    for (const m of drops) {
      expect(m[0]).toMatch(/saas05_i_(legacy_rpc|fallback)_events/i);
    }
  });
});

describe("SAAS-05-I — edges instrumentadas", () => {
  const centralSrc = readFileSync(join(EDGE_DIR, "central-fila-alerta/index.ts"), "utf8");
  const alertasSrc = readFileSync(join(EDGE_DIR, "alertas-operacionais/index.ts"), "utf8");
  const inboundSrc = readFileSync(join(EDGE_DIR, "whatsapp-inbound/index.ts"), "utf8");

  it("central-fila-alerta registra fallback tenants_ids_vazio", () => {
    expect(centralSrc).toMatch(/fn_saas05_i_log_fallback/);
    expect(centralSrc).toMatch(/tenants_ids_vazio/);
    expect(centralSrc).toMatch(/central-fila-alerta/);
  });

  it("central-fila-alerta registra uso legado de fila_humana_pendente e comunicadores_elegiveis", () => {
    expect(centralSrc).toMatch(/fn_saas05_i_log_legacy_rpc[\s\S]{0,300}fila_humana_pendente/);
    expect(centralSrc).toMatch(/fn_saas05_i_log_legacy_rpc[\s\S]{0,300}comunicadores_elegiveis/);
  });

  it("alertas-operacionais registra fallback tenants_ids_vazio", () => {
    expect(alertasSrc).toMatch(/fn_saas05_i_log_fallback/);
    expect(alertasSrc).toMatch(/tenants_ids_vazio/);
    expect(alertasSrc).toMatch(/"alertas-operacionais"/);
  });

  it("whatsapp-inbound registra fallback tenant_ambiguo", () => {
    expect(inboundSrc).toMatch(/fn_saas05_i_log_fallback/);
    expect(inboundSrc).toMatch(/tenant_ambiguo/);
    expect(inboundSrc).toMatch(/"whatsapp-inbound"/);
  });

  it("nenhuma edge removeu chamada de fallback existente (bloco legado preservado)", () => {
    expect(centralSrc).toMatch(/admin\.rpc\("fila_humana_pendente"\)/);
    expect(centralSrc).toMatch(/admin\.rpc\("comunicadores_elegiveis"\)/);
    expect(inboundSrc).toMatch(/origemTenant = "ambiguo_multi_tenant"/);
  });
});

describe("SAAS-05-I — documento oficial", () => {
  it("documento existe e cobre escopo completo", () => {
    expect(existsSync(DOC)).toBe(true);
    const src = readFileSync(DOC, "utf8");
    expect(src).toMatch(/saas05_i_legacy_rpc_events/);
    expect(src).toMatch(/saas05_i_fallback_events/);
    expect(src).toMatch(/fn_saas05_i_log_legacy_rpc/);
    expect(src).toMatch(/fn_saas05_i_log_fallback/);
    expect(src).toMatch(/central-fila-alerta/);
    expect(src).toMatch(/alertas-operacionais/);
    expect(src).toMatch(/whatsapp-inbound/);
    expect(src).toMatch(/tenants_ids_vazio/);
    expect(src).toMatch(/tenant_ambiguo/);
    expect(src).toMatch(/Critérios objetivos para revogação/i);
    expect(src).toMatch(/projeto FER original.*intocado/i);
    expect(src).toMatch(/Nenhum dado real migrado/i);
    expect(src).toMatch(/0028/);
    expect(src).toMatch(/0025/);
    expect(src).toMatch(/0029/);
  });
});

describe("SAAS-05-I — contratos F3 preservados", () => {
  const T_DIR = [
    "assistidos", "voluntarios", "palestras", "sessoes_publicas",
    "avisos_internos", "campanhas", "eventos", "acao_social_alimentos",
    "regras_operacionais", "excecoes_operacionais", "programacao_padrao",
    "configuracoes_gerais", "comunicacoes_institucionais",
  ];

  it("NOT NULL do F3 continua presente nas 13 T-DIR", () => {
    for (const t of T_DIR) {
      const rx = new RegExp(
        `ALTER\\s+TABLE\\s+public\\.${t}\\s+ALTER\\s+COLUMN\\s+instituicao_id\\s+SET\\s+NOT\\s+NULL`,
        "i",
      );
      expect(rx.test(ALL_MIG_SRC), `NOT NULL ausente em ${t}`).toBe(true);
    }
  });

  it("nenhuma shadow_tenant_all_ foi dropada", () => {
    for (const t of T_DIR) {
      const rx = new RegExp(`DROP\\s+POLICY[\\s\\S]{0,80}shadow_tenant_all_${t}`, "i");
      expect(rx.test(ALL_MIG_SRC), `shadow_tenant_all_${t} foi dropada`).toBe(false);
    }
  });
});
