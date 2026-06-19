// ============================================================================
// FASE 2 — Orquestrador único de consulta + precedência fechada entre fontes +
// próxima ocorrência com validação obrigatória de exceção.
// ----------------------------------------------------------------------------
// Camada DETERMINÍSTICA e pura (custo zero, sem LLM, sem I/O). Recebe os fatos
// já consultados no banco (sessões, agenda pessoal, programação padrão, exceções)
// e decide, de forma centralizada e verificável, QUAL fonte vence e QUAL é a
// próxima ocorrência realmente válida.
//
// É compartilhada entre a edge function `whatsapp-inbound` (que faz as queries)
// e os testes unitários, para que a regra de negócio seja provável isoladamente.
//
// Precedência fechada (menor índice = maior prioridade):
//   1) exceção operacional
//   2) sessão/agenda real
//   3) agendamento pessoal real
//   4) programação padrão
//   5) eventos/campanhas/ação social  -> COMPLEMENTO (só quando a pergunta
//      principal não for explicitamente sobre eles)
// ============================================================================

import { normalizarTexto } from "./whatsappInbound";
import type { Intencao } from "./whatsappInbound";

// ===================== TIPOS =====================

export type FonteFato =
  | "excecao_operacional"
  | "agenda_real"
  | "agenda_pessoal"
  | "programacao_padrao"
  | "eventos"
  | "campanhas"
  | "acao_social"
  | "nenhuma";

/** Ordem de precedência fechada entre as fontes operacionais (não complementos). */
export const PRECEDENCIA_FONTES: FonteFato[] = [
  "excecao_operacional",
  "agenda_real",
  "agenda_pessoal",
  "programacao_padrao",
];

/** Status de exceção que INVALIDAM uma ocorrência como "próxima válida". */
export const EXCECAO_STATUS_INVALIDO = new Set([
  "cancelado", "cancelada",
  "remarcado", "remarcada",
  "excepcional", "alterado", "alterada",
]);

export interface Candidata {
  atividade: string;
  data: string; // ISO YYYY-MM-DD
  horario?: string | null;
  fonte: FonteFato;
  tratamento_id?: string | null;
  status?: string | null;
}

export interface ExcecaoFato {
  atividade?: string | null;
  tratamento_id?: string | null;
  data: string; // ISO YYYY-MM-DD (data_excecao)
  status: string;
  nova_data?: string | null;
  novo_horario?: string | null;
  motivo?: string | null;
  mensagem_ia?: string | null;
}

export interface ResultadoProxima {
  /** Primeira ocorrência realmente válida, ou null se nenhuma no horizonte. */
  ocorrencia: Candidata | null;
  /** Candidatas descartadas por exceção, na ordem em que foram avaliadas. */
  descartadas: Array<{ candidata: Candidata; motivo: string; excecao: ExcecaoFato }>;
  /** True quando nenhuma candidata válida foi encontrada na janela. */
  semValida: boolean;
}

export type EscopoResolvido = "pessoal" | "publico" | "ambiguo";

// ===================== HELPERS DE DATA =====================

/** Soma `offset` dias a uma data ISO (meio-dia UTC, defensivo contra fuso). */
function addDias(baseIso: string, offset: number): { iso: string; dow: number } {
  const d = new Date(baseIso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + offset);
  return { iso: d.toISOString().slice(0, 10), dow: d.getUTCDay() };
}

// ===================== EQUIVALÊNCIA DE ATIVIDADE =====================

/** Compara nomes de atividade de forma tolerante (acentos/casing/contém). */
export function nomesEquivalentes(a?: string | null, b?: string | null): boolean {
  const na = normalizarTexto(a || "");
  const nb = normalizarTexto(b || "");
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** True quando o status da exceção invalida a ocorrência como "próxima válida". */
export function excecaoInvalida(status?: string | null): boolean {
  return EXCECAO_STATUS_INVALIDO.has((status || "").toLowerCase());
}

/**
 * Encontra a exceção operacional que se aplica a uma candidata (mesma data e
 * mesma atividade — por tratamento_id quando houver, senão por nome).
 */
export function encontrarExcecao(
  cand: Candidata,
  excecoes: ExcecaoFato[] | null | undefined,
): ExcecaoFato | null {
  for (const ex of excecoes || []) {
    if (!ex || ex.data !== cand.data) continue;
    if (cand.tratamento_id && ex.tratamento_id) {
      if (cand.tratamento_id === ex.tratamento_id) return ex;
      continue;
    }
    if (nomesEquivalentes(ex.atividade, cand.atividade)) return ex;
  }
  return null;
}

// ===================== PRECEDÊNCIA FECHADA POR DIA =====================

function rankFonte(f: FonteFato): number {
  const i = PRECEDENCIA_FONTES.indexOf(f);
  return i < 0 ? 99 : i;
}

/**
 * Resolve a precedência fechada para um MESMO dia: agrupa por atividade e mantém
 * apenas o item da fonte de maior prioridade. Garante, por exemplo, que uma
 * exceção operacional vença a programação padrão e que uma sessão real vença o
 * padrão para a mesma atividade.
 */
export function resolverPrecedenciaDia(itens: Candidata[] | null | undefined): Candidata[] {
  const grupos = new Map<string, Candidata>();
  for (const it of itens || []) {
    if (!it || !it.atividade) continue;
    const chave = normalizarTexto(it.atividade);
    const atual = grupos.get(chave);
    if (!atual || rankFonte(it.fonte) < rankFonte(atual.fonte)) grupos.set(chave, it);
  }
  return [...grupos.values()];
}

// ===================== PRÓXIMA OCORRÊNCIA VÁLIDA =====================

/**
 * Caminha pelas candidatas (ordenadas por data/horário) e devolve a PRIMEIRA que
 * continua válida após cruzar com as exceções. Descartando cancelado/remarcado/
 * excepcional, avança até achar uma ocorrência realmente válida.
 */
export function proximaOcorrenciaValida(
  candidatas: Candidata[] | null | undefined,
  excecoes: ExcecaoFato[] | null | undefined,
): ResultadoProxima {
  const ordenadas = [...(candidatas || [])].sort((a, b) =>
    a.data === b.data
      ? (a.horario || "").localeCompare(b.horario || "")
      : a.data.localeCompare(b.data),
  );
  const descartadas: ResultadoProxima["descartadas"] = [];
  for (const c of ordenadas) {
    const ex = encontrarExcecao(c, excecoes);
    // Também respeita um status próprio da candidata (ex.: sessão já cancelada).
    if (ex && excecaoInvalida(ex.status)) {
      descartadas.push({ candidata: c, motivo: (ex.status || "").toLowerCase(), excecao: ex });
      continue;
    }
    if (!ex && excecaoInvalida(c.status)) {
      descartadas.push({
        candidata: c, motivo: (c.status || "").toLowerCase(),
        excecao: { atividade: c.atividade, data: c.data, status: c.status || "" },
      });
      continue;
    }
    return { ocorrencia: c, descartadas, semValida: false };
  }
  return { ocorrencia: null, descartadas, semValida: true };
}

/**
 * Gera candidatas a partir de uma programação semanal recorrente (programação
 * padrão), varrendo uma janela de dias a partir de `baseIso`. Usado para
 * responder "quando é a próxima <atividade>?" sem data explícita.
 */
export function gerarCandidatasSemanais(opts: {
  atividade: string;
  diasSemana: number[];
  horario?: string | null;
  baseIso: string;
  janelaDias?: number;
  tratamento_id?: string | null;
}): Candidata[] {
  const janela = opts.janelaDias ?? 60;
  const dias = new Set(opts.diasSemana || []);
  const out: Candidata[] = [];
  for (let i = 0; i <= janela; i++) {
    const { iso, dow } = addDias(opts.baseIso, i);
    if (dias.has(dow)) {
      out.push({
        atividade: opts.atividade,
        data: iso,
        horario: opts.horario ?? null,
        fonte: "programacao_padrao",
        tratamento_id: opts.tratamento_id ?? null,
      });
    }
  }
  return out;
}

// ===================== ESCOPO: PÚBLICO vs PESSOAL vs AMBÍGUO =====================

/** Intenções que dependem dos dados PESSOAIS do assistido. */
const INTENCOES_PESSOAIS: Intencao[] = ["proxima_sessao", "horario_entrevista"];
/** Intenções inerentemente PÚBLICAS (programação/eventos/campanhas/ação social). */
const INTENCOES_PUBLICAS: Intencao[] = [
  "programacao_publica", "eventos", "campanhas", "acao_social",
];

/**
 * Decide o escopo da consulta com segurança:
 *  - intenção pública  -> "publico" (programação da casa)
 *  - intenção pessoal  -> "pessoal" se o assistido foi identificado;
 *                         senão "ambiguo" (pedir esclarecimento/identificação)
 *  - "tratamento_hoje" -> "pessoal" quando há assistido; "publico" caso contrário
 *  - herda o escopo recente do contexto quando a intenção é neutra.
 */
export function resolverEscopo(opts: {
  intencao: Intencao;
  assistidoIdentificado: boolean;
  escopoContexto?: string | null;
}): EscopoResolvido {
  const { intencao, assistidoIdentificado, escopoContexto } = opts;

  if (INTENCOES_PUBLICAS.includes(intencao)) return "publico";

  if (INTENCOES_PESSOAIS.includes(intencao)) {
    return assistidoIdentificado ? "pessoal" : "ambiguo";
  }

  if (intencao === "tratamento_hoje") {
    return assistidoIdentificado ? "pessoal" : "publico";
  }

  // Intenções neutras/conversacionais: herdam um escopo recente seguro.
  if (escopoContexto === "pessoal" && assistidoIdentificado) return "pessoal";
  if (escopoContexto === "publico") return "publico";
  return "ambiguo";
}

/** True quando a mensagem pede explicitamente a PRÓXIMA ocorrência. */
export function perguntaProximaOcorrencia(texto: string): boolean {
  const t = normalizarTexto(texto);
  return /\bproxim[ao]\b/.test(t) || t.includes("quando e a") || t.includes("quando e o")
    || t.includes("quando vai") || t.includes("quando tem");
}

// ===================== PACOTE DE FATOS ESTRUTURADO =====================

/**
 * Pacote de fatos estruturado devolvido pelo orquestrador. É a "fonte da verdade"
 * que alimenta a geração de resposta (determinística e, depois, a humanização).
 */
export interface PacoteFatos {
  escopo: EscopoResolvido;
  fontePrincipal: FonteFato;
  data?: string | null;
  label?: string | null;
  atividade?: string | null;
  itens: Candidata[];
  proxima?: Candidata | null;
  descartadasProxima?: ResultadoProxima["descartadas"];
  complementos?: {
    eventos?: Array<{ titulo: string; data?: string | null }>;
    campanhas?: Array<{ titulo: string }>;
    acaoSocial?: Array<{ nome: string }>;
  };
}
