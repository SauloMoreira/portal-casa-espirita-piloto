// ============================================================================
// Lógica pura de assertividade da IA (sem efeitos colaterais, testável).
// Compara sugestão da IA x decisão humana e agrega indicadores.
// ============================================================================
import type {
  IaClassificacao,
  IaDiferencas,
  IaIndicadores,
  IaTratamentoAtribuido,
  IaTratamentoSugerido,
} from "@/types/ia";

const norm = (v: unknown): number => {
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Calcula as diferenças entre os tratamentos sugeridos pela IA e os
 * efetivamente atribuídos pelo entrevistador. A chave de comparação é o
 * `tratamento_id`.
 */
export function computeDiferencas(
  sugeridos: IaTratamentoSugerido[],
  atribuidos: IaTratamentoAtribuido[],
): IaDiferencas {
  const sugMap = new Map<string, IaTratamentoSugerido>();
  for (const s of sugeridos) {
    if (s.tratamento_id) sugMap.set(s.tratamento_id, s);
  }
  const atrMap = new Map<string, IaTratamentoAtribuido>();
  for (const a of atribuidos) {
    if (a.tratamento_id) atrMap.set(a.tratamento_id, a);
  }

  const adicionados: IaTratamentoAtribuido[] = [];
  const mantidos: IaTratamentoAtribuido[] = [];
  const alterados: IaDiferencas["alterados"] = [];
  const removidos: IaTratamentoSugerido[] = [];

  for (const [id, atr] of atrMap) {
    const sug = sugMap.get(id);
    if (!sug) {
      adicionados.push(atr);
    } else if (norm(sug.quantidade) !== norm(atr.quantidade)) {
      alterados.push({
        tratamento_id: id,
        nome: atr.nome || sug.nome,
        de: norm(sug.quantidade),
        para: norm(atr.quantidade),
      });
    } else {
      mantidos.push(atr);
    }
  }

  for (const [id, sug] of sugMap) {
    if (!atrMap.has(id)) removidos.push(sug);
  }

  return { adicionados, removidos, alterados, mantidos };
}

/**
 * Classificação automática sugerida (pré-preenchimento). O humano sempre
 * confirma. Regras:
 * - nenhum tratamento atribuído -> "sem uso"
 * - nenhum sugerido -> "inconclusiva"
 * - tudo mantido, nada adicionado/removido/alterado -> "acertou totalmente"
 * - nenhuma interseção (tudo removido + tudo adicionado) -> "inadequada"
 * - caso contrário -> "acertou parcialmente"
 */
export function classifyAderencia(diff: IaDiferencas, sugeridosCount: number): IaClassificacao {
  const atribuidosCount =
    diff.adicionados.length + diff.mantidos.length + diff.alterados.length;

  if (atribuidosCount === 0) return "sem uso";
  if (sugeridosCount === 0) return "inconclusiva";

  const semAlteracoes =
    diff.adicionados.length === 0 &&
    diff.removidos.length === 0 &&
    diff.alterados.length === 0;
  if (semAlteracoes) return "acertou totalmente";

  const houveInterseccao = diff.mantidos.length > 0 || diff.alterados.length > 0;
  if (!houveInterseccao) return "inadequada";

  return "acertou parcialmente";
}

// ---------------------------------------------------------------------------
// Agregação de indicadores
// ---------------------------------------------------------------------------

export interface SugestaoRow {
  id: string;
  created_at: string;
  status?: string | null;
  tratamentos_sugeridos_json?: unknown;
  queixas_identificadas_json?: unknown;
}

export interface FeedbackRow {
  sugestao_ia_id: string;
  classificacao: string;
  atribuicao_final_json?: unknown;
  /** Texto livre opcional de ajuste/rejeição (Q2-A2.1). Nunca exposto cru
   *  nos agregados: usado apenas para CONTAGEM de feedbacks com motivo. */
  motivo_ajuste?: string | null;
}

/**
 * Sugestões pendentes com mais dias que este limite são consideradas
 * "antigas" apenas para dar visibilidade de leitura. Não gera cobrança,
 * SLA, notificação nem ranking.
 */
export const PENDENTE_ANTIGA_DIAS = 30;

const DIA_MS = 24 * 60 * 60 * 1000;

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const isAcerto = (c: string) =>
  c === "acertou totalmente" || c === "acertou parcialmente";

function topCount(
  rows: Array<{ nome?: string | null }>,
  limit = 8,
): Array<{ nome: string; total: number }> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const nome = (r.nome || "").trim();
    if (!nome) continue;
    map.set(nome, (map.get(nome) || 0) + 1);
  }
  return [...map.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export function aggregateIndicadores(
  sugestoes: SugestaoRow[],
  feedbacks: FeedbackRow[],
  now: Date = new Date(),
): IaIndicadores {
  const totalSugestoes = sugestoes.length;
  const fbBySugestao = new Map<string, FeedbackRow>();
  for (const f of feedbacks) fbBySugestao.set(f.sugestao_ia_id, f);

  let aderenciaTotal = 0,
    aderenciaParcial = 0,
    divergencia = 0,
    inconclusiva = 0,
    semUso = 0;
  for (const f of feedbacks) {
    switch (f.classificacao) {
      case "acertou totalmente":
        aderenciaTotal++;
        break;
      case "acertou parcialmente":
        aderenciaParcial++;
        break;
      case "inadequada":
        divergencia++;
        break;
      case "inconclusiva":
        inconclusiva++;
        break;
      case "sem uso":
        semUso++;
        break;
    }
  }

  const avaliadas = feedbacks.length;

  // Base de ADERÊNCIA: exclui estados inconclusivos ("sem uso" e
  // "inconclusiva"), que não representam acerto nem divergência real da IA.
  // Assim a taxa principal mede convergência com a decisão humana sobre os
  // casos efetivamente comparáveis, sem diluição enganosa.
  const baseAderencia = aderenciaTotal + aderenciaParcial + divergencia;
  const pct = (n: number) =>
    baseAderencia > 0 ? Math.round((n / baseAderencia) * 100) : 0;

  // Contagem simples de feedbacks com motivo de ajuste/rejeição preenchido.
  // NUNCA expõe o texto livre; apenas quantifica (LGPD / dado sensível).
  const motivosPreenchidos = feedbacks.filter(
    (f) => typeof f.motivo_ajuste === "string" && f.motivo_ajuste.trim().length > 0,
  ).length;

  // Pendências: sugestões sem feedback registrado. "Antigas" = criadas há
  // mais de PENDENTE_ANTIGA_DIAS. Apenas leitura — sem cobrança/SLA/ranking.
  let pendentesAntigas = 0;
  const limiteAntiga = now.getTime() - PENDENTE_ANTIGA_DIAS * DIA_MS;
  for (const s of sugestoes) {
    if (fbBySugestao.has(s.id)) continue;
    const ts = s.created_at ? new Date(s.created_at).getTime() : NaN;
    if (Number.isFinite(ts) && ts < limiteAntiga) pendentesAntigas++;
  }

  // Tratamentos sugeridos x atribuídos
  const sugeridosFlat: Array<{ nome?: string | null }> = [];
  for (const s of sugestoes) {
    for (const t of asArray<{ nome?: string | null }>(s.tratamentos_sugeridos_json)) {
      sugeridosFlat.push({ nome: t.nome });
    }
  }
  const atribuidosFlat: Array<{ nome?: string | null }> = [];
  for (const f of feedbacks) {
    for (const t of asArray<{ nome?: string | null }>(f.atribuicao_final_json)) {
      atribuidosFlat.push({ nome: t.nome });
    }
  }

  // Queixas: acerto x divergência (com base no feedback da sugestão)
  const queixaStats = new Map<string, { acertos: number; divergencias: number; total: number }>();
  for (const s of sugestoes) {
    const fb = fbBySugestao.get(s.id);
    if (!fb) continue;
    for (const q of asArray<{ nome?: string | null }>(s.queixas_identificadas_json)) {
      const nome = (q.nome || "").trim();
      if (!nome) continue;
      const cur = queixaStats.get(nome) || { acertos: 0, divergencias: 0, total: 0 };
      cur.total++;
      if (isAcerto(fb.classificacao)) cur.acertos++;
      if (fb.classificacao === "inadequada") cur.divergencias++;
      queixaStats.set(nome, cur);
    }
  }
  const queixaArr = [...queixaStats.entries()].map(([nome, v]) => ({
    nome,
    ...v,
  }));
  const queixasMaiorAcerto = queixaArr
    .map((q) => ({ nome: q.nome, acertos: q.acertos, total: q.total, taxa: q.total ? Math.round((q.acertos / q.total) * 100) : 0 }))
    .sort((a, b) => b.taxa - a.taxa || b.total - a.total)
    .slice(0, 8);
  const queixasMaiorDivergencia = queixaArr
    .map((q) => ({ nome: q.nome, divergencias: q.divergencias, total: q.total, taxa: q.total ? Math.round((q.divergencias / q.total) * 100) : 0 }))
    .filter((q) => q.divergencias > 0)
    .sort((a, b) => b.taxa - a.taxa || b.divergencias - a.divergencias)
    .slice(0, 8);

  // Evolução por mês (AAAA-MM)
  const evoMap = new Map<string, { sugestoes: number; aderencia: number; divergencia: number }>();
  for (const s of sugestoes) {
    const periodo = (s.created_at || "").slice(0, 7);
    if (!periodo) continue;
    const cur = evoMap.get(periodo) || { sugestoes: 0, aderencia: 0, divergencia: 0 };
    cur.sugestoes++;
    const fb = fbBySugestao.get(s.id);
    if (fb && isAcerto(fb.classificacao)) cur.aderencia++;
    if (fb && fb.classificacao === "inadequada") cur.divergencia++;
    evoMap.set(periodo, cur);
  }
  const evolucao = [...evoMap.entries()]
    .map(([periodo, v]) => ({ periodo, ...v }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  return {
    totalSugestoes,
    avaliadas,
    pendentes: totalSugestoes - avaliadas,
    pendentesAntigas,
    baseAderencia,
    motivosPreenchidos,
    aderenciaTotal,
    aderenciaParcial,
    divergencia,
    inconclusiva,
    semUso,
    taxaAderenciaTotal: pct(aderenciaTotal),
    taxaAderenciaParcial: pct(aderenciaParcial),
    taxaDivergencia: pct(divergencia),
    tratamentosMaisSugeridos: topCount(sugeridosFlat),
    tratamentosMaisAtribuidos: topCount(atribuidosFlat),
    queixasMaiorAcerto,
    queixasMaiorDivergencia,
    evolucao,
  };
}
