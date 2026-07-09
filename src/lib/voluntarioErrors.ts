/**
 * SAAS-06-C1-FIX04 — Tradução amigável de erros do cadastro de voluntário.
 *
 * Nunca expõe mensagem técnica de RLS/Postgres ao usuário final. Mantém a
 * causa original apenas no console para diagnóstico.
 */
export function friendlyVoluntarioError(error: unknown): string {
  const raw = (error as { message?: string } | null)?.message ?? "";
  const code = (error as { code?: string } | null)?.code ?? "";
  const msg = raw.toLowerCase();

  // Falha de tenant (fail-closed do requireInstituicaoId).
  if (msg.includes("nenhuma instituição ativa") || msg.includes("saas-05-d")) {
    return "Não foi possível identificar a instituição atual. Selecione uma instituição e tente novamente.";
  }

  // RLS / permissão.
  if (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("row level security") ||
    msg.includes("violates row-level") ||
    msg.includes("permission denied")
  ) {
    return "Você não possui permissão para cadastrar voluntários nesta instituição.";
  }

  // CPF/email duplicado ou outra violação de unicidade.
  if (code === "23505" || msg.includes("duplicate key")) {
    return "Já existe um voluntário com esses dados nesta instituição.";
  }

  // Registro genérico do erro técnico para diagnóstico.
  if (typeof console !== "undefined") {
    console.error("[voluntarios] erro ao salvar:", error);
  }

  return "Não foi possível salvar o voluntário no momento. Tente novamente ou fale com o suporte.";
}
