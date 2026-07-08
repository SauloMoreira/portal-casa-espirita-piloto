/**
 * SAAS-05-G — Contrato de governança: validação E2E multi-tenant pós-cutover.
 *
 * Este recorte é validação/documentação. A suíte verifica, sem depender de banco vivo,
 * que:
 *  - o documento oficial existe e cobre a matriz exigida;
 *  - nenhuma migração nova foi introduzida sob o marcador SAAS-05-G;
 *  - nenhuma edge function foi alterada citando SAAS-05-G;
 *  - o inventário de RPCs legadas e o diagnóstico de fallbacks residuais estão presentes;
 *  - contratos multi-tenant do F3 (NOT NULL, shadow policies, autoacesso) permanecem íntegros;
 *  - a superfície tenant do frontend (TenantSwitcher, RequireInstituicao,
 *    useSelectedInstituicao, requireInstituicaoId) segue disponível.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs/SAAS-05-G-VALIDACAO-E2E-MULTITENANT.md");
const MIG_DIR = join(ROOT, "supabase/migrations");
const EDGE_DIR = join(ROOT, "supabase/functions");

const T_DIR = [
  "assistidos", "voluntarios", "palestras", "sessoes_publicas",
  "avisos_internos", "campanhas", "eventos", "acao_social_alimentos",
  "regras_operacionais", "excecoes_operacionais", "programacao_padrao",
  "configuracoes_gerais", "comunicacoes_institucionais",
];

const EDGES = [
  "checkin-publico", "alertas-operacionais", "central-fila-alerta",
  "notificacoes-dispatch", "comunicacao-dispatch", "whatsapp-inbound",
  "whatsapp-responder", "assistente-entrevista", "insights-dashboard",
  "ia-site-ingestao", "conteudo-imagem-ia",
];

describe("SAAS-05-G — documento oficial", () => {
  it("documento existe", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  const src = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";

  it("cobre fixtures sintéticas com dois tenants + perfis obrigatórios", () => {
    expect(src).toMatch(/Instituição A/);
    expect(src).toMatch(/Instituição B/);
    expect(src).toMatch(/admin local A/);
    expect(src).toMatch(/admin local B/);
    expect(src).toMatch(/sem vínculo/i);
    expect(src).toMatch(/vínculo inativo/i);
    expect(src).toMatch(/platform_admin/);
  });

  it("cobre as 13 T-DIR nominalmente", () => {
    for (const t of T_DIR) {
      expect(src, `T-DIR ausente no doc: ${t}`).toMatch(new RegExp(t));
    }
  });

  it("cobre validações RLS, NOT NULL, frontend, RPCs, edges, WhatsApp e IA", () => {
    expect(src).toMatch(/RLS/);
    expect(src).toMatch(/NOT\s+NULL/);
    expect(src).toMatch(/TenantSwitcher/);
    expect(src).toMatch(/RequireInstituicao/);
    expect(src).toMatch(/RPCs? tenant-aware/i);
    expect(src).toMatch(/edge/i);
    expect(src).toMatch(/whatsapp/i);
    expect(src).toMatch(/IA/);
  });

  it("cobre inventário de RPCs legadas para depreciação (sem remover neste recorte)", () => {
    expect(src).toMatch(/Inventário de RPCs legadas/i);
    expect(src).toMatch(/SAAS-05-H/);
    expect(src).toMatch(/Nenhuma RPC legada.*(remov|revog)/i);
  });

  it("cobre revisão dos fallbacks residuais mantidos no F3", () => {
    expect(src).toMatch(/fallback/i);
    expect(src).toMatch(/central-fila-alerta/);
    expect(src).toMatch(/whatsapp-inbound/);
    expect(src).toMatch(/alertas-operacionais/);
    expect(src).toMatch(/fail-closed/i);
  });

  it("registra indicadores 0028/0025/0029 com delta zero", () => {
    expect(src).toMatch(/0028/);
    expect(src).toMatch(/0025/);
    expect(src).toMatch(/0029/);
    expect(src).toMatch(/\+0/);
  });

  it("confirma dados reais não migrados e FER original intocado", () => {
    expect(src).toMatch(/Nenhum dado real migrado/i);
    expect(src).toMatch(/projeto FER original.*intocado/i);
  });
});

describe("SAAS-05-G — recorte não-invasivo", () => {
  it("não introduz migração nova sob marcador SAAS-05-G", () => {
    const migs = readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => readFileSync(join(MIG_DIR, f), "utf8").includes("SAAS-05-G"));
    expect(migs, `Migrações inesperadas: ${migs.join(", ")}`).toEqual([]);
  });

  it("não altera edge functions citando SAAS-05-G", () => {
    for (const e of EDGES) {
      const p = join(EDGE_DIR, e, "index.ts");
      if (!existsSync(p)) continue;
      const s = readFileSync(p, "utf8");
      expect(s, `${e} não pode citar SAAS-05-G`).not.toMatch(/SAAS-05-G/);
    }
  });
});

describe("SAAS-05-G — contratos multi-tenant do F3 preservados", () => {
  const f3Src = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
    .filter((s) => s.includes("SAAS-05-F3"))
    .join("\n");

  it("NOT NULL do F3 continua declarado nas 13 T-DIR", () => {
    for (const t of T_DIR) {
      const rx = new RegExp(
        `ALTER\\s+TABLE\\s+public\\.${t}\\s+ALTER\\s+COLUMN\\s+instituicao_id\\s+SET\\s+NOT\\s+NULL`,
        "i",
      );
      expect(rx.test(f3Src), `NOT NULL ausente em ${t}`).toBe(true);
    }
  });

  it("shadow_tenant_all_ não é dropada em nenhuma migração", () => {
    const all = readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
      .join("\n");
    for (const t of T_DIR) {
      const rx = new RegExp(`DROP\\s+POLICY[\\s\\S]{0,80}shadow_tenant_all_${t}`, "i");
      expect(rx.test(all), `shadow_tenant_all_${t} foi dropada`).toBe(false);
    }
  });
});

describe("SAAS-05-G — superfície tenant frontend disponível", () => {
  const arqs = [
    "src/components/TenantSwitcher.tsx",
    "src/components/RequireInstituicao.tsx",
    "src/hooks/useSelectedInstituicao.ts",
  ];
  it("componentes/hook de tenant existem", () => {
    for (const a of arqs) {
      expect(existsSync(join(ROOT, a)), `Ausente: ${a}`).toBe(true);
    }
  });

  it("services ajustados no F3 continuam importando requireInstituicaoId", () => {
    const svc = [
      "src/services/acaoSocial.ts",
      "src/services/campanhas.ts",
      "src/services/eventos.ts",
      "src/services/comunicacaoInstitucional.ts",
    ];
    for (const p of svc) {
      const s = readFileSync(join(ROOT, p), "utf8");
      expect(s, `${p} deve importar requireInstituicaoId`).toMatch(/requireInstituicaoId/);
    }
  });
});
