/**
 * SAAS-05-E-EDGE-A — Contratos das edge functions do lote A tenant-aware.
 *
 * Valida estruturalmente (sem banco, sem runtime Deno) que:
 *   1. checkin-publico resolve tenant via sessoes_publicas.instituicao_id
 *      e faz fail-closed em divergência de tenant do assistido.
 *   2. alertas-operacionais opera em loop por instituição e carimba
 *      avisos_internos.instituicao_id.
 *   3. central-fila-alerta declara a pendência das RPCs legadas e restringe
 *      regras a instituicao_id IS NULL.
 *   4. Edge functions fora do lote (notificacoes-dispatch, comunicacao-dispatch,
 *      whatsapp-inbound/responder, IA) NÃO foram tocadas neste recorte.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const checkin = read("supabase/functions/checkin-publico/index.ts");
const alertas = read("supabase/functions/alertas-operacionais/index.ts");
const centralFila = read("supabase/functions/central-fila-alerta/index.ts");

describe("SAAS-05-E-EDGE-A — checkin-publico", () => {
  it("resolve tenant a partir de sessoes_publicas (nunca do payload)", () => {
    expect(checkin).toMatch(/sessaoInstituicaoId/);
    expect(checkin).toMatch(/\(sessao as any\)\.instituicao_id/);
  });

  it("no caminho assistido conhecido, faz fail-closed quando tenant do assistido diverge", () => {
    expect(checkin).toMatch(/Assistido não pertence à instituição desta sessão/);
    expect(checkin).toMatch(/reject\(403,/);
  });

  it("no caminho match por celular, restringe assistidos ao tenant da sessão", () => {
    expect(checkin).toMatch(
      /instituicao_id\.eq\.\$\{sessaoInstituicaoId\},instituicao_id\.is\.null/
    );
  });

  it("preserva rate-limit por IP em checkin_tentativas", () => {
    expect(checkin).toMatch(/checkin_tentativas/);
    expect(checkin).toMatch(/RATE_MAX_ATTEMPTS/);
  });

  it("marca o recorte na header do arquivo", () => {
    expect(checkin).toMatch(/SAAS-05-E-EDGE-A/);
  });
});

describe("SAAS-05-E-EDGE-A — alertas-operacionais", () => {
  it("enumera instituicoes e itera em loop por tenant", () => {
    expect(alertas).toMatch(/from\("instituicoes"\)/);
    expect(alertas).toMatch(/for \(const instId of instituicoesIds\)/);
  });

  it("resolve admins primeiro por instituicao_usuarios e faz fallback para user_roles", () => {
    expect(alertas).toMatch(/from\("instituicao_usuarios"\)/);
    expect(alertas).toMatch(/papel_local['"]?, ['"]admin/);
    expect(alertas).toMatch(/status['"]?, ['"]ativo/);
    expect(alertas).toMatch(/from\("user_roles"\)/);
  });

  it("escopa assistidos por instituicao_id antes de agregações", () => {
    expect(alertas).toMatch(/from\("assistidos"\)/);
    expect(alertas).toMatch(/\.eq\("instituicao_id", instId\)/);
    expect(alertas).toMatch(/\.in\("assistido_id", assistidoIds\)/);
  });

  it("dedupe e insert de avisos_internos carregam instituicao_id", () => {
    expect(alertas).toMatch(/dupQuery\.eq\("instituicao_id", instId\)/);
    expect(alertas).toMatch(/instituicao_id: instId/);
  });

  it("mantém fallback single-tenant quando não há instituições cadastradas", () => {
    expect(alertas).toMatch(/\[null\]/);
  });

  it("marca o recorte no arquivo", () => {
    expect(alertas).toMatch(/SAAS-05-E-EDGE-A/);
  });
});

describe("SAAS-05-E-EDGE-A — central-fila-alerta", () => {
  it("marca o recorte EDGE-A no arquivo (pendência fechada em EDGE-A2)", () => {
    // EDGE-A2 promoveu o arquivo a tenant-aware. O marcador EDGE-A2 substitui
    // a nota original de pendência do EDGE-A.
    expect(centralFila).toMatch(/SAAS-05-E-EDGE-A2?/);
  });

  it("restringe regras central_alerta_* a linhas globais (instituicao_id IS NULL)", () => {
    expect(centralFila).toMatch(/\.is\("instituicao_id", null\)/);
  });

  it("audita cada envio com marcador de tenant (evoluído em EDGE-A2)", () => {
    // EDGE-A gravava `tenant_resolvido: null` + `saas05_e_edge_a_pendencia`.
    // EDGE-A2 evolui para `tenant_resolvido: tenantId` + `saas05_e_edge_a2`.
    expect(centralFila).toMatch(/tenant_resolvido:/);
    expect(centralFila).toMatch(/saas05_e_edge_a2?/);
  });

  it("não chama overloads tenant-aware inexistentes (assinatura legada preservada)", () => {
    // Chama sem p_instituicao_id — correto enquanto overload não existe.
    expect(centralFila).toMatch(/\.rpc\("fila_humana_pendente"\)/);
    expect(centralFila).toMatch(/\.rpc\("comunicadores_elegiveis"\)/);
  });
});

describe("SAAS-05-E-EDGE-A — escopo isolado (EDGE-B/C/D intactos)", () => {
  const naoAlteradas = [
    "supabase/functions/notificacoes-dispatch/index.ts",
    "supabase/functions/comunicacao-dispatch/index.ts",
    "supabase/functions/whatsapp-inbound/index.ts",
    "supabase/functions/whatsapp-responder/index.ts",
    "supabase/functions/assistente-entrevista/index.ts",
    "supabase/functions/insights-dashboard/index.ts",
    "supabase/functions/ia-site-ingestao/index.ts",
    "supabase/functions/conteudo-imagem-ia/index.ts",
  ];

  it.each(naoAlteradas)("%s não menciona o marcador EDGE-A", (path) => {
    const src = read(path);
    expect(src).not.toMatch(/SAAS-05-E-EDGE-A/);
  });
});

describe("SAAS-05-E-EDGE-A — invariantes de escopo", () => {
  it("não introduz migration nova no lote", () => {
    // O recorte é edge-only. Se algum dia for necessário, deve ser justificado.
    const doc = read("docs/SAAS-05-E-EDGE-A-CHECKIN-ALERTAS-FILA.md");
    expect(doc).toMatch(/Não aplica NOT NULL/);
    expect(doc).toMatch(/Não faz cutover/);
  });
});
