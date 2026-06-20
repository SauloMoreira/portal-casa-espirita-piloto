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

  // Livre concomitante — independentes
  for (const t of tratamentos.filter((x) => x.modo_agendamento === MODO_LIVRE_CONCOMITANTE)) {
    const p = projetar(t, t.dataInicio ?? baseStart);
    out.set(t.ref, { ref: t.ref, tratamento_id: t.tratamento_id, ...p });
  }

  // Agendado por data inicial — só gera se houver data
  for (const t of tratamentos.filter((x) => x.modo_agendamento === MODO_AGENDADO_POR_DATA_INICIAL)) {
    const p = projetar(t, t.dataInicio ?? null);
    out.set(t.ref, { ref: t.ref, tratamento_id: t.tratamento_id, ...p });
  }

  // Sequencial bloqueante — encadeado por ordem
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
    }
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
