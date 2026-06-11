// ============================================================================
// Tipos compartilhados da Central de Apoio e Calibração da IA
// IA é apoio: toda sugestão é validada por humano. Decisão final é sempre humana.
// ============================================================================

/** Queixa identificada pela IA nas observações da entrevista. */
export interface IaQueixaIdentificada {
  nome: string;
  categoria?: string | null;
  queixa_id?: string | null;
}

/** Tratamento sugerido pela IA, vinculado (quando possível) a um tratamento real. */
export interface IaTratamentoSugerido {
  tratamento_id: string | null;
  nome: string;
  quantidade: number;
}

/** Material da biblioteca consultado pela IA. */
export interface IaMaterialConsultado {
  titulo: string;
  tipo_material?: string | null;
}

/** Sugestão estruturada devolvida pela edge function `assistente-entrevista`. */
export interface IaSugestaoEstruturada {
  resumo: string;
  queixas_identificadas: IaQueixaIdentificada[];
  tratamentos_sugeridos: IaTratamentoSugerido[];
  justificativa: string;
  materiais_consultados: IaMaterialConsultado[];
  /** Texto markdown legível para exibição (fallback amigável). */
  texto: string;
}

/** Resposta da edge function: id persistido + estrutura + texto. */
export interface IaSugestaoResponse {
  sugestao_id: string | null;
  estruturada: IaSugestaoEstruturada;
}

/** Item de tratamento na decisão final humana. */
export interface IaTratamentoAtribuido {
  tratamento_id: string;
  nome: string;
  quantidade: number;
}

/** Alteração de quantidade entre sugestão e decisão. */
export interface IaTratamentoAlterado {
  tratamento_id: string;
  nome: string;
  de: number;
  para: number;
}

/** Comparação estruturada entre o que a IA sugeriu e o que o humano fez. */
export interface IaDiferencas {
  adicionados: IaTratamentoAtribuido[];
  removidos: IaTratamentoSugerido[];
  alterados: IaTratamentoAlterado[];
  mantidos: IaTratamentoAtribuido[];
}

/** Classificações supervisionadas do feedback. */
export type IaClassificacao =
  | "acertou totalmente"
  | "acertou parcialmente"
  | "inadequada"
  | "inconclusiva"
  | "sem uso";

export const IA_CLASSIFICACOES: IaClassificacao[] = [
  "acertou totalmente",
  "acertou parcialmente",
  "inadequada",
  "inconclusiva",
  "sem uso",
];

/** Indicadores agregados de assertividade da IA. */
export interface IaIndicadores {
  totalSugestoes: number;
  avaliadas: number;
  pendentes: number;
  aderenciaTotal: number;
  aderenciaParcial: number;
  divergencia: number;
  inconclusiva: number;
  semUso: number;
  taxaAderenciaTotal: number;
  taxaAderenciaParcial: number;
  taxaDivergencia: number;
  tratamentosMaisSugeridos: Array<{ nome: string; total: number }>;
  tratamentosMaisAtribuidos: Array<{ nome: string; total: number }>;
  queixasMaiorAcerto: Array<{ nome: string; acertos: number; total: number; taxa: number }>;
  queixasMaiorDivergencia: Array<{ nome: string; divergencias: number; total: number; taxa: number }>;
  evolucao: Array<{ periodo: string; sugestoes: number; aderencia: number; divergencia: number }>;
}
