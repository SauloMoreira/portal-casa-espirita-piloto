/**
 * Módulo 6 — Imagens para Campanhas e Eventos.
 * Lógica pura, reutilizável por Campanhas e Eventos (sem dependência de React/Supabase).
 */

export type ImagemOrigem = "ai" | "upload" | "url";
export type ConteudoTipo = "campanha" | "evento";

/** Formatos de imagem suportados na geração/otimização. */
export type ImagemFormato = "card" | "banner_horizontal" | "banner_vertical" | "destaque";

export const FORMATOS: { value: ImagemFormato; label: string; size: string; ratio: string }[] = [
  { value: "card", label: "Card quadrado", size: "1024x1024", ratio: "1:1" },
  { value: "banner_horizontal", label: "Banner horizontal", size: "1536x1024", ratio: "3:2" },
  { value: "banner_vertical", label: "Banner vertical", size: "1024x1536", ratio: "2:3" },
  { value: "destaque", label: "Destaque da home", size: "1536x1024", ratio: "3:2" },
];

/** Dimensão de saída (compatível com a API de imagens) para cada formato. */
export function formatoSize(formato: ImagemFormato): string {
  return (FORMATOS.find((f) => f.value === formato) ?? FORMATOS[0]).size;
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
    `Arte promocional para uma ${rotuloTipo} de uma casa espírita de assistência (instituição beneficente).`,
  );
  if (dados.titulo) linhas.push(`Título: ${dados.titulo.trim()}.`);
  if (dados.subtitulo) linhas.push(`Subtítulo: ${dados.subtitulo.trim()}.`);
  if (dados.descricao_curta) linhas.push(`Resumo: ${dados.descricao_curta.trim()}.`);
  if (dados.descricao_completa) linhas.push(`Contexto: ${dados.descricao_completa.trim().slice(0, 400)}.`);
  if (tipo === "evento" && dados.local) linhas.push(`Local: ${dados.local.trim()}.`);

  const fmt = FORMATOS.find((f) => f.value === formato) ?? FORMATOS[0];
  linhas.push(
    `Estilo institucional, acolhedor, elegante, limpo, moderno e harmonioso. ` +
      `Paleta serena (tons de verde-azulado/teal e sálvia), iluminação suave. ` +
      `Composição em ${fmt.label.toLowerCase()} (proporção ${fmt.ratio}). ` +
      `Sem texto sobreposto, sem letras, sem cara de panfleto, sem poluição visual, sem elementos agressivos.`,
  );
  return linhas.join(" ");
}

/** Valida se há dados mínimos para gerar imagem com IA. */
export function podeGerarComIa(dados: DadosConteudo): boolean {
  return !!(dados.titulo && dados.titulo.trim().length >= 2);
}

/** Instrução base para otimização/ajuste de imagem existente. */
export function montarPromptOtimizacao(formato: ImagemFormato = "card"): string {
  const fmt = FORMATOS.find((f) => f.value === formato) ?? FORMATOS[0];
  return (
    `Otimize esta imagem para uso institucional em ${fmt.label.toLowerCase()} (proporção ${fmt.ratio}). ` +
    `Melhore iluminação, nitidez e enquadramento, centralizando melhor o conteúdo principal. ` +
    `Deixe a imagem mais limpa, leve e bem aproveitada no layout. ` +
    `Mantenha o tema e o conteúdo original, sem adicionar texto ou elementos novos.`
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
