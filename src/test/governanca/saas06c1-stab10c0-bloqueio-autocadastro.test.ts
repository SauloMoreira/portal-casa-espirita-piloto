import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SAAS-06-C1-STAB10-C.0 — Governança do bloqueio temporário do autocadastro
 * público. Verifica estaticamente:
 *
 *  - `request-signup` é fail-closed: retorna código temporário ANTES de
 *    qualquer escrita e não referencia mais `auth.admin.createUser`,
 *    `profiles`, `cadastro_solicitacoes` ou `audit_logs`.
 *  - Log não vaza dados sensíveis (nome/email/cpf/celular/senha).
 *  - Login.tsx não expõe link para `/cadastro`.
 *  - Página `/cadastro` não renderiza formulário nem chama a edge function.
 *
 * Não substitui teste funcional; complementa homologação read-only.
 */

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("STAB10-C.0 — request-signup fail-closed", () => {
  const src = read("supabase/functions/request-signup/index.ts");

  it("retorna código CADASTRO_TEMPORARIAMENTE_INDISPONIVEL", () => {
    expect(src).toMatch(/CADASTRO_TEMPORARIAMENTE_INDISPONIVEL/);
  });

  it("responde com HTTP 200 para bundles antigos", () => {
    expect(src).toMatch(/status:\s*200/);
  });

  it("não executa nenhuma escrita/side-effect", () => {
    expect(src).not.toMatch(/auth\.admin\.createUser/);
    expect(src).not.toMatch(/from\(\s*["']profiles["']/);
    expect(src).not.toMatch(/from\(\s*["']cadastro_solicitacoes["']/);
    expect(src).not.toMatch(/from\(\s*["']audit_logs["']/);
    expect(src).not.toMatch(/from\(\s*["']user_roles["']/);
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/deleteUser/);
  });

  it("não instancia service_role client", () => {
    expect(src).not.toMatch(/SERVICE_ROLE_KEY/);
    expect(src).not.toMatch(/createClient/);
  });

  it("registra evento de bloqueio sem dados pessoais", () => {
    expect(src).toMatch(/public_signup_temporarily_blocked/);
    // Sem persistência de nome/email/cpf/celular/senha/ip no corpo do log.
    const logCall = src.match(/log\.info\([^)]*\)/g)?.join("\n") ?? "";
    for (const forbidden of ["nome", "email", "cpf", "celular", "password", "ip"]) {
      expect(logCall.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("STAB10-C.0 — frontend oculta o autocadastro", () => {
  it("Login.tsx não linka mais para /cadastro", () => {
    const login = read("src/pages/Login.tsx");
    expect(login).not.toMatch(/to=["']\/cadastro["']/);
    expect(login).not.toMatch(/Solicitar cadastro/);
  });

  it("Login.tsx mantém recuperação de senha", () => {
    const login = read("src/pages/Login.tsx");
    expect(login).toMatch(/esqueci|Esqueci|forgot|Forgot|senha/i);
  });

  it("SolicitarCadastro.tsx é apenas aviso, sem formulário nem invoke", () => {
    const page = read("src/pages/SolicitarCadastro.tsx");
    expect(page).toMatch(/indispon[íi]vel/i);
    expect(page).not.toMatch(/functions\.invoke\(\s*["']request-signup["']/);
    expect(page).not.toMatch(/<form\b/i);
    expect(page).not.toMatch(/signInWithPassword/);
  });
});
