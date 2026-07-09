/**
 * SAAS-06-C1-FIX08 — Mapa central de erros técnicos → mensagens amigáveis.
 *
 * Recebe o objeto de erro devolvido pelo Supabase (PostgREST/PgClient) e devolve
 * uma mensagem em português, sem vazar termos técnicos como "row-level security",
 * "policy", nome de tabela ou SQLSTATE ao usuário final.
 *
 * O código técnico curto (ex.: RLS_ASSISTIDOS_INSERT_DENIED) fica disponível
 * para exibição discreta em "Detalhes técnicos para suporte" e log interno.
 */

export interface FriendlyError {
  /** Mensagem pronta para exibir ao usuário. */
  message: string;
  /** Código técnico curto, para suporte/logs. */
  code: string;
  /** Operação de negócio em curso (ex.: cadastrar_assistido). */
  operacao: string;
  /** Entidade lógica (ex.: assistidos, voluntarios). */
  entidade: string;
  /** Mensagem bruta original — nunca exibir direto ao usuário. */
  raw?: string;
}

export interface FriendlyErrorContext {
  operacao: string;
  entidade: string;
  /** Prefixo do código técnico (default = ENTIDADE em maiúsculas). */
  codePrefix?: string;
  /** Ação em curso (INSERT/UPDATE/DELETE/READ) — apenas para código técnico. */
  acao?: "INSERT" | "UPDATE" | "DELETE" | "READ" | "OPERATION";
  /** Instituição atual (uuid), se aplicável, para log interno. */
  instituicaoId?: string | null;
}

const MSG_PERMISSION_ASSISTIDOS =
  "Você não possui permissão para cadastrar assistidos nesta instituição.";
const MSG_PERMISSION_GENERIC =
  "Você não possui permissão para executar esta operação nesta instituição.";
const MSG_TENANT_AUSENTE =
  "Não foi possível identificar a instituição atual. Selecione uma instituição e tente novamente.";
const MSG_CAMPO_OBRIG =
  "Preencha os campos obrigatórios antes de continuar.";
const MSG_DUPLICIDADE =
  "Já existe um cadastro com essas informações.";
const MSG_INESPERADO =
  "Não foi possível salvar no momento. Tente novamente. Se o problema continuar, envie este erro ao administrador geral da plataforma.";

/**
 * Erro sinalizado pelo front quando não há instituição ativa. Não vem do banco.
 */
export const TENANT_AUSENTE_ERROR = Object.freeze({
  code: "TENANT_AUSENTE",
  message: MSG_TENANT_AUSENTE,
});

interface SupabaseLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

function looksLikeRls(err: SupabaseLikeError): boolean {
  const msg = `${err.message ?? ""} ${err.details ?? ""}`.toLowerCase();
  return (
    err.code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("row level security") ||
    msg.includes("violates policy")
  );
}

function looksLikeMissingRequired(err: SupabaseLikeError): boolean {
  return err.code === "23502"; // not_null_violation
}

function looksLikeDuplicate(err: SupabaseLikeError): boolean {
  return err.code === "23505"; // unique_violation
}

function looksLikeCheckConstraint(err: SupabaseLikeError): boolean {
  return err.code === "23514";
}

function makeCode(ctx: FriendlyErrorContext, suffix: string): string {
  const prefix = (ctx.codePrefix ?? ctx.entidade).toUpperCase();
  const acao = ctx.acao ?? "OPERATION";
  return `${prefix}_${acao}_${suffix}`;
}

/**
 * Traduz erro do Supabase em mensagem amigável + código técnico.
 */
export function toFriendlyError(
  error: unknown,
  ctx: FriendlyErrorContext,
): FriendlyError {
  const err = (error ?? {}) as SupabaseLikeError;
  const raw = err.message ?? undefined;
  const base = {
    operacao: ctx.operacao,
    entidade: ctx.entidade,
    raw,
  };

  // Marcador explícito do front: tenant ausente.
  if ((err as { code?: string }).code === TENANT_AUSENTE_ERROR.code) {
    return { ...base, message: MSG_TENANT_AUSENTE, code: TENANT_AUSENTE_ERROR.code };
  }

  if (looksLikeRls(err)) {
    const isAssistidos = ctx.entidade.toLowerCase() === "assistidos";
    return {
      ...base,
      message: isAssistidos ? MSG_PERMISSION_ASSISTIDOS : MSG_PERMISSION_GENERIC,
      code: makeCode(ctx, "DENIED"),
    };
  }

  if (looksLikeDuplicate(err)) {
    return { ...base, message: MSG_DUPLICIDADE, code: makeCode(ctx, "DUPLICATE") };
  }

  if (looksLikeMissingRequired(err) || looksLikeCheckConstraint(err)) {
    return { ...base, message: MSG_CAMPO_OBRIG, code: makeCode(ctx, "REQUIRED") };
  }

  return { ...base, message: MSG_INESPERADO, code: makeCode(ctx, "UNEXPECTED") };
}

/**
 * Formata detalhes técnicos curtos, apropriados para copy-paste ao suporte.
 * Nunca inclui SQL bruto ou nome de tabela cru — só o código controlado.
 */
export function formatSupportDetails(err: FriendlyError): string {
  const linhas = [
    `Código: ${err.code}`,
    `Operação: ${err.operacao}`,
    `Entidade: ${err.entidade}`,
  ];
  return linhas.join("\n");
}
