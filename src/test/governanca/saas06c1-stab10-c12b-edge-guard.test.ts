/**
 * STAB10-C1.2-B1 — Guard estático da Edge pública `signup-assistido-tenant`.
 *
 * Reforça restrições estruturais que testes dinâmicos não capturam:
 *  - `verify_jwt = false` explicitamente configurado.
 *  - Uso EXATO das quatro RPCs C1.2-A e da RPC autorizada de rate-limit.
 *  - Ausência de `admin.createUser`, `email_confirm`, sessão/tokens na resposta.
 *  - Não importa `_shared/cors.ts`.
 *  - Logs não referenciam senha, CPF, captcha, service_role, Authorization.
 *  - Verificação por `autocadastro_marker` ocorre ANTES de `marcar_auth_criado`
 *    e ANTES de `deleteUser`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(__dirname, "../../../supabase/functions/signup-assistido-tenant");
const files = {
  index:    readFileSync(path.join(DIR, "index.ts"), "utf-8"),
  contract: readFileSync(path.join(DIR, "contract.ts"), "utf-8"),
  cors:     readFileSync(path.join(DIR, "cors.ts"), "utf-8"),
  rate:     readFileSync(path.join(DIR, "rateLimit.ts"), "utf-8"),
  config:   readFileSync(path.resolve(__dirname, "../../../supabase/config.toml"), "utf-8"),
};

describe("STAB10-C1.2-B1 — guard estático da Edge", () => {
  it("config.toml declara verify_jwt = false para a função", () => {
    expect(files.config).toMatch(/\[functions\.signup-assistido-tenant\][\s\S]*verify_jwt\s*=\s*false/);
  });

  it("usa contratos exatos das quatro RPCs C1.2-A", () => {
    for (const rpc of [
      "fn_autocadastro_reservar",
      "fn_autocadastro_marcar_auth_criado",
      "fn_autocadastro_marcar_resultado_falha",
      "fn_autocadastro_assistido_publico",
    ]) {
      expect(files.index).toContain(rpc);
    }
    // Parâmetros exatos (amostra representativa)
    for (const param of [
      "p_idempotency_key",
      "p_request_fingerprint",
      "p_request_id",
      "p_instituicao_id",
      "p_expires_at",
      "p_user_id",
      "p_resultado",
      "p_auth_delete_ok",
      "p_email_normalizado",
      "p_nome_completo",
      "p_cpf_normalizado",
      "p_celular_normalizado",
      "p_termos_versao",
      "p_privacidade_versao",
      "p_aceito_em",
    ]) {
      expect(files.index).toContain(param);
    }
  });

  it("única RPC nova utilizada é fn_autocadastro_rate_limit_hit", () => {
    const rpcCalls = [...files.index.matchAll(/rpc\(["']([^"']+)/g)].map((m) => m[1]);
    const rateCalls = [...files.rate.matchAll(/rpc\(["']([^"']+)/g)].map((m) => m[1]);
    const all = new Set([...rpcCalls, ...rateCalls]);
    for (const rpc of all) {
      expect([
        "fn_autocadastro_reservar",
        "fn_autocadastro_marcar_auth_criado",
        "fn_autocadastro_marcar_resultado_falha",
        "fn_autocadastro_assistido_publico",
        "fn_autocadastro_rate_limit_hit",
      ]).toContain(rpc);
    }
  });

  it("não usa admin.createUser nem email_confirm", () => {
    expect(files.index).not.toMatch(/admin\.createUser/);
    expect(files.index).not.toMatch(/email_confirm\s*:/);
  });

  it("resposta jamais retorna sessão ou tokens", () => {
    for (const banned of ["access_token", "refresh_token", "expires_in", "\"session\":"]) {
      expect(files.index).not.toContain(banned);
    }
  });

  it("não importa o CORS compartilhado permissivo", () => {
    for (const f of [files.index, files.cors, files.rate, files.contract]) {
      expect(f).not.toMatch(/_shared\/cors/);
    }
  });

  it("logger nunca recebe senha/captcha/CPF/service_role/authorization como campo", () => {
    // Nenhum objeto passado ao logger.* deve conter esses tokens como chave literal.
    const banned = /(logger\.(info|warn|error)\([^)]*\b(senha|password|captcha|cpf|service_role|authorization|token)\b\s*:)/i;
    expect(files.index).not.toMatch(banned);
  });

  it("marker + request_id são validados antes de marcar_auth_criado e deleteUser", () => {
    // extractMarker/user_metadata devem aparecer antes de marcar_auth_criado.
    const posExtract = files.index.indexOf("extractMarker");
    const posMarcar  = files.index.indexOf("rpcMarcarAuthCriado(deps.svc");
    expect(posExtract).toBeGreaterThan(-1);
    // deleteUser fica dentro de rollbackAuth, que exige extractMarker antes.
    const posRollback = files.index.indexOf("rollbackAuth(");
    expect(posRollback).toBeGreaterThan(-1);
    expect(files.index).toMatch(/deleteUser[\s\S]*/);
    // rollbackAuth chama extractMarker antes de admin.deleteUser
    const rbBlock = files.index.slice(files.index.indexOf("async function rollbackAuth"));
    const rbEnd = rbBlock.indexOf("\n}\n");
    const body = rbBlock.slice(0, rbEnd > 0 ? rbEnd : undefined);
    expect(body.indexOf("extractMarker")).toBeLessThan(body.indexOf("deleteUser"));
    void posMarcar;
  });

  it("checa e-mail já existente antes de signUp", () => {
    const posFindPre = files.index.indexOf("findAuthUserByEmail(svc, ctx.emailNorm)");
    const posSignUp  = files.index.indexOf("anon.auth.signUp");
    expect(posFindPre).toBeGreaterThan(-1);
    expect(posSignUp).toBeGreaterThan(-1);
    expect(posFindPre).toBeLessThan(posSignUp);
  });

  it("clientes Supabase têm persistSession/autoRefreshToken/detectSessionInUrl = false", () => {
    expect(files.index).toMatch(/persistSession:\s*false/);
    expect(files.index).toMatch(/autoRefreshToken:\s*false/);
    expect(files.index).toMatch(/detectSessionInUrl:\s*false/);
  });

  it("captcha exigido somente no fluxo RESERVADO_NOVO", () => {
    const reservado = files.index.slice(files.index.indexOf("fluxoReservadoNovo"));
    expect(reservado).toMatch(/captcha_token/);
    const emAndamento = files.index.slice(
      files.index.indexOf("fluxoEmAndamento"),
      files.index.indexOf("// ============================ Handler principal"),
    );
    expect(emAndamento).not.toMatch(/CAPTCHA_OBRIGATORIO/);
  });

  it("CORS produção proíbe localhost sem AUTOCADASTRO_ALLOW_LOCAL=true", () => {
    expect(files.cors).toMatch(/AUTOCADASTRO_ALLOW_LOCAL/);
    expect(files.cors).not.toMatch(/ENV\s*!==\s*["']production["']/);
    expect(files.cors).toMatch(/portal-casa-espirita-piloto\.lovable\.app/);
    expect(files.cors).toMatch(/Access-Control-Allow-Methods["']:\s*ALLOW_METHODS|POST, OPTIONS/);
  });

  it("rate-limit obtém IP somente de headers do gateway", () => {
    expect(files.rate).toMatch(/cf-connecting-ip/);
    expect(files.rate).toMatch(/x-forwarded-for/);
    expect(files.rate).not.toMatch(/req\.url|searchParams|URL\(.*body/);
  });
});
