/**
 * SAAS-05-E-EDGE-D — IA ampla tenant-aware.
 *
 * Valida estruturalmente (sem banco) que as edge functions de IA:
 *  - resolvem tenant via recurso pai ou payload (p_instituicao_id);
 *  - validam membership no tenant (ou platform_admin), com fail-closed;
 *  - registram audit_logs com tenant_resolvido/origem_tenant/marcador saas05_e_edge_d;
 *  - não recebem contexto cross-tenant nos prompts;
 *  - preservam EDGE-A/A2/B/C intocados;
 *  - não alteram RLS/policies/NOT NULL/cutover.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const assistente = read("supabase/functions/assistente-entrevista/index.ts");
const insights = read("supabase/functions/insights-dashboard/index.ts");
const siteIng = read("supabase/functions/ia-site-ingestao/index.ts");
const imagemIa = read("supabase/functions/conteudo-imagem-ia/index.ts");

const ARQUIVOS_IA = [
  ["assistente-entrevista", assistente],
  ["insights-dashboard", insights],
  ["ia-site-ingestao", siteIng],
  ["conteudo-imagem-ia", imagemIa],
] as const;

describe("SAAS-05-E-EDGE-D — marcação e auditoria em todas as edges IA", () => {
  it.each(ARQUIVOS_IA)("%s marca o recorte no arquivo", (_, src) => {
    expect(src).toMatch(/SAAS-05-E-EDGE-D/);
  });
  it.each(ARQUIVOS_IA)("%s registra marcador saas05_e_edge_d em audit_logs", (_, src) => {
    expect(src).toMatch(/marcador: "saas05_e_edge_d"/);
  });
  it.each(ARQUIVOS_IA)("%s registra tenant_resolvido e origem_tenant", (_, src) => {
    expect(src).toMatch(/tenant_resolvido:/);
    expect(src).toMatch(/origem_tenant:/);
  });
  it.each(ARQUIVOS_IA)("%s aplica fail-closed quando tenant é indeterminado", (_, src) => {
    expect(src).toMatch(/SAAS05_E_EDGE_D_TENANT_INDETERMINADO/);
  });
  it.each(ARQUIVOS_IA)("%s bloqueia membership inválido (TENANT_FORBIDDEN)", (_, src) => {
    expect(src).toMatch(/SAAS05_E_EDGE_D_TENANT_FORBIDDEN/);
    expect(src).toMatch(/is_platform_admin/);
    expect(src).toMatch(/instituicao_usuarios/);
  });
});

describe("SAAS-05-E-EDGE-D — assistente-entrevista", () => {
  it("resolve tenant via entrevistas_fraternas → assistidos.instituicao_id", () => {
    expect(assistente).toMatch(/from\("entrevistas_fraternas"\)[\s\S]*assistido_id/);
    expect(assistente).toMatch(/from\("assistidos"\)[\s\S]*instituicao_id/);
    expect(assistente).toMatch(/origemTenant = "entrevista"|origem_tenant: "entrevista"/);
  });
  it("registra acao SAAS05_E_EDGE_D_ASSISTENTE ao final", () => {
    expect(assistente).toMatch(/SAAS05_E_EDGE_D_ASSISTENTE/);
  });
});

describe("SAAS-05-E-EDGE-D — insights-dashboard", () => {
  it("exige p_instituicao_id no payload", () => {
    expect(insights).toMatch(/p_instituicao_id/);
  });
  it("injeta INSTITUICAO no prompt para escopar contexto", () => {
    expect(insights).toMatch(/INSTITUICAO \(tenant escopo obrigat/);
  });
  it("registra acao SAAS05_E_EDGE_D_INSIGHTS", () => {
    expect(insights).toMatch(/SAAS05_E_EDGE_D_INSIGHTS/);
  });
});

describe("SAAS-05-E-EDGE-D — ia-site-ingestao", () => {
  it("exige p_instituicao_id (ou instituicao_id) no payload", () => {
    expect(siteIng).toMatch(/p_instituicao_id/);
  });
  it("propaga instituicao_id no preview retornado", () => {
    expect(siteIng).toMatch(/instituicao_id: tenantResolvido/);
  });
  it("registra acao SAAS05_E_EDGE_D_SITE_INGESTAO", () => {
    expect(siteIng).toMatch(/SAAS05_E_EDGE_D_SITE_INGESTAO/);
  });
});

describe("SAAS-05-E-EDGE-D — conteudo-imagem-ia", () => {
  it("segrega storage por tenant no path", () => {
    expect(imagemIa).toMatch(/conteudo-ia\/\$\{tenantResolvido\}\/\$\{user\.id\}/);
  });
  it("exige p_instituicao_id no payload", () => {
    expect(imagemIa).toMatch(/p_instituicao_id/);
  });
  it("registra acao SAAS05_E_EDGE_D_IMAGEM", () => {
    expect(imagemIa).toMatch(/SAAS05_E_EDGE_D_IMAGEM/);
  });
});

describe("SAAS-05-E-EDGE-D — escopo isolado (EDGE-A/A2/B/C intactos)", () => {
  const intactas = [
    "supabase/functions/checkin-publico/index.ts",
    "supabase/functions/alertas-operacionais/index.ts",
    "supabase/functions/central-fila-alerta/index.ts",
    "supabase/functions/notificacoes-dispatch/index.ts",
    "supabase/functions/comunicacao-dispatch/index.ts",
    "supabase/functions/whatsapp-inbound/index.ts",
    "supabase/functions/whatsapp-responder/index.ts",
  ];
  it.each(intactas)("%s não introduz o marcador EDGE-D", (path) => {
    expect(read(path)).not.toMatch(/SAAS-05-E-EDGE-D/);
    expect(read(path)).not.toMatch(/saas05_e_edge_d/);
  });

  it("nenhum arquivo IA altera RLS/policies/NOT NULL", () => {
    for (const [, src] of ARQUIVOS_IA) {
      expect(src).not.toMatch(/CREATE POLICY/i);
      expect(src).not.toMatch(/DROP POLICY/i);
      expect(src).not.toMatch(/ALTER TABLE[\s\S]*SET NOT NULL/i);
    }
  });
});
