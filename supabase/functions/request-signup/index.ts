import { createLogger } from "../_shared/logger.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

/**
 * SAAS-06-C1-STAB10-C.0 — Bloqueio temporário fail-closed do autocadastro
 * público genérico.
 *
 * Esta função foi cirurgicamente desativada. Ela responde SEMPRE com
 * HTTP 200 + `{ success:false, code:"CADASTRO_TEMPORARIAMENTE_INDISPONIVEL" }`
 * ANTES de qualquer escrita:
 *  - nunca chama `auth.admin.createUser`
 *  - nunca insere em `profiles`
 *  - nunca insere em `cadastro_solicitacoes`
 *  - nunca grava em `audit_logs`
 *
 * O HTTP 200 garante que bundles antigos em cache consigam ler `data.error`.
 *
 * O log NÃO registra e-mail, nome, CPF, celular, senha, IP nem body — apenas
 * o evento e o requestId gerado pelo logger.
 *
 * O caminho canônico para provisionar acesso de assistidos permanece a Edge
 * Function `provisionar-acesso-assistido` (STAB10-A/A.1/A.2).
 */
Deno.serve((req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const log = createLogger("request-signup", req);
  log.info("public_signup_temporarily_blocked", {});

  const body = {
    success: false,
    code: "CADASTRO_TEMPORARIAMENTE_INDISPONIVEL",
    error:
      "O cadastro público está temporariamente indisponível. Entre em contato com a casa espírita para solicitar seu acesso.",
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
