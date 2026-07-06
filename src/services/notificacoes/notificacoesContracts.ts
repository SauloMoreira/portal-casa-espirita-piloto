// ============================================================================
// Q1-C5 — Contratos tipados de retornos jsonb sensíveis da Central (WhatsApp).
//
// Centraliza as interfaces de retorno das RPCs com gate de autorização
// (`painel_conversas`, `painel_whatsapp`, `painel_whatsapp_v2`) e fornece
// funções de normalização/parse que preservam EXATAMENTE os fallbacks atuais,
// substituindo os antigos `as unknown as` sem alterar comportamento funcional.
//
// O backend continua sendo a fonte de verdade; este módulo apenas descreve
// fielmente o shape já consumido hoje pela UI.
// ============================================================================

// ===== Conversas enriquecidas (RPC painel_conversas) =====

export interface ConversaEnriquecida {
  id: string;
  telefone: string;
  assistido_id: string | null;
  assistido_nome: string | null;
  identificado: boolean;
  status_conversa: string;
  em_handoff: boolean;
  ultimo_contato_em: string | null;
  ultima_mensagem: string | null;
  total_mensagens: number;
  ultimo_autor: "assistido" | "ia" | "humano" | "sistema" | null;
  intencao: string | null;
  respondida_ia: boolean;
  handoff_motivo: string | null;
  handoff_origem: string | null;
  handoff_status: string | null;
  handoff_atendente_id: string | null;
  tem_handoff: boolean;
  atendente_nome: string | null;
  canal: string;
}

export interface ConversasResultado {
  autorizado: boolean;
  total: number;
  rows: ConversaEnriquecida[];
}

/**
 * Normaliza o retorno jsonb de `painel_conversas`.
 * Preserva o fallback atual `{ autorizado: false, total: 0, rows: [] }`.
 */
export function parseConversasResultado(data: unknown): ConversasResultado {
  const r = (data ?? {}) as Partial<ConversasResultado>;
  return {
    autorizado: r.autorizado ?? false,
    total: r.total ?? 0,
    rows: r.rows ?? [],
  };
}

// ===== Painel operacional do canal WhatsApp (RPC painel_whatsapp) =====

export interface PainelPorTipo {
  tipo: string;
  geradas: number;
  enviadas: number;
  falhas: number;
  taxa_entrega: number;
}

export interface PainelIntent {
  intent: string;
  total: number;
}

export interface PainelFalha {
  tipo: string;
  telefone: string | null;
  erro: string | null;
  quando: string | null;
}

export interface PainelWhatsapp {
  autorizado: boolean;
  periodo?: { inicio: string; fim: string };
  operacional?: {
    geradas: number;
    enviadas: number;
    falhas: number;
    pendentes: number;
    agendados: number;
    canceladas: number;
    inbound: number;
    optout: number;
    handoffs_abertos: number;
    handoffs_resolvidos: number;
    intents_ia: number;
  };
  por_tipo?: PainelPorTipo[];
  intents?: PainelIntent[];
  falhas_recentes?: PainelFalha[];
  impacto?: {
    presenca_atual_pct: number;
    presenca_anterior_pct: number;
    faltas_atual: number;
    faltas_anterior: number;
    presentes_atual: number;
    ausentes_atual: number;
    periodo_anterior: { inicio: string; fim: string };
  };
}

/**
 * Normaliza o retorno jsonb de `painel_whatsapp`.
 * Preserva o fallback atual `{ autorizado: false }`.
 */
export function parsePainelWhatsapp(data: unknown): PainelWhatsapp {
  return (data as PainelWhatsapp | null) ?? { autorizado: false };
}

// ===== Painel de métricas v2 (RPC painel_whatsapp_v2) =====

export interface SeriePonto {
  dia: string;
  geradas: number;
  enviadas: number;
  falhas: number;
  inbound: number;
}

export interface PainelV2 {
  autorizado: boolean;
  periodo?: { inicio: string; fim: string; dias: number };
  periodo_anterior?: { inicio: string; fim: string };
  entrega?: {
    geradas: number; enviadas: number; falhas: number;
    pendentes: number; agendados: number; canceladas: number;
    retries: number; tempo_medio_envio_seg: number; sem_telefone: number; inbound: number;
    falhas_por_evento: { evento: string; falhas: number; total: number }[];
    falhas_recentes: { tipo: string; evento: string; telefone: string | null; erro: string | null; retries: number; quando: string | null }[];
  };
  engajamento?: {
    inbound: number; optout: number; reativacoes: number;
    assistidos_impactados: number; media_msgs_por_assistido: number;
    horarios: { hora: number; total: number }[];
    resposta_por_tipo: { tipo: string; enviadas: number }[];
  };
  efetividade?: {
    presenca_atual_pct: number; presenca_anterior_pct: number;
    faltas_atual: number; faltas_anterior: number;
    presentes_atual: number; ausentes_atual: number;
    comparecimento_apos_lembrete_pct: number; comparecimento_base: number;
  };
  ia_humano?: {
    inbound: number; resolvidas_ia: number; handoffs: number; handoffs_resolvidos: number;
    tempo_medio_resolucao_seg: number;
    motivos: { motivo: string; total: number }[];
    intents: { intent: string; total: number; resolvida: boolean }[];
  };
  qualidade?: {
    fora_janela: number; dedup_bloqueadas: number; limite_diario_barradas: number;
    canceladas: number; sem_telefone: number; retries: number;
    por_tipo: { tipo: string; geradas: number; enviadas: number; falhas: number; taxa_entrega: number }[];
    optout_por_tipo: { tipo: string; total: number }[];
  };
  serie?: SeriePonto[];
}

/**
 * Normaliza o retorno jsonb de `painel_whatsapp_v2`.
 * Preserva o fallback atual `{ autorizado: false }`.
 */
export function parsePainelV2(data: unknown): PainelV2 {
  return (data as PainelV2 | null) ?? { autorizado: false };
}
