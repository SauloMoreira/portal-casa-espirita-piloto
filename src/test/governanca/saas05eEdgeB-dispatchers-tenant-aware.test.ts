/**
 * SAAS-05-E-EDGE-B — Dispatchers tenant-aware.
 *
 * Valida estruturalmente (sem banco):
 *  - notificacoes-dispatch resolve tenant via assistido e registra no log.
 *  - comunicacao-dispatch aplica fail-closed em tenant_mismatch.
 *  - Consentimento, opt-out, retry, idempotência e sent_at preservados.
 *  - Whatsapp inbound/responder e IA ampla NÃO foram tocados.
 *  - Sem alteração de RLS/policies/NOT NULL/cutover.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const notif = read("supabase/functions/notificacoes-dispatch/index.ts");
const com = read("supabase/functions/comunicacao-dispatch/index.ts");

describe("SAAS-05-E-EDGE-B — notificacoes-dispatch tenant-aware", () => {
  it("marca o recorte no arquivo", () => {
    expect(notif).toMatch(/SAAS-05-E-EDGE-B/);
  });

  it("resolve tenant do item via assistidos.instituicao_id", () => {
    expect(notif).toMatch(/resolverTenantDoItem/);
    expect(notif).toMatch(/from\("assistidos"\)[\s\S]*instituicao_id/);
  });

  it("propaga tenantCtx (tenant_resolvido/origem_tenant/marcador) no log", () => {
    expect(notif).toMatch(/tenant_resolvido/);
    expect(notif).toMatch(/origem_tenant/);
    expect(notif).toMatch(/saas05_e_edge_b/);
  });

  it("logFila aceita tenantCtx opcional e injeta no payload_enviado", () => {
    expect(notif).toMatch(/tenantCtx\?: \{\s*tenant_resolvido/);
    expect(notif).toMatch(/payload_enviado: enviadoComTenant/);
  });

  it("preserva idempotência: retry_count, sent_at e external_message_id intactos", () => {
    expect(notif).toMatch(/retry_count: nextRetry/);
    expect(notif).toMatch(/sent_at: new Date\(\)\.toISOString\(\)/);
    expect(notif).toMatch(/external_message_id: send\.externalMessageId/);
  });

  it("mantém opt-out e comunicação geral desativada como bloqueios", () => {
    expect(notif).toMatch(/erro: "opt_out"/);
    expect(notif).toMatch(/comunicacao_geral_desativada/);
  });

  it("continua chamando fn_fila_motivo_inelegivel (fonte única)", () => {
    expect(notif).toMatch(/rpc\("fn_fila_motivo_inelegivel"/);
  });
});

describe("SAAS-05-E-EDGE-B — comunicacao-dispatch tenant-aware", () => {
  it("marca o recorte no arquivo", () => {
    expect(com).toMatch(/SAAS-05-E-EDGE-B/);
  });

  it("carrega instituicao_id da comunicacao para escopo tenant", () => {
    expect(com).toMatch(/select\("id, mensagem, status, envio_status, instituicao_id"\)/);
  });

  it("bloqueia envio com motivo tenant_mismatch em ambiguidade cross-tenant", () => {
    expect(com).toMatch(/motivo: "tenant_mismatch"/);
    expect(com).toMatch(/SAAS05_E_EDGE_B_TENANT_MISMATCH/);
  });

  it("preserva consentimento e opt-out (whatsapp_ativo/consentimento_status)", () => {
    expect(com).toMatch(/whatsapp_ativo === false/);
    expect(com).toMatch(/consentimento_status === "revogado"/);
    expect(com).toMatch(/comunicacao_geral_ativa !== false/);
  });

  it("preserva retry/idempotência (retry_count, sent_at, external_message_id)", () => {
    expect(com).toMatch(/retry_count: nextRetry/);
    expect(com).toMatch(/sent_at: new Date\(\)\.toISOString\(\)/);
    expect(com).toMatch(/external_message_id: send\.externalMessageId/);
  });

  it("audita ENVIO_CONCLUIDO com tenant_resolvido e marcador saas05_e_edge_b", () => {
    expect(com).toMatch(/tenant_resolvido: \(com\.instituicao_id/);
    expect(com).toMatch(/marcador: "saas05_e_edge_b"/);
  });
});

describe("SAAS-05-E-EDGE-B — escopo isolado (fora do recorte)", () => {
  const naoAlteradas = [
    "supabase/functions/whatsapp-inbound/index.ts",
    "supabase/functions/whatsapp-responder/index.ts",
    "supabase/functions/assistente-entrevista/index.ts",
    "supabase/functions/insights-dashboard/index.ts",
    "supabase/functions/ia-site-ingestao/index.ts",
    "supabase/functions/conteudo-imagem-ia/index.ts",
  ];
  it.each(naoAlteradas)("%s não menciona o marcador EDGE-B", (path) => {
    expect(read(path)).not.toMatch(/SAAS-05-E-EDGE-B/);
  });

  it("nenhum código do recorte cria/altera policies, tabelas ou NOT NULL", () => {
    for (const src of [notif, com]) {
      expect(src).not.toMatch(/CREATE POLICY/i);
      expect(src).not.toMatch(/DROP POLICY/i);
      expect(src).not.toMatch(/ALTER TABLE[\s\S]*SET NOT NULL/i);
    }
  });
});
