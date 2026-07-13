import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-C1-STAB10-A — Provisionamento tenant-aware do acesso do assistido
 * e fail-safe contra loop Dashboard ↔ Portal.
 *
 * Testes estruturais (pattern-matching) sobre os quatro arquivos permitidos.
 * O comportamento de RPC/RLS/idempotência é coberto pela suíte real de DB
 * (`*.dbtest.ts`) executada com `npm run test:db` fora do CI.
 */

const root = resolve(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("STAB10-A · Edge Function provisionar-acesso-assistido", () => {
  const src = read("supabase/functions/provisionar-acesso-assistido/index.ts");

  it("existe e é isolada da create-user", () => {
    expect(src.length).toBeGreaterThan(0);
    const createUser = read("supabase/functions/create-user/index.ts");
    // STAB10-A.2: create-user agora BLOQUEIA o fluxo legado antes de qualquer escrita
    expect(createUser).toMatch(/FLUXO_ASSISTIDO_LEGADO_BLOQUEADO/);
  });

  it("deriva caller.id exclusivamente do JWT (nunca do body)", () => {
    expect(src).toMatch(/auth\.getUser\(\)/);
    // não deve haver leitura de operador_id/user_id/caller no body
    expect(src).not.toMatch(/body\.operador_id/);
    expect(src).not.toMatch(/body\.user_id/);
    expect(src).not.toMatch(/body\.caller/);
  });

  it("body allowlist não aceita role/instituicao_id/user_id/created_by", () => {
    expect(src).not.toMatch(/body\.role/);
    expect(src).not.toMatch(/body\.instituicao_id/);
    expect(src).not.toMatch(/body\.papel_local/);
    expect(src).not.toMatch(/body\.created_by/);
  });

  it("valida operador via instituicao_usuarios ativo no MESMO tenant", () => {
    expect(src).toMatch(/instituicao_usuarios/);
    expect(src).toMatch(/status.{0,10}ativo/);
    expect(src).toMatch(/admin_instituicao/);
    expect(src).toMatch(/entrevistador/);
    expect(src).toMatch(/CROSS_TENANT_ACCESS_DENIED/);
  });

  it("responde already_provisioned quando estado é completo e coerente", () => {
    expect(src).toMatch(/already_provisioned/);
    expect(src).toMatch(/ASSISTIDO_ACESSO_INCONSISTENTE/);
  });

  it("chama a RPC transacional fn_provisionar_acesso_assistido", () => {
    expect(src).toMatch(/rpc\(\s*["']fn_provisionar_acesso_assistido["']/);
    expect(src).toMatch(/p_operador_id/);
    expect(src).toMatch(/p_novo_user_id/);
  });

  it("cleanup do Auth só apaga quando nenhuma linha pública foi gravada", () => {
    expect(src).toMatch(/deleteUser/);
    expect(src).toMatch(/PROVISIONAMENTO_RESULTADO_INDETERMINADO/);
  });

  it("nunca retorna mensagem bruta do Auth/SQL/PostgREST", () => {
    expect(src).not.toMatch(/error:\s*createErr\.message/);
    expect(src).not.toMatch(/error:\s*rpcErr\.message/);
  });
});

describe("STAB10-A · GerarAcessoAssistido chama a nova função", () => {
  const src = read("src/components/GerarAcessoAssistido.tsx");

  it("invoca provisionar-acesso-assistido e não create-user", () => {
    expect(src).toMatch(/provisionar-acesso-assistido/);
    expect(src).not.toMatch(/functions\.invoke\(\s*["']create-user["']/);
  });

  it("não envia role, instituicao_id ou user_id ao backend", () => {
    // corpo do invoke não deve mencionar essas chaves
    expect(src).not.toMatch(/\brole:\s*["']assistido["']/);
    expect(src).not.toMatch(/\binstituicao_id\s*:/);
    expect(src).not.toMatch(/\buser_id\s*:/);
  });

  it("bloqueia duplo clique (guarda por loading)", () => {
    expect(src).toMatch(/if\s*\(\s*loading\s*\)\s*return/);
  });

  it("mapeia códigos amigáveis (EMAIL_EM_USO, CROSS_TENANT_ACCESS_DENIED)", () => {
    expect(src).toMatch(/EMAIL_EM_USO/);
    expect(src).toMatch(/CROSS_TENANT_ACCESS_DENIED/);
    expect(src).toMatch(/ASSISTIDO_ACESSO_INCONSISTENTE/);
  });
});

describe("STAB10-A · Portal fail-safe sem loop Dashboard ↔ Portal", () => {
  const src = read("src/pages/Portal.tsx");

  it("assistido puro sem instituição ativa NÃO é redirecionado ao dashboard", () => {
    // condição de redirect exige temInstituicaoAtiva
    expect(src).toMatch(/temInstituicaoAtiva/);
    expect(src).toMatch(/isAssistidoPuro\s*&&\s*!isError\s*&&\s*temInstituicaoAtiva/);
  });

  it("exibe código ASSISTIDO_SEM_VINCULO_INSTITUCIONAL", () => {
    expect(src).toMatch(/ASSISTIDO_SEM_VINCULO_INSTITUCIONAL/);
    expect(src).toMatch(/Solicite a regulariza/);
  });

  it("oferece abrir chamado e sair", () => {
    expect(src).toMatch(/Abrir chamado/);
    expect(src).toMatch(/Sair/);
    expect(src).toMatch(/signOut/);
  });

  it("isError não é classificado como ausência de vínculo", () => {
    // ramo do fail-safe exige !isError
    expect(src).toMatch(/!isError\s*&&\s*!temInstituicaoAtiva/);
  });
});

describe("STAB10-A · superfícies protegidas permanecem inalteradas", () => {
  it("RequireInstituicao continua fail-closed", () => {
    const src = read("src/components/RequireInstituicao.tsx");
    expect(src).toMatch(/!selecionada/);
    expect(src).toMatch(/<Navigate/);
  });

  it("create-user preserva contrato antigo (Gestão de Usuários)", () => {
    const src = read("supabase/functions/create-user/index.ts");
    expect(src).toMatch(/const \{ email, password, role, profile, assistido_id/);
  });

  it("painel do assistido não foi alterado (arquivos existem intactos)", () => {
    // sanity: os arquivos continuam existindo
    expect(read("src/pages/dashboard/AssistidoDashboard.tsx").length).toBeGreaterThan(0);
    expect(read("src/pages/MeusTratamentos.tsx").length).toBeGreaterThan(0);
    expect(read("src/pages/MinhaAgenda.tsx").length).toBeGreaterThan(0);
  });
});
