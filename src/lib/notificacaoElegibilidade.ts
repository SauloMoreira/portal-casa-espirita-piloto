/**
 * Regra OFICIAL e ÚNICA de elegibilidade de lembrete de sessão.
 *
 * Esta é a contraparte em TypeScript da função de banco
 * `public.fn_fila_motivo_inelegivel`, que é a fonte da verdade usada por:
 *   - geração/enfileiramento (trigger `fn_notif_sessao`)
 *   - saneamento da fila (`fn_sanear_fila_notificacoes`)
 *   - dispatch (`notificacoes-dispatch`, via RPC)
 *
 * O dispatch e o saneamento chamam a função de banco diretamente (fonte única
 * de verdade no servidor). Este módulo replica a MESMA regra para uso no
 * frontend (Central de Notificações) e para os testes unitários — mantendo a
 * decisão "esta sessão pode gerar lembrete?" centralizada e consistente.
 *
 * Side-effect free e provider-agnóstico.
 */

import { lembreteVencido } from "@/lib/notificacoes";

/** Status operacionais possíveis de uma sessão na agenda (fonte da verdade). */
export const AGENDA_STATUS_ELEGIVEL = "agendado" as const;

/** Eventos da fila atrelados à agenda como fonte da verdade. */
export const EVENTOS_SESSAO = ["sessao_lembrete", "sessao_criada"] as const;
export type EventoSessao = (typeof EVENTOS_SESSAO)[number];

/** Motivos pelos quais um item da fila não deve gerar/enviar lembrete. */
export type MotivoInelegivel =
  | "item_inexistente"
  | "sessao_inexistente"
  | "sessao_substituida"
  | "sessao_cancelada"
  | "sessao_nao_agendada"
  | "lembrete_vencido"
  | "sessao_futura_nao_proxima"
  | "entrevista_inexistente"
  | "entrevista_cancelada"
  | "entrevista_remarcada"
  | "entrevista_vencida";

/** Rótulos amigáveis (pt-BR) para exibir ao administrador na Central. */
export const MOTIVO_LABEL: Record<string, string> = {
  item_inexistente: "Item inexistente",
  sessao_inexistente: "Sessão não encontrada (agenda órfã/antiga)",
  sessao_substituida: "Sessão substituída por novo plano",
  sessao_cancelada: "Sessão cancelada",
  sessao_nao_agendada: "Sessão não é mais a agenda ativa",
  lembrete_vencido: "Lembrete vencido (sessão já passou)",
  sessao_futura_nao_proxima: "Sessão futura prevista (não é a próxima real do vínculo)",
  entrevista_inexistente: "Entrevista não encontrada",
  entrevista_cancelada: "Entrevista cancelada",
  entrevista_remarcada: "Lembrete superado (entrevista remarcada)",
  entrevista_vencida: "Entrevista vencida (já passou)",
  // Motivos pré-existentes de outras travas do dispatch:
  opt_out: "Assistido optou por não receber",
  comunicacao_geral_desativada: "Comunicações gerais desativadas",
  sem_telefone: "Sem telefone cadastrado",
  telefone_invalido: "Telefone inválido",
  dados_obrigatorios_ausentes: "Dados obrigatórios ausentes",
  nome_ausente: "Nome ausente",
  template_indisponivel: "Modelo de mensagem indisponível",
  // Encerramento manual de item inviável por erro de cadastro (ação humana):
  erro_cadastro: "Encerrado manualmente — erro de cadastro",
  // Confirmação de agendamento enviada cedo demais para sessão futura distante:
  agendamento_antecipado_indevido: "Cancelado — agendamento antecipado indevido (tratamento só recebe lembrete 24h antes)",
  // Invalidação de lembretes antigos por exceção operacional:
  sessao_remarcada_por_excecao: "Lembrete invalidado (sessão remarcada por exceção)",
  entrevista_remarcada_por_excecao: "Lembrete invalidado (entrevista remarcada por exceção)",
  excecao_operacional: "Gerado por exceção operacional",
  // Mensagem manual controlada (ação humana administrativa):
  mensagem_vazia: "Mensagem vazia",
  mensagem_muito_longa: "Mensagem acima do limite permitido",
  destinatario_invalido: "Destinatário inválido",
  permissao_negada: "Sem permissão para esta ação",
};

// ============================================================================
// Mensagem MANUAL controlada (ação humana administrativa).
//
// Texto livre, mas governado: obrigatório, não vazio e com limite coerente.
// Esta é a contraparte em TS da validação da RPC oficial
// `public.fn_enfileirar_mensagem_manual`. Mantém a decisão "este texto pode
// ser enfileirado?" centralizada e testável. Side-effect free.
// ============================================================================

/** Evento de origem da fila que identifica uma mensagem manual. */
export const EVENTO_MENSAGEM_MANUAL = "mensagem_manual" as const;

/** Limite coerente de tamanho do texto livre da mensagem manual. */
export const MENSAGEM_MANUAL_MAX = 1000;

/** True quando o item da fila é uma mensagem manual (ação humana). */
export function ehMensagemManual(evento?: string | null): boolean {
  return evento === EVENTO_MENSAGEM_MANUAL;
}

export type MotivoMensagemInvalida = "mensagem_vazia" | "mensagem_muito_longa";

export interface ValidacaoMensagemManual {
  ok: boolean;
  /** Texto já normalizado (trim + colapso de espaços em branco repetidos). */
  texto: string;
  erro?: MotivoMensagemInvalida;
}

/**
 * Normaliza e valida o conteúdo de uma mensagem manual antes do envio.
 * Espelha a regra do backend: trim, não vazio e até `MENSAGEM_MANUAL_MAX`.
 */
export function validarMensagemManual(texto: string | null | undefined): ValidacaoMensagemManual {
  const normalizado = (texto ?? "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (normalizado === "") return { ok: false, texto: normalizado, erro: "mensagem_vazia" };
  if (normalizado.length > MENSAGEM_MANUAL_MAX) {
    return { ok: false, texto: normalizado, erro: "mensagem_muito_longa" };
  }
  return { ok: true, texto: normalizado };
}

/** Tradução amigável de um código de motivo/erro; devolve o próprio código se desconhecido. */
export function rotuloMotivo(codigo?: string | null): string | null {
  if (!codigo) return null;
  return MOTIVO_LABEL[codigo] ?? codigo;
}

// ============================================================================
// Encerramento manual de item da fila por ERRO DE CADASTRO.
//
// Semântica: o problema é do ITEM atual, não da pessoa. Encerrar um item NUNCA
// bloqueia o assistido, não altera opt-out/consentimento nem impede mensagens
// futuras. Contraparte da RPC `public.fn_encerrar_item_fila_erro_cadastro`.
// ============================================================================

/** Motivos (campo `erro` da fila) que caracterizam um erro de cadastro encerrável. */
export const MOTIVOS_ERRO_CADASTRO = [
  "sem_telefone",
  "telefone_invalido",
  "dados_obrigatorios_ausentes",
  "nome_ausente",
] as const;

export type MotivoErroCadastro = (typeof MOTIVOS_ERRO_CADASTRO)[number];

/** Status nos quais um item ainda está "ativo" na fila (passível de encerramento). */
const STATUS_ATIVOS_FILA = ["pendente", "agendado", "falha"] as const;

export interface ItemEncerravelInput {
  /** Status atual do item na fila. */
  status: string;
  /** Motivo técnico atual (campo `erro`). */
  erro?: string | null;
}

/**
 * Um item só pode ser encerrado pela ação "Encerrar item com erro de cadastro"
 * quando: (1) ainda está ativo na fila (não enviado nem cancelado) e (2) seu
 * motivo atual é realmente um erro de cadastro. Espelha a validação da RPC.
 */
export function podeEncerrarPorErroCadastro(item: ItemEncerravelInput): boolean {
  if (!(STATUS_ATIVOS_FILA as readonly string[]).includes(item.status)) return false;
  if (!item.erro) return false;
  return (MOTIVOS_ERRO_CADASTRO as readonly string[]).includes(item.erro);
}


/** Eventos da fila gerados pelo processamento de uma exceção operacional. */
export const EVENTOS_EXCECAO = [
  "sessao_cancelada_por_excecao",
  "sessao_remarcada_por_excecao",
  "entrevista_cancelada_por_excecao",
  "entrevista_remarcada_por_excecao",
  "publico_cancelado_por_excecao",
  "publico_remarcado_por_excecao",
] as const;

export type EventoExcecao = (typeof EVENTOS_EXCECAO)[number];

/** True quando o evento da fila foi gerado por uma exceção operacional. */
export function ehEventoExcecao(evento?: string | null): boolean {
  return !!evento && (EVENTOS_EXCECAO as readonly string[]).includes(evento);
}

export interface ElegibilidadeInput {
  /** Evento de origem do item da fila. */
  evento: string;
  /** A sessão correspondente existe na agenda? */
  existeAgenda: boolean;
  /** Status atual da sessão na agenda (quando existe). */
  agendaStatus?: string | null;
  /** Data da sessão (YYYY-MM-DD) — usada para o guard de vencimento. */
  sessaoData?: string | null;
  /** Horário da sessão (HH:MM[:SS]). */
  horario?: string | null;
  /**
   * Esta sessão é a PRÓXIMA sessão real agendada do vínculo?
   * Quando `false`, o item é cadeia futura prevista e não deve gerar lembrete.
   * `undefined` = não avaliado (mantém compatibilidade / não bloqueia).
   */
  ehProxima?: boolean;
  /** Instante de avaliação (default: agora). */
  agora?: Date;
}

/**
 * Decide o motivo de inelegibilidade de um lembrete de sessão.
 * Retorna `null` quando a sessão é elegível (agenda válida e ainda não vencida).
 *
 * Espelha exatamente a ordem de checagem da função de banco.
 */
export function motivoInelegibilidadeLembrete(
  input: ElegibilidadeInput,
): MotivoInelegivel | null {
  // Eventos não atrelados à agenda são governados em outro lugar → elegíveis aqui.
  if (!EVENTOS_SESSAO.includes(input.evento as EventoSessao)) return null;

  if (!input.existeAgenda) return "sessao_inexistente";

  const status = input.agendaStatus ?? "";
  if (status === "substituida_plano") return "sessao_substituida";
  if (status === "cancelado") return "sessao_cancelada";
  if (status !== AGENDA_STATUS_ELEGIVEL) return "sessao_nao_agendada";

  const agora = input.agora ?? new Date();
  if (input.sessaoData && lembreteVencido(input.sessaoData, input.horario ?? "", agora)) {
    return "lembrete_vencido";
  }

  // Só a PRÓXIMA sessão real do vínculo é elegível; cadeia futura prevista não.
  if (input.ehProxima === false) return "sessao_futura_nao_proxima";

  return null;
}

/** Conveniência booleana: a sessão pode gerar/enviar lembrete? */
export function sessaoElegivelParaLembrete(input: ElegibilidadeInput): boolean {
  return motivoInelegibilidadeLembrete(input) === null;
}

// ============================================================================
// Regra OFICIAL (espelho) de notificação por exceção operacional.
// Contraparte em TS de `public.fn_excecao_alvos` / `fn_processar_excecao_notificacoes`.
// ============================================================================

export type DominioExcecao = "tratamento" | "entrevista" | "publico";
export type TipoEventoExcecao = "cancelamento" | "remarcacao";

/**
 * Deriva o tipo de evento da exceção a partir do status e da presença de
 * `nova_data`. Sem `nova_data` válida → trata como cancelamento (não finge
 * remarcação).
 */
export function tipoEventoExcecao(
  status: string | null | undefined,
  novaData: string | null | undefined,
): TipoEventoExcecao {
  if (status === "remarcado" && !!novaData && novaData.trim() !== "") {
    return "remarcacao";
  }
  return "cancelamento";
}

/** Mapeia (domínio, tipo) → enum de evento da fila. */
export function eventoExcecao(
  dominio: DominioExcecao,
  tipo: TipoEventoExcecao,
): EventoExcecao {
  switch (dominio) {
    case "entrevista":
      return tipo === "remarcacao"
        ? "entrevista_remarcada_por_excecao"
        : "entrevista_cancelada_por_excecao";
    case "publico":
      return tipo === "remarcacao"
        ? "publico_remarcado_por_excecao"
        : "publico_cancelado_por_excecao";
    case "tratamento":
    default:
      return tipo === "remarcacao"
        ? "sessao_remarcada_por_excecao"
        : "sessao_cancelada_por_excecao";
  }
}

export interface AlvoExcecaoInput {
  dominio: DominioExcecao;
  /** O compromisso existe (sessão/entrevista/sessão pública)? */
  existe: boolean;
  /** Status atual do compromisso. */
  status?: string | null;
  /** Data do compromisso (YYYY-MM-DD ou ISO). */
  dataCompromisso?: string | null;
  /** Horário do compromisso. */
  horario?: string | null;
  /** Público: existe vínculo rastreável (assistido_id e/ou celular)? */
  alvoRastreavel?: boolean;
  /** Há telefone normalizado disponível? */
  telefone?: string | null;
  /** Instante de avaliação (default: agora). */
  agora?: Date;
}

/**
 * Decide se um compromisso é alvo elegível de notificação por exceção,
 * espelhando a regra oficial do banco (`fn_excecao_alvos`).
 */
export function alvoExcecaoElegivel(input: AlvoExcecaoInput): boolean {
  if (!input.existe) return false;
  const status = input.status ?? "";
  const agora = input.agora ?? new Date();

  if (input.dominio === "tratamento") {
    if (status !== AGENDA_STATUS_ELEGIVEL) return false; // agendado apenas
    if (input.dataCompromisso && lembreteVencido(input.dataCompromisso, input.horario ?? "", agora)) {
      return false; // vencida
    }
    return true;
  }

  if (input.dominio === "entrevista") {
    if (["cancelada", "remarcada", "concluida", "realizada"].includes(status)) return false;
    if (input.dataCompromisso && lembreteVencido(input.dataCompromisso, input.horario ?? "", agora)) {
      return false;
    }
    return true;
  }

  // publico: sem disparo cego — exige alvo rastreável.
  if (status === "cancelado") return false;
  if (!input.alvoRastreavel) return false;
  return true;
}

// ============================================================================
// L-02 — Diagnóstico de pendência da fila (por que um item ainda NÃO saiu).
//
// Contraparte em TS da RPC `public.fn_fila_diagnostico_pendentes`, que é a
// fonte única de verdade (espelha a ordem de decisão do dispatch). Este módulo
// só traduz o código retornado em rótulo/descrição amigáveis e dá o "tom"
// visual para a Central. Side-effect free.
// ============================================================================

/** Códigos possíveis de diagnóstico de um item pendente/agendado da fila. */
export type DiagnosticoPendencia =
  | "agendado_futuro"
  | "aguardando_janela"
  | "aguardando_limite_diario"
  | "opt_out"
  | "comunicacao_geral_desativada"
  | "sem_telefone"
  | "pendente"
  | string; // "bloqueado_inelegivel:<motivo>"

/** Tom visual sugerido para o badge de diagnóstico. */
export type DiagnosticoTom = "neutro" | "espera" | "atencao" | "bloqueio";

export interface DiagnosticoRotulo {
  label: string;
  descricao: string;
  tom: DiagnosticoTom;
}

const DIAGNOSTICO_BASE: Record<string, DiagnosticoRotulo> = {
  pendente: {
    label: "Pendente",
    descricao: "Elegível — deve ser enviada no próximo processamento da fila.",
    tom: "neutro",
  },
  agendado_futuro: {
    label: "Agendada",
    descricao: "Programada para o futuro; ainda não chegou a hora de enviar.",
    tom: "neutro",
  },
  aguardando_janela: {
    label: "Aguardando janela de envio",
    descricao: "Fora do horário permitido de envio; sai automaticamente quando a janela abrir.",
    tom: "espera",
  },
  aguardando_limite_diario: {
    label: "Aguardando limite diário",
    descricao: "Limite diário de mensagens deste assistido atingido; segue no próximo dia.",
    tom: "espera",
  },
  opt_out: {
    label: "Bloqueada — opt-out",
    descricao: "O assistido optou por não receber mensagens neste canal.",
    tom: "bloqueio",
  },
  comunicacao_geral_desativada: {
    label: "Bloqueada — comunicações gerais",
    descricao: "Comunicações gerais desativadas para este assistido.",
    tom: "bloqueio",
  },
  sem_telefone: {
    label: "Bloqueada — sem telefone",
    descricao: "Sem telefone válido cadastrado para envio.",
    tom: "bloqueio",
  },
};

/**
 * Traduz o código de diagnóstico (incl. `bloqueado_inelegivel:<motivo>`) em
 * rótulo amigável, descrição e tom visual. Devolve `null` para itens que não
 * precisam de destaque de pendência (ex.: já enviados/cancelados não passam
 * por aqui). Para códigos desconhecidos, devolve um rótulo neutro seguro.
 */
export function rotuloDiagnosticoPendencia(
  codigo?: string | null,
): DiagnosticoRotulo | null {
  if (!codigo) return null;

  if (codigo.startsWith("bloqueado_inelegivel:")) {
    const motivo = codigo.slice("bloqueado_inelegivel:".length);
    return {
      label: "Bloqueada — inelegível",
      descricao: rotuloMotivo(motivo) ?? "Item não corresponde mais à agenda válida.",
      tom: "bloqueio",
    };
  }

  return (
    DIAGNOSTICO_BASE[codigo] ?? {
      label: "Pendente",
      descricao: "Aguardando processamento.",
      tom: "neutro",
    }
  );
}
