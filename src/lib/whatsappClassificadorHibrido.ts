// ============================================================================
// FASE 4 — Classificador híbrido APENAS no gap (baixa confiança / ambiguidade /
// fora do dicionário). O classificador determinístico continua sendo a PRIMEIRA
// e principal camada; o LLM leve só é acionado quando o determinístico falha
// (retorna "complexo") e nenhuma regra determinística posterior resolveu.
// ----------------------------------------------------------------------------
// Este módulo é PURO (sem I/O, sem LLM): decide QUANDO acionar o híbrido e como
// VALIDAR/normalizar a saída do modelo de forma segura. A chamada de rede vive na
// edge function. Mantém custo baixo (acionado raramente), fallback determinístico
// (qualquer saída inválida volta a "complexo" -> handoff) e privacidade (só o
// texto da própria mensagem é enviado, nunca dados pessoais do banco).
// ============================================================================

import type { Intencao } from "./whatsappInbound";

/** Intenções que o sistema sabe responder/encaminhar — domínio fechado do híbrido. */
export const INTENCOES_VALIDAS: ReadonlySet<Intencao> = new Set<Intencao>([
  "saudacao", "agradecimento", "pedido_informacao", "encerramento",
  "tratamento_hoje", "proxima_sessao", "horario_entrevista", "confirmacao_agendamento",
  "onde_ver_app", "programacao_publica", "eventos", "campanhas", "acao_social",
  "opt_out", "reativar", "falar_humano", "complexo",
]);

/** Limite mínimo de confiança para aceitar a classificação do híbrido. */
export const CONFIANCA_MINIMA = 0.6;

export interface SaidaHibrido {
  intencao: Intencao;
  atividade: string | null;
  confianca: number;
  /** True quando a classificação é confiável o bastante para SUBSTITUIR "complexo". */
  aceito: boolean;
}

/**
 * Decide se o classificador híbrido (LLM) deve ser acionado. Só roda no GAP:
 * quando o determinístico (incluindo upgrades por atividade/data) ainda resultou
 * em "complexo". Mensagens vazias não acionam (vão direto a handoff).
 */
export function deveAcionarHibrido(
  intencaoDeterministica: Intencao,
  texto: string | null | undefined,
): boolean {
  if (intencaoDeterministica !== "complexo") return false;
  const t = (texto || "").trim();
  if (!t) return false;
  // Mensagens triviais (1 caractere) não justificam custo de LLM.
  return t.length >= 2;
}

/** Extrai com segurança um objeto a partir da saída do modelo (objeto ou string JSON). */
function extrairObjeto(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    const s = raw.trim();
    // Tolera blocos ```json ... ``` e texto ao redor do JSON.
    const inicio = s.indexOf("{");
    const fim = s.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) {
      try {
        const obj = JSON.parse(s.slice(inicio, fim + 1));
        if (obj && typeof obj === "object") return obj as Record<string, unknown>;
      } catch (_) { /* inválido */ }
    }
  }
  return null;
}

/**
 * Normaliza e VALIDA a saída do híbrido. Qualquer coisa fora do domínio fechado,
 * com baixa confiança ou malformada vira `complexo` não-aceito (fallback seguro).
 */
export function normalizarSaidaHibrido(raw: unknown): SaidaHibrido {
  const reprovado: SaidaHibrido = { intencao: "complexo", atividade: null, confianca: 0, aceito: false };
  const obj = extrairObjeto(raw);
  if (!obj) return reprovado;

  const intRaw = String(obj.intencao ?? obj.intent ?? "").trim().toLowerCase();
  const intencao = (INTENCOES_VALIDAS.has(intRaw as Intencao) ? intRaw : "complexo") as Intencao;

  let confianca = Number(obj.confianca ?? obj.confidence ?? 0);
  if (!Number.isFinite(confianca)) confianca = 0;
  confianca = Math.max(0, Math.min(1, confianca));

  const atvRaw = obj.atividade ?? obj.activity ?? null;
  let atividade: string | null = null;
  if (typeof atvRaw === "string") {
    const limpo = atvRaw.trim();
    atividade = limpo && limpo.toLowerCase() !== "null" ? limpo : null;
  }

  const aceito = intencao !== "complexo" && confianca >= CONFIANCA_MINIMA;
  return { intencao, atividade, confianca, aceito };
}

/** Lista compacta de intenções (sem "complexo") para injetar no prompt do híbrido. */
export function intencoesParaPrompt(): string {
  return [...INTENCOES_VALIDAS].filter((i) => i !== "complexo").join(", ");
}
