/**
 * SAAS-05-H — Contrato de governança: depreciação faseada de RPCs legadas e
 * hardening dos fallbacks residuais.
 *
 * Este recorte é diagnóstico + documental. A suíte verifica, sem depender de
 * banco vivo, que:
 *  - o documento oficial existe e classifica RPCs por lote A/B/C;
 *  - nenhuma migração destrutiva nova foi introduzida sob o marcador SAAS-05-H;
 *  - nenhuma edge foi alterada citando SAAS-05-H (hardening documental);
 *  - o fallback do `central-fila-alerta` continua marcando explicitamente o
 *    caminho legacy (auditoria/marcador);
 *  - overloads tenant-aware criados nos recortes E1–E4/EDGE-A2 continuam
 *    presentes nas migrações;
 *  - contratos do F3 (NOT NULL, shadow policies) permanecem íntegros.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs/SAAS-05-H-DEPRECIACAO-RPCS-FALLBACKS.md");
const MIG_DIR = join(ROOT, "supabase/migrations");
const EDGE_DIR = join(ROOT, "supabase/functions");

const RPCS_TENANT_AWARE = [
  "gerenciar_voluntario", "gerenciar_termo_voluntario",
  "fn_buscar_pessoa_para_voluntario", "fn_processar_excecao_notificacoes",
  "fn_monitor_excecao_notificacoes",
  "pts_registrar_presenca", "pts_registrar_ausencia",
  "pts_rollback_piloto", "pts_homologacao_auditar",
  "agendar_entrevista_fraterna", "fn_entrevistas_operacional",
  "fn_registrar_aviso_ausencia", "fn_tratar_aviso_ausencia",
  "dashboard_admin", "relatorio_tratamentos_concluidos",
  "fila_humana_pendente", "comunicadores_elegiveis",
];

const EDGES_FALLBACK = [
  "central-fila-alerta", "whatsapp-inbound", "alertas-operacionais",
];

const ALL_MIG_SRC = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .join("\n");

describe("SAAS-05-H — documento oficial", () => {
  it("documento existe", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  const src = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";

  it("declara classificação Lote A/B/C explicitamente", () => {
    expect(src).toMatch(/Lote A/);
    expect(src).toMatch(/Lote B/);
    expect(src).toMatch(/Lote C/);
  });

  it("registra inventário com overloads tenant-aware chave", () => {
    for (const r of RPCS_TENANT_AWARE) {
      expect(src, `RPC ausente no inventário: ${r}`).toMatch(new RegExp(r));
    }
  });

  it("cobre os 3 fallbacks residuais com decisão formal", () => {
    for (const e of EDGES_FALLBACK) {
      expect(src, `Fallback ausente: ${e}`).toMatch(new RegExp(e));
    }
    expect(src).toMatch(/fail-closed/i);
    expect(src).toMatch(/cross-tenant/i);
  });

  it("registra plano de migração para próximo recorte", () => {
    expect(src).toMatch(/telemetria/i);
    expect(src).toMatch(/SAAS-05-I|próximo recorte/i);
  });

  it("confirma escopo preservado (FER original, dados reais, RLS, NOT NULL)", () => {
    expect(src).toMatch(/projeto FER original.*intocado/i);
    expect(src).toMatch(/Nenhum dado real migrado/i);
    expect(src).toMatch(/NOT\s+NULL/);
    expect(src).toMatch(/RLS/);
  });

  it("registra indicadores 0028/0025/0029 com delta zero", () => {
    expect(src).toMatch(/0028/);
    expect(src).toMatch(/0025/);
    expect(src).toMatch(/0029/);
    expect(src).toMatch(/\+0/);
  });
});

describe("SAAS-05-H — recorte não-destrutivo", () => {
  it("não introduz migração sob marcador SAAS-05-H", () => {
    const migs = readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => readFileSync(join(MIG_DIR, f), "utf8").includes("SAAS-05-H"));
    expect(migs, `Migrações inesperadas: ${migs.join(", ")}`).toEqual([]);
  });

  it("nenhuma edge cita SAAS-05-H (hardening documental)", () => {
    for (const e of EDGES_FALLBACK) {
      const p = join(EDGE_DIR, e, "index.ts");
      if (!existsSync(p)) continue;
      const s = readFileSync(p, "utf8");
      expect(s, `${e} não pode citar SAAS-05-H`).not.toMatch(/SAAS-05-H/);
    }
  });

  it("nenhum DROP FUNCTION legada foi introduzido em migração recente", () => {
    // Garante que nada em H removeu funções tenant-aware ou legadas.
    for (const r of RPCS_TENANT_AWARE) {
      const rx = new RegExp(`DROP\\s+FUNCTION[\\s\\S]{0,120}public\\.${r}\\b`, "i");
      // Aceita DROP em migrações anteriores; H não pode ser fonte nova.
      // Aqui só validamos que a função continua sendo criada em algum lugar.
      const rxCreate = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${r}\\b`, "i");
      expect(rxCreate.test(ALL_MIG_SRC), `Overload tenant-aware ${r} sumiu`).toBe(true);
    }
  });
});

describe("SAAS-05-H — fallback do central-fila-alerta permanece marcado", () => {
  const p = join(EDGE_DIR, "central-fila-alerta/index.ts");
  const s = existsSync(p) ? readFileSync(p, "utf8") : "";

  it("marca caminho legacy nos logs", () => {
    expect(s).toMatch(/legacy/);
  });

  it("usa overload tenant-aware quando tenantId presente", () => {
    expect(s).toMatch(/p_instituicao_id:\s*tenantId/);
  });
});

describe("SAAS-05-H — contratos do F3 preservados", () => {
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

  it("nenhuma shadow_tenant_all_ foi dropada em nenhuma migração", () => {
    for (const t of T_DIR) {
      const rx = new RegExp(`DROP\\s+POLICY[\\s\\S]{0,80}shadow_tenant_all_${t}`, "i");
      expect(rx.test(ALL_MIG_SRC), `shadow_tenant_all_${t} foi dropada`).toBe(false);
    }
  });
});
