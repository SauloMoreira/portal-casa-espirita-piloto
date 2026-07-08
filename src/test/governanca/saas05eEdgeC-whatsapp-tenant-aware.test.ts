/**
 * SAAS-05-E-EDGE-C — WhatsApp inbound/responder tenant-aware.
 *
 * Valida estruturalmente (sem banco):
 *  - whatsapp-inbound resolve tenant via assistidos.instituicao_id.
 *  - Telefone em >1 tenant → fail-closed com auditoria dedicada.
 *  - whatsapp-responder resolve tenant pela conversa e bloqueia atendente
 *    fora do tenant (exceto platform_admin).
 *  - Consentimento, opt-out, handoff, retry, idempotência preservados.
 *  - IA ampla (assistente-entrevista, insights-dashboard, ia-site-ingestao,
 *    conteudo-imagem-ia) permanece intocada.
 *  - Sem alteração de RLS/policies/NOT NULL/cutover.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const inbound = read("supabase/functions/whatsapp-inbound/index.ts");
const responder = read("supabase/functions/whatsapp-responder/index.ts");

describe("SAAS-05-E-EDGE-C — whatsapp-inbound tenant-aware", () => {
  it("marca o recorte no arquivo", () => {
    expect(inbound).toMatch(/SAAS-05-E-EDGE-C/);
  });

  it("seleciona instituicao_id junto com identificação por telefone", () => {
    expect(inbound).toMatch(
      /from\("assistidos"\)[\s\S]*select\("id, nome, celular, telefone, instituicao_id"\)/,
    );
  });

  it("detecta ambiguidade cross-tenant e falha fechada (sem escolher assistido)", () => {
    expect(inbound).toMatch(/tenantsDistintos\.length > 1/);
    expect(inbound).toMatch(/SAAS05_E_EDGE_C_TELEFONE_AMBIGUO/);
    expect(inbound).toMatch(/ambiguo_multi_tenant/);
  });

  it("registra tenant_resolvido, origem_tenant e marcador em audit_logs", () => {
    expect(inbound).toMatch(/SAAS05_E_EDGE_C_INBOUND/);
    expect(inbound).toMatch(/tenant_resolvido: tenantResolvido/);
    expect(inbound).toMatch(/origem_tenant: origemTenant/);
    expect(inbound).toMatch(/marcador: "saas05_e_edge_c"/);
  });

  it("preserva opt-out via preferências e consentimento", () => {
    expect(inbound).toMatch(/notificacoes_preferencias/);
    expect(inbound).toMatch(/consentimentos_comunicacao/);
    expect(inbound).toMatch(/opt_out_via_whatsapp/);
  });

  it("preserva handoff humano (whatsapp_handoffs)", () => {
    expect(inbound).toMatch(/whatsapp_handoffs/);
  });
});

describe("SAAS-05-E-EDGE-C — whatsapp-responder tenant-aware", () => {
  it("marca o recorte no arquivo", () => {
    expect(responder).toMatch(/SAAS-05-E-EDGE-C/);
  });

  it("resolve tenant via assistido vinculado à conversa", () => {
    expect(responder).toMatch(/from\("assistidos"\)[\s\S]*instituicao_id/);
    expect(responder).toMatch(/conversa\.assistido_id/);
  });

  it("bloqueia atendente fora do tenant (403) exceto platform_admin", () => {
    expect(responder).toMatch(/is_platform_admin/);
    expect(responder).toMatch(/instituicao_usuarios/);
    expect(responder).toMatch(/SAAS05_E_EDGE_C_RESPONDER_TENANT_MISMATCH/);
    expect(responder).toMatch(/status: 403/);
  });

  it("propaga tenant_resolvido/origem_tenant/marcador no notificacoes_log", () => {
    expect(responder).toMatch(/tenant_resolvido: tenantResolvido/);
    expect(responder).toMatch(/origem_tenant: origemTenant/);
    expect(responder).toMatch(/marcador: "saas05_e_edge_c"/);
  });

  it("mantém autor humano e atendente_id na trilha", () => {
    expect(responder).toMatch(/autor: "humano"/);
    expect(responder).toMatch(/atendente_id: userId/);
  });

  it("continua exigindo autenticação e papel (admin/coordenador)", () => {
    expect(responder).toMatch(/auth\.getUser/);
    expect(responder).toMatch(/"coordenador_de_tratamento"/);
  });
});

describe("SAAS-05-E-EDGE-C — escopo isolado (EDGE-D/IA intactos)", () => {
  const naoAlteradas = [
    "supabase/functions/assistente-entrevista/index.ts",
    "supabase/functions/insights-dashboard/index.ts",
    "supabase/functions/ia-site-ingestao/index.ts",
    "supabase/functions/conteudo-imagem-ia/index.ts",
  ];
  it.each(naoAlteradas)("%s não menciona o marcador EDGE-C", (path) => {
    expect(read(path)).not.toMatch(/SAAS-05-E-EDGE-C/);
  });

  it("não altera RLS/policies/NOT NULL em nenhum dos dois arquivos", () => {
    for (const src of [inbound, responder]) {
      expect(src).not.toMatch(/CREATE POLICY/i);
      expect(src).not.toMatch(/DROP POLICY/i);
      expect(src).not.toMatch(/ALTER TABLE[\s\S]*SET NOT NULL/i);
    }
  });
});
