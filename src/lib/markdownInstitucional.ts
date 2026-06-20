/**
 * Suporte ao campo de Mensagem institucional da Ação Social usando **Markdown
 * controlado**. O conteúdo é armazenado como Markdown simples (texto puro) e
 * renderizado via react-markdown, que NÃO interpreta HTML bruto — eliminando o
 * risco de XSS por padrão. Aqui ficam apenas as regras de whitelist e os
 * utilitários de limpeza/limite, mantidos sem dependência de React para
 * permitir testes unitários diretos.
 */

/**
 * Conjunto restrito de elementos permitidos na renderização. Tudo que não
 * estiver nesta lista é descartado (ex.: imagens, tabelas, blockquote, code,
 * hr, h1–h3). Mantém o card leve e consistente com o design do sistema.
 */
export const MARKDOWN_ALLOWED_ELEMENTS = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "h4",
  "a",
  "br",
] as const;

/** Limite de caracteres do conteúdo bruto (Markdown) para evitar excessos. */
export const MENSAGEM_INSTITUCIONAL_MAX = 2000;

/**
 * Transforma URLs de links para um formato seguro. Aceita apenas http(s) e
 * mailto; qualquer outro protocolo (javascript:, data:, etc.) é bloqueado
 * retornando string vazia — o link vira texto inerte.
 */
export function safeUrlTransform(url: string): string {
  const value = (url || "").trim();
  if (!value) return "";
  // URLs relativas não fazem sentido aqui e são bloqueadas.
  const lower = value.toLowerCase();
  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("mailto:")
  ) {
    return value;
  }
  return "";
}

/**
 * Normaliza o conteúdo Markdown antes de salvar: aplica trim, remove caracteres
 * de controle perigosos e aplica o limite máximo. Retorna null quando vazio.
 */
export function limparMensagemInstitucional(texto?: string | null): string | null {
  if (!texto) return null;
  // Remove caracteres de controle (exceto quebras de linha e tab) que poderiam
  // sujar o conteúdo colado de Word/Google Docs.
  // eslint-disable-next-line no-control-regex
  const semControle = texto.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const limitado = semControle.slice(0, MENSAGEM_INSTITUCIONAL_MAX);
  const final = limitado.trim();
  return final ? final : null;
}

/** Indica se há conteúdo institucional renderizável. */
export function temMensagemInstitucional(texto?: string | null): boolean {
  return limparMensagemInstitucional(texto) != null;
}
