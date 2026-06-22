import { supabase } from "@/integrations/supabase/client";
import {
  construirPlanoConsolidado,
  projetarAgendaRestante,
  normalizarHorario,
  isTratamentoPublicoLivre,
  MODO_SEQUENCIAL_BLOQUEANTE,
  type PlanoConsolidadoInput,
  type PlanoEtapa,
  type SessaoAtivaPlano,
  type StatusEtapaPlano,
  type ParametrosTipoAgenda,
} from "@/lib/agendaRules";
import { resolverDataBaseProjecao } from "@/lib/migracaoLegado";

/**
 * Orquestração TS do NOVO MODELO (plano previsto + agenda ativa + histórico).
 *
 * PORTA ÚNICA: toda ativação do novo modelo passa por aqui. A camada TS apenas
 * monta o plano (regra pura em `construirPlanoConsolidado`) e delega a gravação
 * transacional/idempotente às RPCs `pts_*`. Não há cálculo de datas paralelo
 * nem coexistência ambígua com o fluxo antigo (a conversão neutraliza a agenda
 * rígida no servidor).
 */

interface VinculoRow {
  id: string;
  tratamento_id: string;
  status: string;
  quantidade_total: number;
  quantidade_realizada: number;
}

interface TipoRow extends ParametrosTipoAgenda {
  id: string;
  modo_agendamento: string | null;
  tratamento_livre: boolean | null;
  ordem_tratamento: number | null;
  trabalho_publico: boolean | null;
  permite_entrada_sem_agendamento: boolean | null;
}

const ATIVO_OU_FUTURO = [
  "aguardando_inicio",
  "aguardando_agendamento",
  "liberado",
  "em_andamento",
  "concluido",
  "suspenso",
];

function modoDe(tt: TipoRow | undefined): string {
  return (
    tt?.modo_agendamento ??
    (tt?.tratamento_livre ? "livre_concomitante" : MODO_SEQUENCIAL_BLOQUEANTE)
  );
}

async function carregarContexto(assistidoId: string) {
  const { data: vinculos, error: errV } = await supabase
    .from("assistido_tratamentos")
    .select("id, tratamento_id, status, quantidade_total, quantidade_realizada")
    .eq("assistido_id", assistidoId)
    .in("status", ATIVO_OU_FUTURO);
  if (errV) throw new Error(errV.message);

  const vinc = (vinculos ?? []) as VinculoRow[];
  const tipoIds = Array.from(new Set(vinc.map((v) => v.tratamento_id))).filter(Boolean);

  let tipos: TipoRow[] = [];
  if (tipoIds.length > 0) {
    const { data: tt, error: errT } = await supabase
      .from("tipos_tratamento")
      .select(
        "id, modo_agendamento, tratamento_livre, ordem_tratamento, dia_semana, horario, frequencia_valor, frequencia_unidade, trabalho_publico, permite_entrada_sem_agendamento",
      )
      .in("id", tipoIds);
    if (errT) throw new Error(errT.message);
    tipos = (tt ?? []) as TipoRow[];
  }
  const tipoMap = new Map(tipos.map((t) => [t.id, t]));
  return { vinc, tipoMap };
}

/** Carrega estados terminais já gravados por etapa (preserva histórico). */
async function carregarStatusPorEtapa(
  vinculoIds: string[],
): Promise<Map<string, Record<number, StatusEtapaPlano>>> {
  const out = new Map<string, Record<number, StatusEtapaPlano>>();
  if (vinculoIds.length === 0) return out;
  const { data, error } = await supabase
    .from("plano_tratamento_sessoes")
    .select("assistido_tratamento_id, numero_etapa, status_etapa")
    .in("assistido_tratamento_id", vinculoIds)
    .in("status_etapa", ["realizada", "ausente", "suspensa", "cancelada"]);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as {
    assistido_tratamento_id: string;
    numero_etapa: number;
    status_etapa: StatusEtapaPlano;
  }[]) {
    const m = out.get(r.assistido_tratamento_id) ?? {};
    m[r.numero_etapa] = r.status_etapa;
    out.set(r.assistido_tratamento_id, m);
  }
  return out;
}

function montarInputs(
  vinc: VinculoRow[],
  tipoMap: Map<string, TipoRow>,
  statusPorEtapa: Map<string, Record<number, StatusEtapaPlano>>,
): PlanoConsolidadoInput[] {
  return vinc.map((v) => {
    const tt = tipoMap.get(v.tratamento_id);
    return {
      ref: v.id,
      tratamento_id: v.tratamento_id,
      status: v.status,
      quantidade_total: v.quantidade_total,
      quantidade_realizada: v.quantidade_realizada,
      modo_agendamento: modoDe(tt),
      ordem_tratamento: tt?.ordem_tratamento ?? 999,
      tipo: {
        dia_semana: tt?.dia_semana ?? null,
        horario: tt?.horario ?? null,
        frequencia_valor: tt?.frequencia_valor ?? null,
        frequencia_unidade: tt?.frequencia_unidade ?? null,
      },
      trabalhoPublico: tt?.trabalho_publico === true,
      permiteEntradaSemAgendamento: tt?.permite_entrada_sem_agendamento === true,
      statusPorEtapa: statusPorEtapa.get(v.id),
    };
  });
}

function etapasParaPayload(etapas: PlanoEtapa[]) {
  return etapas.map((e) => ({
    numero_etapa: e.numero_etapa,
    ordem_tratamento: e.ordem_tratamento,
    quantidade_total_do_tratamento: e.quantidade_total_do_tratamento,
    status_etapa: e.status_etapa,
    data_prevista: e.data_prevista,
    data_base_utilizada: e.data_base_utilizada,
    eh_publico_livre: e.eh_publico_livre,
    bloqueado_por_etapa_anterior: e.bloqueado_por_etapa_anterior,
    origem: "plano",
  }));
}

function sessaoAtivaParaPayload(s: SessaoAtivaPlano | null) {
  if (!s) return null;
  return { numero_etapa: s.numero_etapa, data: s.data, horario: s.horario };
}

export interface ConverterResult {
  planos: number;
  sessoes_neutralizadas: number;
}

/**
 * PORTA ÚNICA de conversão de um assistido para o novo modelo (piloto/homologação).
 * Monta o plano consolidado (apenas a próxima etapa ativa) e delega à RPC
 * transacional `pts_converter_assistido`, que liga o gate por assistido,
 * neutraliza a agenda longa e grava o plano de forma idempotente.
 */
export async function converterAssistidoParaPlano(
  assistidoId: string,
): Promise<ConverterResult> {
  const { vinc, tipoMap } = await carregarContexto(assistidoId);
  if (vinc.length === 0) throw new Error("Assistido sem tratamentos ativos para converter.");

  const statusPorEtapa = await carregarStatusPorEtapa(vinc.map((v) => v.id));
  const baseStart = resolverDataBaseProjecao(null);
  const planos = construirPlanoConsolidado(
    montarInputs(vinc, tipoMap, statusPorEtapa),
    baseStart,
  );

  const payload = planos.map((p) => ({
    vinculo_id: p.ref,
    etapas: etapasParaPayload(p.plano.etapas),
    sessao_ativa: sessaoAtivaParaPayload(p.plano.sessaoAtiva),
  }));

  const { data, error } = await supabase.rpc("pts_converter_assistido", {
    p_assistido_id: assistidoId,
    p_planos: payload as never,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { planos?: number; sessoes_neutralizadas?: number };
  return { planos: r.planos ?? 0, sessoes_neutralizadas: r.sessoes_neutralizadas ?? 0 };
}

export interface RollbackResult {
  sessoes_removidas: number;
  sessoes_restauradas: number;
  etapas_removidas: number;
}

/** Reverte o piloto (reversão estrutural não destrutiva). Apenas administradores. */
export async function reverterPilotoPlano(assistidoId: string): Promise<RollbackResult> {
  const { data, error } = await supabase.rpc("pts_rollback_piloto", {
    p_assistido_id: assistidoId,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as unknown as RollbackResult;
  return {
    sessoes_removidas: r.sessoes_removidas ?? 0,
    sessoes_restauradas: r.sessoes_restauradas ?? 0,
    etapas_removidas: r.etapas_removidas ?? 0,
  };
}

/** Reconstrói/ativa a próxima etapa necessária do assistido (idempotente). */
export async function reconciliarPlanoAssistido(assistidoId: string): Promise<void> {
  const { vinc, tipoMap } = await carregarContexto(assistidoId);
  if (vinc.length === 0) return;
  const statusPorEtapa = await carregarStatusPorEtapa(vinc.map((v) => v.id));
  const baseStart = resolverDataBaseProjecao(null);
  const planos = construirPlanoConsolidado(
    montarInputs(vinc, tipoMap, statusPorEtapa),
    baseStart,
  );
  for (const p of planos) {
    const { error } = await supabase.rpc("pts_persistir_plano", {
      p_vinculo_id: p.ref,
      p_etapas: etapasParaPayload(p.plano.etapas) as never,
      p_sessao_ativa: sessaoAtivaParaPayload(p.plano.sessaoAtiva) as never,
    });
    if (error) throw new Error(error.message);
  }
}

/** Próxima etapa/data dentro do MESMO vínculo, ou null se conclui. */
function calcularProximaEtapa(
  vinc: VinculoRow,
  tt: TipoRow | undefined,
  numeroEtapaAtiva: number,
  baseStart: Date,
): { numero_etapa: number; data: string; horario: string | null } | null {
  const novaRealizada = vinc.quantidade_realizada + 1;
  if (novaRealizada >= vinc.quantidade_total) return null; // conclui
  if (isTratamentoPublicoLivre({
    modo_agendamento: modoDe(tt),
    trabalhoPublico: tt?.trabalho_publico === true,
    permiteEntradaSemAgendamento: tt?.permite_entrada_sem_agendamento === true,
  })) {
    return null; // público livre não tem etapa rígida ativa
  }
  const tipo: ParametrosTipoAgenda = {
    dia_semana: tt?.dia_semana ?? null,
    horario: tt?.horario ?? null,
    frequencia_valor: tt?.frequencia_valor ?? null,
    frequencia_unidade: tt?.frequencia_unidade ?? null,
  };
  const proj = projetarAgendaRestante({
    status: "em_andamento",
    quantidade_total: vinc.quantidade_total,
    quantidade_realizada: novaRealizada,
    tipo,
    dataInicio: baseStart,
  });
  const primeira = proj.sessoes[0];
  if (!proj.geraAgenda || !primeira) return null;
  return {
    numero_etapa: numeroEtapaAtiva + 1,
    data: primeira.data_sessao,
    horario: normalizarHorario(tipo.horario),
  };
}

export interface PresencaResult {
  concluido: boolean;
  quantidade_realizada: number;
  quantidade_total: number;
}

/** Registra presença na etapa ativa e avança para a próxima (porta única). */
export async function registrarPresencaPlano(
  vinculoId: string,
  data: string,
  registradoPor: string,
): Promise<PresencaResult> {
  const { data: vincRow, error: errV } = await supabase
    .from("assistido_tratamentos")
    .select("id, tratamento_id, status, quantidade_total, quantidade_realizada, assistido_id")
    .eq("id", vinculoId)
    .single();
  if (errV || !vincRow) throw new Error(errV?.message ?? "Vínculo não encontrado.");
  const vinc = vincRow as VinculoRow & { assistido_id: string };

  const { data: tt } = await supabase
    .from("tipos_tratamento")
    .select(
      "id, modo_agendamento, tratamento_livre, ordem_tratamento, dia_semana, horario, frequencia_valor, frequencia_unidade, trabalho_publico, permite_entrada_sem_agendamento",
    )
    .eq("id", vinc.tratamento_id)
    .maybeSingle();

  const { data: etapaAtiva } = await supabase
    .from("plano_tratamento_sessoes")
    .select("numero_etapa")
    .eq("assistido_tratamento_id", vinculoId)
    .eq("status_etapa", "ativa")
    .order("numero_etapa")
    .limit(1)
    .maybeSingle();
  const numeroAtiva = (etapaAtiva as { numero_etapa: number } | null)?.numero_etapa
    ?? vinc.quantidade_realizada + 1;

  const baseStart = resolverDataBaseProjecao(null);
  const prox = calcularProximaEtapa(vinc, tt as TipoRow | undefined, numeroAtiva, baseStart);

  const { data: resp, error } = await supabase.rpc("pts_registrar_presenca", {
    p_vinculo_id: vinculoId,
    p_data: data,
    p_registrado_por: vinc.assistido_id ? undefined : undefined,
    p_proxima_numero_etapa: prox?.numero_etapa ?? undefined,
    p_proxima_data: prox?.data ?? undefined,
    p_proxima_horario: prox?.horario ?? undefined,
  } as never);
  if (error) throw new Error(error.message);

  const r = (resp ?? {}) as unknown as PresencaResult;
  // Encadeamento sequencial: se concluiu, ativa a próxima etapa necessária.
  if (r.concluido) {
    await reconciliarPlanoAssistido(vinc.assistido_id);
  }
  return r;
}

export interface AusenciaResult {
  suspenso: boolean;
  faltas_consecutivas: number;
  remarcacoes_automaticas: number;
}

/** Registra ausência remarcando SOMENTE a etapa atual (porta única). */
export async function registrarAusenciaPlano(
  vinculoId: string,
  data: string,
  registradoPor: string,
): Promise<AusenciaResult> {
  const { data: vincRow, error: errV } = await supabase
    .from("assistido_tratamentos")
    .select("id, tratamento_id, quantidade_total, quantidade_realizada")
    .eq("id", vinculoId)
    .single();
  if (errV || !vincRow) throw new Error(errV?.message ?? "Vínculo não encontrado.");
  const vinc = vincRow as VinculoRow;

  const { data: tt } = await supabase
    .from("tipos_tratamento")
    .select("id, dia_semana, horario, frequencia_valor, frequencia_unidade")
    .eq("id", vinc.tratamento_id)
    .maybeSingle();
  const tipo = tt as ParametrosTipoAgenda | null;

  // Nova data = próxima data válida APÓS a falta, para a MESMA etapa.
  const aposFalta = new Date(data + "T12:00:00");
  aposFalta.setDate(aposFalta.getDate() + 1);
  const proj = projetarAgendaRestante({
    status: "em_andamento",
    quantidade_total: vinc.quantidade_total,
    quantidade_realizada: Math.max(vinc.quantidade_total - 1, vinc.quantidade_realizada),
    tipo: tipo ?? { dia_semana: null, horario: null, frequencia_valor: null, frequencia_unidade: null },
    dataInicio: aposFalta,
  });
  const novaData = proj.sessoes[0]?.data_sessao ?? null;

  const { data: resp, error } = await supabase.rpc("pts_registrar_ausencia", {
    p_vinculo_id: vinculoId,
    p_data: data,
    p_registrado_por: registradoPor,
    p_nova_data: novaData ?? undefined,
    p_nova_horario: normalizarHorario(tipo?.horario) ?? undefined,
  } as never);
  if (error) throw new Error(error.message);

  const r = (resp ?? {}) as unknown as AusenciaResult;
  return {
    suspenso: r.suspenso ?? false,
    faltas_consecutivas: r.faltas_consecutivas ?? 0,
    remarcacoes_automaticas: r.remarcacoes_automaticas ?? 0,
  };
}
