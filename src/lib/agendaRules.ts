import { addDays } from "date-fns";
import { generateSessionDates } from "@/lib/fazerEntrevista";
import type { SessaoGerada } from "@/types/fazerEntrevista";

/**
 * Fonte ÚNICA de regras de agenda compartilhada por:
 *  - fluxo normal de entrevista
 *  - migração legado
 *  - reconciliação de legado existente
 *
 * Não recalcula datas por fora: a inteligência de datas permanece em
 * `generateSessionDates`. Aqui ficam apenas a regra de elegibilidade
 * (gera agenda agora ou não) e a normalização canônica do payload de
 * sessões, para garantir comparações determinísticas (prévia == gravação).
 */

/** Status que, por si só, geram agenda quando há restante e data de início. */
export const STATUS_GERA_AGENDA = [
  "aguardando_inicio",
  "liberado",
  "em_andamento",
] as const;

/** Status que nunca geram agenda (com motivo real). */
const MOTIVO_STATUS: Record<string, string> = {
  concluido: "Tratamento concluído.",
  cancelado: "Tratamento cancelado.",
  suspenso: "Tratamento suspenso.",
};

export type ElegibilidadeAgenda = {
  geraAgenda: boolean;
  motivoNaoGera?: string;
};

/** Restante de sessões nunca negativo. */
export function quantidadeRestante(total: number, realizada: number): number {
  const t = Number(total);
  const r = Number(realizada);
  if (!Number.isFinite(t) || !Number.isFinite(r)) return 0;
  return Math.max(t - r, 0);
}

/**
 * Decisão única "gera agenda agora?", espelhando o fluxo normal:
 *  - gera: aguardando_inicio | liberado | em_andamento, com restante > 0 e data de início.
 *  - não gera (motivo real): concluido | cancelado | suspenso; restante = 0;
 *    aguardando_agendamento sem data (segue para fila, como no fluxo normal).
 */
export function elegibilidadeAgenda(params: {
  status: string;
  restante: number;
  temDataInicio: boolean;
}): ElegibilidadeAgenda {
  const { status, restante, temDataInicio } = params;

  if (MOTIVO_STATUS[status]) {
    return { geraAgenda: false, motivoNaoGera: MOTIVO_STATUS[status] };
  }

  if (restante <= 0) {
    return { geraAgenda: false, motivoNaoGera: "Não há sessões restantes." };
  }

  if (status === "aguardando_agendamento") {
    return {
      geraAgenda: false,
      motivoNaoGera: "Aguardando agendamento: entra na fila até definir a data.",
    };
  }

  if (!(STATUS_GERA_AGENDA as readonly string[]).includes(status)) {
    return { geraAgenda: false, motivoNaoGera: "Status não gera agenda." };
  }

  if (!temDataInicio) {
    return {
      geraAgenda: false,
      motivoNaoGera: "Informe a data de início da projeção para gerar a agenda.",
    };
  }

  return { geraAgenda: true };
}

export interface ParametrosTipoAgenda {
  dia_semana: number | null;
  horario: string | null;
  frequencia_valor: number | null;
  frequencia_unidade: string | null;
}

/** Normaliza horário para "HH:MM" ou null (canônico para comparação/gravação). */
export function normalizarHorario(h: string | null | undefined): string | null {
  if (!h) return null;
  const m = /^(\d{2}):(\d{2})/.exec(h.trim());
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * Normaliza e ordena uma lista de sessões para um payload canônico,
 * evitando falso negativo por ordenação/serialização/timezone.
 */
export function normalizarSessoes(sessoes: SessaoGerada[]): SessaoGerada[] {
  return sessoes
    .map((s) => ({
      data_sessao: s.data_sessao,
      horario: normalizarHorario(s.horario),
    }))
    .sort((a, b) => {
      if (a.data_sessao !== b.data_sessao) {
        return a.data_sessao < b.data_sessao ? -1 : 1;
      }
      return (a.horario ?? "").localeCompare(b.horario ?? "");
    });
}

/**
 * Calcula a projeção restante usando EXCLUSIVAMENTE a regra oficial.
 * Compartilhada por prévia (UI) e revalidação (serviço/backend).
 */
export function projetarAgendaRestante(params: {
  status: string;
  quantidade_total: number;
  quantidade_realizada: number;
  tipo: ParametrosTipoAgenda;
  dataInicio: Date | null;
}): { geraAgenda: boolean; motivoNaoGera?: string; restante: number; sessoes: SessaoGerada[] } {
  const { status, quantidade_total, quantidade_realizada, tipo, dataInicio } = params;
  const restante = quantidadeRestante(quantidade_total, quantidade_realizada);

  const eleg = elegibilidadeAgenda({
    status,
    restante,
    temDataInicio: !!dataInicio,
  });

  if (!eleg.geraAgenda || !dataInicio) {
    return { geraAgenda: false, motivoNaoGera: eleg.motivoNaoGera, restante, sessoes: [] };
  }

  const sessoes = normalizarSessoes(
    generateSessionDates(
      dataInicio,
      tipo.dia_semana,
      normalizarHorario(tipo.horario),
      tipo.frequencia_valor || 1,
      tipo.frequencia_unidade || "semanas",
      restante,
    ),
  );

  return { geraAgenda: true, restante, sessoes };
}

/**
 * Modos de agendamento (espelham `src/constants/fazerEntrevista.ts`).
 * Mantidos aqui para a fonte única não depender de constantes da UI.
 */
export const MODO_SEQUENCIAL_BLOQUEANTE = "sequencial_bloqueante";
export const MODO_LIVRE_CONCOMITANTE = "livre_concomitante";
export const MODO_AGENDADO_POR_DATA_INICIAL = "agendado_por_data_inicial";



export interface TratamentoProjecaoInput {
  /** Identificador estável usado para mapear o resultado (ex.: vinculo_id ou index). */
  ref: string;
  tratamento_id: string;
  status: string;
  quantidade_total: number;
  quantidade_realizada: number;
  modo_agendamento: string;
  ordem_tratamento: number;
  tipo: ParametrosTipoAgenda;
  /** Data de início específica (modo por data inicial / override livre). */
  dataInicio?: Date | null;
  /** Flag estrutural do tipo: é trabalho público? (NÃO altera o modo). */
  trabalhoPublico?: boolean;
  /** Flag estrutural do tipo: permite entrada sem agendamento? (NÃO altera o modo). */
  permiteEntradaSemAgendamento?: boolean;
}

export interface TratamentoProjecaoResultado {
  ref: string;
  tratamento_id: string;
  geraAgenda: boolean;
  motivoNaoGera?: string;
  restante: number;
  sessoes: SessaoGerada[];
  /** Tratamento sequencial anterior que condiciona a liberação deste (se houver). */
  bloqueadoPorRef?: string | null;
  /** Última data projetada do tratamento anterior na cadeia (yyyy-MM-dd). */
  dataFinalAnterior?: string | null;
  /** Caso especial: tratamento público livre/concomitante com sugestões. */
  tratamentoPublicoComSugestao?: boolean;
  /** Data (yyyy-MM-dd) a partir da qual o assistido pode comparecer. */
  liberadoDesde?: string | null;
  /** O assistido já está liberado para comparecimento? */
  liberadoParaComparecimento?: boolean;
  /** Primeira ocorrência válida sugerida (yyyy-MM-dd), após a cadeia aplicável. */
  sugestoesAPartirDe?: string | null;
  /** Datas sugeridas (NÃO são agenda rígida — apenas projeção/exibição). */
  sugestoes?: SessaoGerada[];
}

/**
 * Detecta o caso público especial APENAS por metadados estruturais do tipo,
 * sem hardcode por nome. NÃO altera modo/classificação — apenas habilita a
 * camada contextual de liberação/sugestão/presença.
 */
export function isTratamentoPublicoLivre(t: {
  modo_agendamento: string;
  trabalhoPublico?: boolean;
  permiteEntradaSemAgendamento?: boolean;
}): boolean {
  return (
    t.modo_agendamento === MODO_LIVRE_CONCOMITANTE &&
    t.trabalhoPublico === true &&
    t.permiteEntradaSemAgendamento === true
  );
}

const dataParaString = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Predicado explícito de elegibilidade de uma ocorrência para contar progresso
 * em tratamento público livre. Centraliza a regra de "qual presença conta":
 *  - a ocorrência pertence ao trabalho público correto do tratamento;
 *  - não é palestra/evento genérico não vinculado;
 *  - a data é >= liberadoDesde;
 *  - há vínculo correto com o assistido_tratamento_id (quando exigido);
 *  - não houve consumo duplicado da mesma ocorrência para o mesmo progresso.
 */
export interface OcorrenciaPublica {
  /** Identificador único da ocorrência (sessão pública / presença). */
  ocorrencia_id: string;
  /** Tratamento/trabalho público ao qual a ocorrência pertence. */
  tratamento_id: string;
  /** Vínculo do assistido associado à ocorrência (quando houver). */
  assistido_tratamento_id?: string | null;
  /** Data da ocorrência (yyyy-MM-dd). */
  data_ocorrencia: string;
  /**
   * Indica explicitamente que a ocorrência é uma sessão válida do próprio
   * trabalho público (e não palestra/evento genérico). Sem isso, não conta.
   */
  vinculadaAoTrabalhoPublico: boolean;
}

export function ocorrenciaContaParaTratamentoPublico(params: {
  ocorrencia: OcorrenciaPublica;
  tratamentoId: string;
  liberadoDesde: string;
  vinculoId?: string | null;
  consumidas?: Set<string>;
}): boolean {
  const { ocorrencia, tratamentoId, liberadoDesde, vinculoId, consumidas } = params;

  // 1. Deve pertencer ao trabalho público correto do tratamento.
  if (ocorrencia.tratamento_id !== tratamentoId) return false;

  // 2. Não pode ser palestra/evento genérico não vinculado.
  if (!ocorrencia.vinculadaAoTrabalhoPublico) return false;

  // 3. A data deve ser >= liberadoDesde.
  if (ocorrencia.data_ocorrencia < liberadoDesde) return false;

  // 4. Vínculo correto, quando exigido.
  if (
    vinculoId &&
    ocorrencia.assistido_tratamento_id &&
    ocorrencia.assistido_tratamento_id !== vinculoId
  ) {
    return false;
  }

  // 5. Sem consumo duplicado da mesma ocorrência.
  if (consumidas?.has(ocorrencia.ocorrencia_id)) return false;

  return true;
}

/**
 * Projeção CONSOLIDADA de agenda para um conjunto de tratamentos, espelhando
 * EXATAMENTE a regra do fluxo normal (`submitEntrevista`):
 *  - sequencial_bloqueante: ordenados por `ordem_tratamento` e ENCADEADOS no
 *    tempo — cada um começa no dia seguinte à última sessão do anterior;
 *  - livre_concomitante: independentes, a partir de `baseStart` (ou `dataInicio`);
 *  - agendado_por_data_inicial: a partir de `dataInicio` (sem data → fila).
 *
 * Toda data continua vindo de `generateSessionDates` via `projetarAgendaRestante`.
 * Esta é a inteligência única compartilhada por fluxo normal, migração e
 * reconciliação — não existe cálculo de datas paralelo.
 */
export function projetarAgendaConsolidada(
  tratamentos: TratamentoProjecaoInput[],
  baseStart: Date,
): TratamentoProjecaoResultado[] {
  const out = new Map<string, TratamentoProjecaoResultado>();

  const projetar = (t: TratamentoProjecaoInput, inicio: Date | null) =>
    projetarAgendaRestante({
      status: t.status,
      quantidade_total: t.quantidade_total,
      quantidade_realizada: t.quantidade_realizada,
      tipo: t.tipo,
      dataInicio: inicio,
    });

  const proximaBase = (sessoes: SessaoGerada[]): Date | null => {
    if (sessoes.length === 0) return null;
    const ultima = sessoes[sessoes.length - 1].data_sessao;
    return addDays(new Date(ultima + "T12:00:00"), 1);
  };

  // 1) Sequencial bloqueante PRIMEIRO — encadeado por ordem. Resolver a cadeia
  // antes dos demais garante saber o marco posterior ao fim da cadeia aplicável.
  const sequenciais = tratamentos
    .filter(
      (x) =>
        x.modo_agendamento === MODO_SEQUENCIAL_BLOQUEANTE ||
        (x.modo_agendamento !== MODO_LIVRE_CONCOMITANTE &&
          x.modo_agendamento !== MODO_AGENDADO_POR_DATA_INICIAL),
    )
    .sort((a, b) => (a.ordem_tratamento ?? 999) - (b.ordem_tratamento ?? 999));

  let chainStart: Date = baseStart;
  let anteriorRef: string | null = null;
  let dataFinalAnterior: string | null = null;
  let cadeiaBloqueanteExiste = false;

  for (const t of sequenciais) {
    const p = projetar(t, chainStart);
    out.set(t.ref, {
      ref: t.ref,
      tratamento_id: t.tratamento_id,
      ...p,
      bloqueadoPorRef: anteriorRef,
      dataFinalAnterior,
    });
    // Avança a cadeia apenas quando o tratamento contribui com sessões reais.
    const prox = proximaBase(p.sessoes);
    if (prox) {
      chainStart = prox;
      anteriorRef = t.ref;
      dataFinalAnterior = p.sessoes[p.sessoes.length - 1].data_sessao;
      cadeiaBloqueanteExiste = true;
    }
  }

  // Marco para sugestões do caso público: fim da cadeia bloqueante aplicável,
  // quando existir; caso contrário, a própria base resolvida.
  const marcoPublico: Date = cadeiaBloqueanteExiste ? chainStart : baseStart;

  // 2) Livre concomitante — independentes (caso público tratado à parte)
  for (const t of tratamentos.filter((x) => x.modo_agendamento === MODO_LIVRE_CONCOMITANTE)) {
    if (isTratamentoPublicoLivre(t)) {
      const restante = quantidadeRestante(t.quantidade_total, t.quantidade_realizada);
      const eleg = elegibilidadeAgenda({ status: t.status, restante, temDataInicio: true });
      const liberadoDesde = dataParaString(baseStart);

      // Sugestões: primeira ocorrência válida do PRÓPRIO tratamento em/após o
      // marco posterior ao fim da cadeia (ou da base, se não houver cadeia).
      // São apenas projeção/exibição — NÃO viram agenda rígida.
      const sugestoes = eleg.geraAgenda
        ? normalizarSessoes(
            generateSessionDates(
              marcoPublico,
              t.tipo.dia_semana,
              normalizarHorario(t.tipo.horario),
              t.tipo.frequencia_valor || 1,
              t.tipo.frequencia_unidade || "semanas",
              restante,
            ),
          )
        : [];

      out.set(t.ref, {
        ref: t.ref,
        tratamento_id: t.tratamento_id,
        geraAgenda: false, // nunca gera agenda rígida
        motivoNaoGera: eleg.geraAgenda
          ? "Tratamento público livre: liberado para comparecimento com sugestões (não é agenda rígida)."
          : eleg.motivoNaoGera,
        restante,
        sessoes: [],
        tratamentoPublicoComSugestao: true,
        liberadoDesde,
        liberadoParaComparecimento: true,
        sugestoesAPartirDe: sugestoes[0]?.data_sessao ?? null,
        sugestoes,
      });
      continue;
    }

    // Livre normal: max(baseStart, dataInicio?) → usa dataInicio quando informado.
    const p = projetar(t, t.dataInicio ?? baseStart);
    out.set(t.ref, { ref: t.ref, tratamento_id: t.tratamento_id, ...p });
  }

  // 3) Agendado por data inicial — só gera se houver data
  for (const t of tratamentos.filter((x) => x.modo_agendamento === MODO_AGENDADO_POR_DATA_INICIAL)) {
    const p = projetar(t, t.dataInicio ?? null);
    out.set(t.ref, { ref: t.ref, tratamento_id: t.tratamento_id, ...p });
  }

  // Preserva a ordem de entrada
  return tratamentos.map(
    (t) =>
      out.get(t.ref) ?? {
        ref: t.ref,
        tratamento_id: t.tratamento_id,
        geraAgenda: false,
        restante: quantidadeRestante(t.quantidade_total, t.quantidade_realizada),
        sessoes: [],
      },
  );
}

/** Igualdade canônica entre dois payloads de sessões (prévia == gravação). */
export function sessoesIguais(a: SessaoGerada[], b: SessaoGerada[]): boolean {
  const na = normalizarSessoes(a);
  const nb = normalizarSessoes(b);
  if (na.length !== nb.length) return false;
  for (let i = 0; i < na.length; i++) {
    if (na[i].data_sessao !== nb[i].data_sessao) return false;
    if ((na[i].horario ?? null) !== (nb[i].horario ?? null)) return false;
  }
  return true;
}

// ===========================================================================
// NOVO MODELO: Plano previsto (etapas lógicas) + agenda ativa + histórico.
//
// `construirPlanoEtapas` é a ÚNICA fonte da estrutura do plano. Respeita SEMPRE
// a quantidade parametrizada (quantidade_total vinda de
// `tipos_tratamento.quantidade_padrao_sessoes`) — NUNCA hardcode. As datas das
// etapas futuras vêm EXCLUSIVAMENTE de `projetarAgendaRestante`
// (mesma inteligência do fluxo normal), sem cálculo paralelo.
// ===========================================================================

export type StatusEtapaPlano =
  | "prevista"
  | "ativa"
  | "realizada"
  | "ausente"
  | "suspensa"
  | "cancelada"
  | "liberada_para_comparecimento_publico";

export interface PlanoEtapa {
  numero_etapa: number;
  ordem_tratamento: number | null;
  quantidade_total_do_tratamento: number;
  status_etapa: StatusEtapaPlano;
  data_prevista: string | null;
  data_base_utilizada: string | null;
  eh_publico_livre: boolean;
  bloqueado_por_etapa_anterior: boolean;
}

export interface SessaoAtivaPlano {
  numero_etapa: number;
  data: string;
  horario: string | null;
}

export interface PlanoConstruido {
  etapas: PlanoEtapa[];
  /** Sessão real a ser ativada (null para público livre ou sem próxima). */
  sessaoAtiva: SessaoAtivaPlano | null;
  publicoLivre: boolean;
  liberadoDesde: string | null;
  sugestoesAPartirDe: string | null;
}

export interface ConstruirPlanoParams {
  status: string;
  /** Quantidade parametrizada do tipo (quantidade_padrao_sessoes). */
  quantidade_total: number;
  quantidade_realizada: number;
  ordem_tratamento: number | null;
  modo_agendamento: string;
  tipo: ParametrosTipoAgenda;
  dataInicio: Date | null;
  trabalhoPublico?: boolean;
  permiteEntradaSemAgendamento?: boolean;
  /** Marco para sugestões públicas / encadeamento (yyyy-MM-dd). */
  baseStart: Date;
  /** Estados terminais já gravados por etapa (preserva histórico). */
  statusPorEtapa?: Record<number, StatusEtapaPlano>;
}

/**
 * Constrói o plano completo de etapas lógicas de UM tratamento e indica qual
 * é a etapa/sessão ativa "na vez". Não persiste nada — é regra pura,
 * compartilhada por criação, migração, reconciliação e UI.
 */
export function construirPlanoEtapas(params: ConstruirPlanoParams): PlanoConstruido {
  const {
    status,
    quantidade_total,
    quantidade_realizada,
    ordem_tratamento,
    modo_agendamento,
    tipo,
    dataInicio,
    trabalhoPublico,
    permiteEntradaSemAgendamento,
    baseStart,
    statusPorEtapa = {},
  } = params;

  const total = Math.max(Math.trunc(Number(quantidade_total) || 0), 0);
  const realizadas = Math.max(Math.trunc(Number(quantidade_realizada) || 0), 0);
  const publicoLivre = isTratamentoPublicoLivre({
    modo_agendamento,
    trabalhoPublico,
    permiteEntradaSemAgendamento,
  });

  const etapas: PlanoEtapa[] = [];

  // ----- Caso público livre: etapas previstas/liberadas, SEM agenda rígida. -----
  if (publicoLivre) {
    const restante = quantidadeRestante(total, realizadas);
    const liberadoDesde = dataParaStr(baseStart);
    const sugestoes = normalizarSessoes(
      generateSessionDates(
        baseStart,
        tipo.dia_semana,
        normalizarHorario(tipo.horario),
        tipo.frequencia_valor || 1,
        tipo.frequencia_unidade || "semanas",
        Math.max(restante, 0),
      ),
    );
    for (let i = 1; i <= total; i++) {
      const terminal = statusPorEtapa[i];
      const status_etapa: StatusEtapaPlano =
        terminal ??
        (i <= realizadas
          ? "realizada"
          : "liberada_para_comparecimento_publico");
      etapas.push({
        numero_etapa: i,
        ordem_tratamento,
        quantidade_total_do_tratamento: total,
        status_etapa,
        data_prevista: i > realizadas ? sugestoes[i - realizadas - 1]?.data_sessao ?? null : null,
        data_base_utilizada: liberadoDesde,
        eh_publico_livre: true,
        bloqueado_por_etapa_anterior: false,
      });
    }
    return {
      etapas,
      sessaoAtiva: null,
      publicoLivre: true,
      liberadoDesde,
      sugestoesAPartirDe: sugestoes[0]?.data_sessao ?? null,
    };
  }

  // ----- Caso sequencial/livre/por-data: projeta as datas restantes. -----
  const proj = projetarAgendaRestante({
    status,
    quantidade_total: total,
    quantidade_realizada: realizadas,
    tipo,
    dataInicio,
  });

  const horario = normalizarHorario(tipo.horario);
  let sessaoAtiva: SessaoAtivaPlano | null = null;

  for (let i = 1; i <= total; i++) {
    const terminal = statusPorEtapa[i];
    const futuraIdx = i - realizadas - 1; // 0 = primeira não realizada (ativa)
    const dataFutura = futuraIdx >= 0 ? proj.sessoes[futuraIdx]?.data_sessao ?? null : null;

    let status_etapa: StatusEtapaPlano;
    if (terminal) {
      status_etapa = terminal;
    } else if (i <= realizadas) {
      status_etapa = "realizada";
    } else if (i === realizadas + 1 && proj.geraAgenda && dataFutura) {
      status_etapa = "ativa";
      sessaoAtiva = { numero_etapa: i, data: dataFutura, horario };
    } else {
      status_etapa = "prevista";
    }

    etapas.push({
      numero_etapa: i,
      ordem_tratamento,
      quantidade_total_do_tratamento: total,
      status_etapa,
      data_prevista: i > realizadas ? dataFutura : null,
      data_base_utilizada: dataInicio ? dataParaStr(dataInicio) : null,
      eh_publico_livre: false,
      bloqueado_por_etapa_anterior:
        modo_agendamento === MODO_SEQUENCIAL_BLOQUEANTE && i > realizadas + 1,
    });
  }

  return {
    etapas,
    sessaoAtiva,
    publicoLivre: false,
    liberadoDesde: null,
    sugestoesAPartirDe: null,
  };
}

function dataParaStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
