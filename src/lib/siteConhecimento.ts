/**
 * Recuperação controlada da base de conhecimento do site institucional da FER.
 *
 * Módulo PURO (sem I/O): espelha a lógica usada na edge `whatsapp-inbound` para
 * decidir, de forma determinística, quais documentos do site podem apoiar uma
 * resposta pública de conhecimento. Nenhuma função aqui faz fetch, acessa banco
 * ou altera estado — apenas filtram/ordenam dados já carregados.
 *
 * Princípios:
 * - O site é apenas CAMADA DE APOIO para perguntas públicas de conhecimento.
 * - Nunca sobrepõe agenda real, exceções, programação padrão ou agendamento
 *   pessoal — essas perguntas sequer chegam aqui (são resolvidas antes).
 * - Anti-contaminação: pergunta sobre tratamento nunca retorna doação/campanha.
 * - Guarda temporal: documentos temporais não entram por padrão e nunca viram
 *   fonte de agenda.
 */

export type CategoriaSite =
  | "tratamento"
  | "institucional"
  | "contato"
  | "doacao"
  | "campanha"
  | "evento"
  | "comunicado"
  | "outros";

export type PrioridadeSite = "alta" | "media" | "baixa" | "condicionada";

export type StatusSite = "rascunho" | "ativo" | "inativo";

export interface SiteDocumento {
  id?: string;
  url: string;
  titulo: string;
  resumo: string;
  corpo: string;
  categoria: CategoriaSite;
  prioridade: PrioridadeSite;
  temporal: boolean;
  data_conteudo?: string | null;
  usar_na_ia: boolean;
  status: StatusSite;
}

export interface OpcoesSelecao {
  /** Limite de documentos retornados como contexto (default 3). */
  max?: number;
}

/** Normalização consistente com a edge inbound: minúsculas, sem acento, espaços. */
export function normalizarSite(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ===== Mapeamento de palavras-chave por categoria de conhecimento público =====
const KW_TRATAMENTO = [
  "magnetismo", "desobsessao", "desobsessão", "evangelhoterapia", "evangelho terapia",
  "apometria", "passe", "agua fluidificada", "água fluidificada", "fluidificada",
  "tratamento", "tratamentos", "terapia", "terapias", "sessao espirita", "sessão espírita",
  "que tratamentos", "quais tratamentos", "o que e o", "o que é o", "o que e a", "o que é a",
  "como funciona o tratamento", "cura", "mediunidade", "passe magnetico",
];
const KW_CONTATO = [
  "contato", "telefone", "whatsapp", "email", "e-mail", "endereco", "endereço",
  "onde fica", "onde e", "onde é", "localizacao", "localização", "como chegar",
  "horario de funcionamento", "horário de funcionamento", "que horas abre", "como falar",
  "canais", "redes sociais",
];
const KW_INSTITUCIONAL = [
  "o que e a fer", "o que é a fer", "como funciona a fer", "como funciona a casa",
  "sobre a casa", "sobre a fer", "historia", "história", "missao", "missão",
  "fundacao", "fundação", "federacao", "federação", "quem somos", "o que e a casa",
  "o que é a casa", "como funciona", "funcionamento da casa", "trabalho da casa",
];
const KW_DOACAO = ["doar", "doacao", "doação", "doacoes", "doações", "contribuir", "ajudar a casa", "contribuicao", "contribuição"];
const KW_CAMPANHA = ["campanha", "campanhas", "socio mantenedor", "sócio mantenedor", "mantenedor"];
const KW_EVENTO = ["evento", "eventos", "palestra especial", "encontro"];

function algumTermo(txt: string, termos: string[]): boolean {
  return termos.some((raw) => txt.includes(normalizarSite(raw)));
}

/**
 * Indica se a mensagem aparenta ser uma pergunta PÚBLICA DE CONHECIMENTO.
 * Usado para liberar a consulta ao site em intenções genéricas (`complexo`),
 * evitando consultar o site para qualquer mensagem ambígua.
 */
export function indicaConhecimentoPublico(query: string): boolean {
  const txt = normalizarSite(query);
  if (!txt) return false;
  return (
    algumTermo(txt, KW_TRATAMENTO) ||
    algumTermo(txt, KW_CONTATO) ||
    algumTermo(txt, KW_INSTITUCIONAL) ||
    algumTermo(txt, KW_DOACAO) ||
    algumTermo(txt, KW_CAMPANHA) ||
    algumTermo(txt, KW_EVENTO)
  );
}

/**
 * Decide as categorias-alvo a partir da intenção e do texto da pergunta.
 * Prioriza tratamento/institucional/contato (foco da Fase 1).
 */
export function categoriasAlvo(query: string, intencao?: string): CategoriaSite[] {
  const txt = normalizarSite(query);
  const alvos = new Set<CategoriaSite>();

  if (algumTermo(txt, KW_TRATAMENTO)) alvos.add("tratamento");
  if (algumTermo(txt, KW_INSTITUCIONAL)) { alvos.add("institucional"); alvos.add("contato"); }
  if (algumTermo(txt, KW_CONTATO)) alvos.add("contato");
  if (algumTermo(txt, KW_DOACAO)) alvos.add("doacao");
  if (algumTermo(txt, KW_CAMPANHA)) alvos.add("campanha");
  if (algumTermo(txt, KW_EVENTO)) alvos.add("evento");

  // Reforço por intenção quando o texto não bastou.
  if (intencao === "acao_social") alvos.add("doacao");
  if (intencao === "campanhas") alvos.add("campanha");
  if (intencao === "eventos") alvos.add("evento");

  // Pergunta genérica de conhecimento sem categoria detectada: usar as camadas
  // permanentes (institucional + contato) como apoio seguro.
  if (alvos.size === 0 && (intencao === "pedido_informacao" || intencao === "programacao_publica")) {
    alvos.add("institucional");
    alvos.add("contato");
  }

  return [...alvos];
}

const PESO_PRIORIDADE: Record<PrioridadeSite, number> = {
  alta: 3,
  media: 2,
  baixa: 1,
  condicionada: 0.5,
};

/** Relevância textual simples e determinística: título > resumo > corpo. */
function pontuarRelevancia(doc: SiteDocumento, termos: string[]): number {
  const titulo = normalizarSite(doc.titulo);
  const resumo = normalizarSite(doc.resumo);
  const corpo = normalizarSite(doc.corpo);
  let score = 0;
  for (const t of termos) {
    if (!t) continue;
    if (titulo.includes(t)) score += 3;
    else if (resumo.includes(t)) score += 2;
    else if (corpo.includes(t)) score += 1;
  }
  return score;
}

/** Quebra a query em termos relevantes (>= 3 chars), já normalizados e sem pontuação. */
function termosDaQuery(query: string): string[] {
  return normalizarSite(query)
    .split(" ")
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length >= 3);
}

/**
 * Seleciona os documentos do site que podem apoiar a resposta.
 *
 * Regras:
 * - Apenas `status === 'ativo'` e `usar_na_ia === true`.
 * - Filtra pelas categorias-alvo da pergunta.
 * - Anti-contaminação: se a pergunta é de tratamento, remove doação/campanha.
 * - Guarda temporal: documentos `temporal` só entram com forte casamento no
 *   título e nunca como apoio padrão.
 * - Ordena por relevância textual e, em empate, por prioridade.
 * - Limita ao máximo configurado (default 3).
 */
export function selecionarDocumentos(
  query: string,
  intencao: string | undefined,
  docs: SiteDocumento[],
  opts: OpcoesSelecao = {},
): SiteDocumento[] {
  const max = Math.max(1, opts.max ?? 3);
  const alvos = new Set(categoriasAlvo(query, intencao));
  if (alvos.size === 0) return [];

  const perguntaTratamento = alvos.has("tratamento");
  const termos = termosDaQuery(query);

  const candidatos = (docs || [])
    .filter((d) => d && d.status === "ativo" && d.usar_na_ia === true)
    .filter((d) => alvos.has(d.categoria))
    // Anti-contaminação: tratamento nunca traz doação/campanha.
    .filter((d) => !(perguntaTratamento && (d.categoria === "doacao" || d.categoria === "campanha")))
    // Guarda temporal: temporais só entram com casamento forte no título.
    .filter((d) => {
      if (!d.temporal) return true;
      const titulo = normalizarSite(d.titulo);
      return termos.some((t) => titulo.includes(t));
    });

  const ranqueados = candidatos
    .map((d) => ({
      doc: d,
      score: pontuarRelevancia(d, termos),
      peso: PESO_PRIORIDADE[d.prioridade] ?? 1,
    }))
    // Documento sem nenhuma relevância textual não entra como contexto.
    .filter((r) => r.score > 0)
    .sort((a, b) => (b.score - a.score) || (b.peso - a.peso));

  return ranqueados.slice(0, max).map((r) => r.doc);
}

/** Monta o bloco factual (grounded) a ser entregue ao humanizador da IA. */
export function montarContextoSite(docs: SiteDocumento[]): string {
  if (!docs || docs.length === 0) return "";
  return docs
    .map((d) => {
      const corpo = (d.resumo || d.corpo || "").trim();
      return `• ${d.titulo.trim()}: ${corpo}`;
    })
    .join("\n");
}
