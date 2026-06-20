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

/**
 * Traduz mensagens de erro relacionadas à definição/redefinição de senha.
 */
export function traduzirErroSenha(mensagem: string | undefined | null): string {
  const fallback = "Não foi possível redefinir a senha. Tente novamente.";

  if (!mensagem) return fallback;

  const m = mensagem.toLowerCase();

  if (m.includes("weak") || m.includes("easy to guess") || m.includes("pwned") || m.includes("known to be")) {
    return "Esta senha é muito fraca ou fácil de adivinhar. Escolha uma senha mais forte.";
  }
  if (m.includes("at least") || m.includes("should be at least") || m.includes("minimum") || m.includes("too short")) {
    return "A senha é muito curta. Use uma senha mais longa.";
  }
  if (m.includes("different from the old") || m.includes("should be different")) {
    return "A nova senha deve ser diferente da senha anterior.";
  }
  if (
    m.includes("rate limit") ||
    m.includes("too many") ||
    m.includes("many requests")
  ) {
    return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
  }
  if (m.includes("expired") || m.includes("invalid") || m.includes("token")) {
    return "O link de redefinição é inválido ou expirou. Solicite um novo.";
  }

  return fallback;
}
