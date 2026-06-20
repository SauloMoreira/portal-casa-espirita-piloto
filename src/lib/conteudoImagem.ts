/**
 * Módulo 6 — Imagens para Campanhas e Eventos.
 * Lógica pura, reutilizável por Campanhas e Eventos (sem dependência de React/Supabase).
 */

export type ImagemOrigem = "ai" | "upload" | "url";
export type ConteudoTipo = "campanha" | "evento";

/** Formatos de imagem suportados na geração/otimização. */
export type ImagemFormato = "card" | "banner_horizontal" | "banner_vertical" | "destaque";

export const FORMATO_PADRAO: ImagemFormato = "card";

export const FORMATOS: {
  value: ImagemFormato;
  label: string;
  size: string;
  ratio: string;
  /** Proporção numérica (largura / altura) usada para recorte e preview. */
  aspect: number;
  /** Classe Tailwind de aspect-ratio para preview/exibição. */
  aspectClass: string;
}[] = [
  { value: "card", label: "Card quadrado", size: "1024x1024", ratio: "1:1", aspect: 1, aspectClass: "aspect-square" },
  { value: "banner_horizontal", label: "Banner horizontal", size: "1536x1024", ratio: "3:2", aspect: 3 / 2, aspectClass: "aspect-[3/2]" },
  { value: "banner_vertical", label: "Banner vertical", size: "1024x1536", ratio: "2:3", aspect: 2 / 3, aspectClass: "aspect-[2/3]" },
  { value: "destaque", label: "Destaque da home", size: "1600x900", ratio: "16:9", aspect: 16 / 9, aspectClass: "aspect-video" },
];

/** Normaliza um valor de formato (vindo do banco) para um formato válido. */
export function normalizarFormato(formato: string | null | undefined): ImagemFormato {
  return (FORMATOS.find((f) => f.value === formato)?.value) ?? FORMATO_PADRAO;
}

function formatoConfig(formato: ImagemFormato) {
  return FORMATOS.find((f) => f.value === formato) ?? FORMATOS[0];
}

/** Dimensão de saída (compatível com a API de imagens) para cada formato. */
export function formatoSize(formato: ImagemFormato): string {
  return formatoConfig(formato).size;
}

/** Proporção numérica (largura/altura) do formato. */
export function formatoAspect(formato: ImagemFormato): number {
  return formatoConfig(formato).aspect;
}

/** Classe Tailwind de aspect-ratio do formato, para preview/exibição. */
export function formatoAspectClass(formato: string | null | undefined): string {
  return formatoConfig(normalizarFormato(formato)).aspectClass;
}

/** Rótulo amigável do formato. */
export function formatoLabel(formato: string | null | undefined): string {
  return formatoConfig(normalizarFormato(formato)).label;
}

/** Rótulo amigável da origem da imagem. */
export function origemLabel(origem: string | null | undefined): string {
  switch (origem) {
    case "ai":
      return "Gerada por IA";
    case "upload":
      return "Enviada por arquivo";
    case "url":
      return "Endereço (URL)";
    default:
      return "Sem origem definida";
  }
}

/** Tipos MIME aceitos no upload manual. */
export const UPLOAD_TIPOS_ACEITOS = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;
/** Tamanho bruto máximo aceito (10MB). */
export const UPLOAD_TAMANHO_MAX = 10 * 1024 * 1024;

/** Valida um arquivo de upload manual; retorna mensagem de erro ou null se válido. */
export function validarUploadImagem(file: { type: string; size: number }): string | null {
  if (!UPLOAD_TIPOS_ACEITOS.includes(file.type as (typeof UPLOAD_TIPOS_ACEITOS)[number])) {
    return "Formato inválido. Use JPG, PNG ou WEBP.";
  }
  if (file.size > UPLOAD_TAMANHO_MAX) {
    return "Arquivo muito grande. Tamanho máximo: 10MB.";
  }
  if (file.size <= 0) {
    return "Arquivo inválido ou vazio.";
  }
  return null;
}

export type DadosConteudo = {
  titulo?: string | null;
  subtitulo?: string | null;
  descricao_curta?: string | null;
  descricao_completa?: string | null;
  local?: string | null;
};

/**
 * Monta o prompt base para geração de imagem promocional com IA,
 * usando os dados já cadastrados no conteúdo.
 */
export function montarPromptGeracao(
  tipo: ConteudoTipo,
  dados: DadosConteudo,
  formato: ImagemFormato = "card",
): string {
  const linhas: string[] = [];
  const rotuloTipo = tipo === "campanha" ? "campanha institucional" : "evento";
  linhas.push(
    `Arte promocional puramente ilustrativa para uma ${rotuloTipo} de uma casa espírita de assistência (instituição beneficente).`,
  );
  // Os campos abaixo servem APENAS como inspiração temática/visual.
  // Eles NÃO devem ser escritos, renderizados ou estilizados como texto na imagem.
  linhas.push(
    `Use as informações a seguir somente como tema e inspiração visual (NÃO escreva nenhuma dessas palavras na imagem):`,
  );
  if (dados.titulo) linhas.push(`Título: ${dados.titulo.trim()}.`);
  if (dados.subtitulo) linhas.push(`Subtítulo: ${dados.subtitulo.trim()}.`);
  if (dados.descricao_curta) linhas.push(`Resumo: ${dados.descricao_curta.trim()}.`);
  if (dados.descricao_completa) linhas.push(`Contexto: ${dados.descricao_completa.trim().slice(0, 400)}.`);
  if (tipo === "evento" && dados.local) linhas.push(`Local: ${dados.local.trim()}.`);

  const fmt = formatoConfig(formato);
  linhas.push(
    `Estilo institucional, acolhedor, elegante, limpo, moderno e harmonioso. ` +
      `Paleta serena (tons de verde-azulado/teal e sálvia), iluminação suave. ` +
      `Composição ${orientacaoFormato(formato)} em ${fmt.label.toLowerCase()}, ` +
      `enquadramento na proporção ${fmt.ratio} (largura:altura), com o assunto principal centralizado e bem aproveitado nessa proporção.`,
  );
  // Regra absoluta contra texto: modelos de imagem tendem a "escrever" o título/descrição
  // de forma ilegível e com erros. Proibimos qualquer texto de forma enfática.
  linhas.push(
    `REGRA ABSOLUTA: a imagem deve ser 100% livre de texto. ` +
      `Sem texto sobreposto, sem letras, sem palavras, sem números, sem títulos, sem legendas, ` +
      `sem tipografia, sem caligrafia, sem logotipos com texto e sem qualquer escrita em qualquer idioma. ` +
      `Apenas elementos visuais (ilustração, formas, cenas, símbolos). ` +
      `Sem cara de panfleto, sem poluição visual, sem elementos agressivos.`,
  );
  return linhas.join(" ");
}

/** Descreve a orientação esperada do enquadramento por formato. */
function orientacaoFormato(formato: ImagemFormato): string {
  switch (formato) {
    case "banner_horizontal":
      return "amplamente horizontal (paisagem larga, aproveitando as laterais)";
    case "banner_vertical":
      return "verticalizada (retrato, mais alta do que larga)";
    case "destaque":
      return "panorâmica e nobre (faixa larga widescreen, valorizada para destaque)";
    case "card":
    default:
      return "compacta e equilibrada (quadrada)";
  }
}

/** Valida se há dados mínimos para gerar imagem com IA. */
export function podeGerarComIa(dados: DadosConteudo): boolean {
  return !!(dados.titulo && dados.titulo.trim().length >= 2);
}

/** Instrução base para otimização/ajuste de imagem existente. */
export function montarPromptOtimizacao(formato: ImagemFormato = "card"): string {
  const fmt = formatoConfig(formato);
  return (
    `Otimize esta imagem para uso institucional em ${fmt.label.toLowerCase()}, ` +
    `reenquadrando a composição para a proporção ${fmt.ratio} (largura:altura), de forma ${orientacaoFormato(formato)}. ` +
    `Melhore iluminação, nitidez e enquadramento, mantendo o assunto principal bem posicionado e centralizado nessa proporção. ` +
    `Deixe a imagem mais limpa, leve e bem aproveitada no layout. ` +
    `Mantenha o tema e o conteúdo original. ` +
    `REGRA ABSOLUTA: não adicione nenhum texto, letras, palavras, números, títulos, legendas ou tipografia em nenhum idioma; ` +
    `apenas elementos visuais. Se a imagem original tiver texto, não tente reescrevê-lo.`
  );
}

/** Resolve a origem efetiva ao definir uma nova imagem. */
export function resolverOrigem(novaOrigem: ImagemOrigem): ImagemOrigem {
  return novaOrigem;
}

/** Formata a data da última atualização da imagem. */
export function formatarAtualizacao(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
