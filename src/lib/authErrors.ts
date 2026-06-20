/**
 * Traduz/normaliza mensagens de erro de autenticação para português,
 * de forma amigável e tolerante a pequenas variações de texto do backend.
 */
export function traduzirErroAuth(mensagem: string | undefined | null): string {
  const fallback = "Não foi possível entrar. Verifique suas credenciais e tente novamente.";

  if (!mensagem) return fallback;

  const m = mensagem.toLowerCase();

  if (m.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (m.includes("email not confirmed")) {
    return "E-mail ainda não confirmado.";
  }
  if (m.includes("user not found")) {
    return "Usuário não encontrado.";
  }
  if (
    m.includes("rate limit") ||
    m.includes("too many") ||
    m.includes("many requests") ||
    m.includes("over_request_rate_limit")
  ) {
    return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
  }

  return fallback;
}
