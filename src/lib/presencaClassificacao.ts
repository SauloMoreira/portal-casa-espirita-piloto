/**
 * Classificação de presença — fonte ÚNICA no frontend (L-03).
 *
 * Espelha exatamente a função oficial do backend `fn_presenca_classificacao`.
 * O backend é a fonte de verdade (INV-ARQ-001); este módulo existe para que a
 * UI/relatórios NÃO infiram a semântica por conta própria (INV-ARQ-002) com
 * comparações soltas como `status === "presente"`.
 *
 * Distinção fundamental:
 *  - CLASSIFICAÇÃO GERAL  → leitura humana/histórica (o que aconteceu).
 *  - CLASSIFICAÇÃO OPERACIONAL → decisão do sistema (o que fazer).
 *
 * Mantenha este mapa SINCRONIZADO com `fn_presenca_classificacao`. Os testes
 * em `presencaClassificacao.test.ts` travam o contrato.
 */

/** Status persistido em `presencas_tratamentos.status_presenca` (classificação geral). */
export const STATUS_PRESENCA = {
  presente: "presente",
  ausente: "ausente",
  justificado: "justificado",
} as const;
export type StatusPresenca =
  (typeof STATUS_PRESENCA)[keyof typeof STATUS_PRESENCA];

export type ClassificacaoOperacional =
  | "presenca_valida"
  | "ausencia_valida"
  | "somente_historico";

export interface PresencaClassificacao {
  status: string;
  /** Como o registro é lido por humanos / histórico. */
  classificacaoGeral:
    | "presenca"
    | "ausencia"
    | "ausencia_justificada"
    | "desconhecido";
  /** Rótulo humano pronto para exibição. */
  rotuloGeral: string;
  /** Como o sistema deve tratar o registro no fluxo. */
  classificacaoOperacional: ClassificacaoOperacional;
  /** Conta como presença válida (avança o tratamento). */
  contaPresenca: boolean;
  /** Conta como ausência válida (entra em métricas de falta). */
  contaAusencia: boolean;
  /** Deve disparar remarcação automática. */
  disparaRemarcacao: boolean;
  /** Avança a sessão / promove a próxima. */
  avancaSessao: boolean;
  /** Registro apenas histórico, sem efeito operacional. */
  somenteHistorico: boolean;
  /** Evento de notificação correspondente (ou null se não notifica). */
  eventoNotificacao: "presenca_registrada" | "falta_registrada" | null;
}

const MAPA: Record<StatusPresenca, PresencaClassificacao> = {
  presente: {
    status: "presente",
    classificacaoGeral: "presenca",
    rotuloGeral: "Presença",
    classificacaoOperacional: "presenca_valida",
    contaPresenca: true,
    contaAusencia: false,
    disparaRemarcacao: false,
    avancaSessao: true,
    somenteHistorico: false,
    eventoNotificacao: "presenca_registrada",
  },
  ausente: {
    status: "ausente",
    classificacaoGeral: "ausencia",
    rotuloGeral: "Ausência",
    classificacaoOperacional: "ausencia_valida",
    contaPresenca: false,
    contaAusencia: true,
    disparaRemarcacao: true,
    avancaSessao: false,
    somenteHistorico: false,
    eventoNotificacao: "falta_registrada",
  },
  justificado: {
    status: "justificado",
    classificacaoGeral: "ausencia_justificada",
    rotuloGeral: "Ausência justificada",
    classificacaoOperacional: "somente_historico",
    contaPresenca: false,
    contaAusencia: false,
    disparaRemarcacao: false,
    avancaSessao: false,
    somenteHistorico: true,
    eventoNotificacao: null,
  },
};

/** Fallback seguro para qualquer status desconhecido: só histórico, sem efeito. */
function fallback(status: string): PresencaClassificacao {
  return {
    status: (status ?? "").toLowerCase(),
    classificacaoGeral: "desconhecido",
    rotuloGeral: "Registro técnico",
    classificacaoOperacional: "somente_historico",
    contaPresenca: false,
    contaAusencia: false,
    disparaRemarcacao: false,
    avancaSessao: false,
    somenteHistorico: true,
    eventoNotificacao: null,
  };
}

/**
 * Fonte única: classifica um `status_presenca` em sua semântica geral e
 * operacional. Espelha `fn_presenca_classificacao` do backend.
 */
export function classificarPresenca(
  status?: string | null,
): PresencaClassificacao {
  const chave = (status ?? "").toLowerCase() as StatusPresenca;
  return MAPA[chave] ?? fallback(status ?? "");
}

/** Atalho: o registro conta como presença válida (avança o tratamento)? */
export function contaComoPresenca(status?: string | null): boolean {
  return classificarPresenca(status).contaPresenca;
}

/** Atalho: o registro conta como ausência válida? */
export function contaComoAusencia(status?: string | null): boolean {
  return classificarPresenca(status).contaAusencia;
}

/** Atalho: o registro é apenas histórico (sem efeito operacional)? */
export function ehSomenteHistorico(status?: string | null): boolean {
  return classificarPresenca(status).somenteHistorico;
}

/** Atalho: rótulo humano para exibição. */
export function rotuloPresenca(status?: string | null): string {
  return classificarPresenca(status).rotuloGeral;
}
