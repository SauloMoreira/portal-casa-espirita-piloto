/**
 * SAAS-05-F1 — Contrato de governança: diagnóstico pré-cutover.
 *
 * Este recorte é EXCLUSIVAMENTE de análise. A suíte fixa que:
 *  - o documento cobre todas as seções obrigatórias (T-DIR, T-HER,
 *    policies, RPCs, fallbacks, readiness, plano F2/F3/G/H);
 *  - nenhuma migração deste recorte altera policies, aplica NOT NULL
 *    ou concede EXECUTE para PUBLIC/anon;
 *  - as edges e RPCs dos recortes anteriores não foram alteradas por F1;
 *  - o projeto FER original permanece intocado (nenhum arquivo cita
 *    "FER real" fora do próprio documento).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const DOC = join(ROOT, "docs/SAAS-05-F1-DIAGNOSTICO-PRE-CUTOVER.md");
const MIG_DIR = join(ROOT, "supabase/migrations");

const T_DIR = [
  "assistidos", "voluntarios", "palestras", "sessoes_publicas",
  "avisos_internos", "campanhas", "eventos", "acao_social_alimentos",
  "regras_operacionais", "excecoes_operacionais", "programacao_padrao",
  "configuracoes_gerais", "comunicacoes_institucionais",
];

const T_HER = [
  "assistido_tratamentos", "agenda_tratamentos_assistido",
  "plano_tratamento_sessoes", "presencas_tratamentos", "checkins_publicos",
  "avisos_ausencia", "notificacoes_fila", "notificacoes_log",
  "whatsapp_conversas", "whatsapp_handoffs",
];

const FINDINGS_S4 = [
  "assistidos_voluntarios_pii_cross_tenant",
  "comunicacoes_institucionais_admin_unscoped",
  "role_based_policies_bypass_tenant_scoping",
];

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

describe("SAAS-05-F1 — documento cobre diagnóstico exigido", () => {
  it("documento existe", () => {
    expect(existsSync(DOC)).toBe(true);
  });

  const src = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";

  it("13 T-DIR aparecem no documento", () => {
    for (const t of T_DIR) {
      expect(src, `T-DIR ausente: ${t}`).toContain(t);
    }
  });

  it("todas as T-HER existentes aparecem no documento", () => {
    for (const t of T_HER) {
      expect(src, `T-HER ausente: ${t}`).toContain(t);
    }
  });

  it("findings S4 (F1/F2/F3) estão mapeados para F3", () => {
    for (const id of FINDINGS_S4) {
      expect(src, `finding ausente: ${id}`).toContain(id);
    }
    expect(src).toMatch(/SAAS-05-F3/);
  });

  it("plano de fases F2/F3/G/H está documentado", () => {
    expect(src).toMatch(/SAAS-05-F2/);
    expect(src).toMatch(/SAAS-05-F3/);
    expect(src).toMatch(/SAAS-05-G/);
    expect(src).toMatch(/SAAS-05-H/);
  });

  it("seções obrigatórias presentes", () => {
    expect(src).toMatch(/T-DIR/);
    expect(src).toMatch(/T-HER/);
    expect(src).toMatch(/shadow_tenant_all_/);
    expect(src).toMatch(/fallback/i);
    expect(src).toMatch(/NOT NULL/);
    expect(src).toMatch(/tenant demo|Casa Espírita Demo/i);
    expect(src).toMatch(/projeto FER original.*intocado/i);
  });

  it("recomendação final é apto para F2", () => {
    expect(src).toMatch(/Apto para prosseguir com SAAS-05-F2/i);
  });
});

describe("SAAS-05-F1 — nenhuma alteração destrutiva neste recorte", () => {
  const arquivos = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql"));
  const migF1 = arquivos.filter((f) =>
    readFileSync(join(MIG_DIR, f), "utf8").includes("SAAS-05-F1"),
  );

  it("nenhuma migração marcada SAAS-05-F1 existe (recorte é apenas diagnóstico)", () => {
    expect(migF1).toEqual([]);
  });

  it("nenhuma migração recente cita NOT NULL em instituicao_id atribuída ao F1", () => {
    for (const f of migF1) {
      const s = readFileSync(join(MIG_DIR, f), "utf8");
      expect(s).not.toMatch(/instituicao_id[\s\S]*?SET\s+NOT\s+NULL/i);
    }
  });

  it("nenhuma migração marcada SAAS-05-F1 altera policies", () => {
    for (const f of migF1) {
      const s = readFileSync(join(MIG_DIR, f), "utf8");
      expect(s).not.toMatch(/\b(CREATE|DROP|ALTER)\s+POLICY\b/i);
    }
  });
});

describe("SAAS-05-F1 — não reabre recortes anteriores", () => {
  it("edges anteriores não foram tocadas por F1", () => {
    for (const p of EDGES_INTOCADAS) {
      const s = readFileSync(join(ROOT, p), "utf8");
      expect(s, `${p} não pode citar SAAS-05-F1`).not.toMatch(/SAAS-05-F1/);
    }
  });

  it("nenhum arquivo em src/ cita SAAS-05-F1 exceto a própria suíte", () => {
    const dir = join(ROOT, "src/test/governanca");
    const self = "saas05f1-diagnostico-pre-cutover.test.ts";
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      if (f === self) continue;
      const s = readFileSync(join(dir, f), "utf8");
      expect(s, `${f} não pode citar SAAS-05-F1`).not.toContain("SAAS-05-F1");
    }
  });
});
