import { supabase } from "@/integrations/supabase/client";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";
import type { Json } from "@/integrations/supabase/types";
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
import {
  registrarPresencaRpc,
  registrarAusenciaRpc,
  rollbackPilotoRpc,
  homologacaoAuditarRpc,
  type RollbackResult,
  type PresencaResult,
  type AusenciaResult,
} from "@/services/agendaPlano/planoRpcService";

export type { RollbackResult, PresencaResult, AusenciaResult };

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
    horario_previsto: e.horario_previsto,
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
    p_planos: payload as unknown as Json,
  });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as { planos?: number; sessoes_neutralizadas?: number };
  return { planos: r.planos ?? 0, sessoes_neutralizadas: r.sessoes_neutralizadas ?? 0 };
}

/** Reverte o piloto (reversão estrutural não destrutiva). Apenas administradores. */
export async function reverterPilotoPlano(assistidoId: string): Promise<RollbackResult> {
  return rollbackPilotoRpc(assistidoId);
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
      p_etapas: etapasParaPayload(p.plano.etapas) as unknown as Json,
      p_sessao_ativa: sessaoAtivaParaPayload(p.plano.sessaoAtiva) as unknown as Json,
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

  const r = await registrarPresencaRpc({
    vinculoId,
    data,
    registradoPor,
    proximaNumeroEtapa: prox?.numero_etapa ?? undefined,
    proximaData: prox?.data ?? undefined,
    proximaHorario: prox?.horario ?? undefined,
  });

  // Encadeamento sequencial: se concluiu, ativa a próxima etapa necessária.
  if (r.concluido) {
    await reconciliarPlanoAssistido(vinc.assistido_id);
  }
  return r;
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
    .select("id, tipo, dia_semana, horario, frequencia_valor, frequencia_unidade")
    .eq("id", vinc.tratamento_id)
    .maybeSingle();
  const tipo = tt as (ParametrosTipoAgenda & { tipo?: string | null }) | null;

  // Horário efetivo na remarcação: preserva override operacional por sessão.
  // Precedência: agenda da sessão ativa → horario_previsto da etapa ativa →
  // horário padrão do tipo (fallback final).
  const { data: etapaAtivaRow } = await supabase
    .from("plano_tratamento_sessoes")
    .select("horario_previsto, agenda_sessao_id")
    .eq("assistido_tratamento_id", vinculoId)
    .eq("status_etapa", "ativa")
    .order("numero_etapa")
    .limit(1)
    .maybeSingle();
  const etapaAtiva = etapaAtivaRow as
    | { horario_previsto: string | null; agenda_sessao_id: string | null }
    | null;

  let horarioSessaoAtual: string | null = null;
  if (etapaAtiva?.agenda_sessao_id) {
    const { data: agendaRow } = await supabase
      .from("agenda_tratamentos_assistido")
      .select("horario")
      .eq("id", etapaAtiva.agenda_sessao_id)
      .maybeSingle();
    horarioSessaoAtual = (agendaRow as { horario: string | null } | null)?.horario ?? null;
  }

  const novoHorario =
    normalizarHorario(horarioSessaoAtual) ??
    normalizarHorario(etapaAtiva?.horario_previsto) ??
    normalizarHorario(tipo?.horario);

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

  const r = await registrarAusenciaRpc({
    vinculoId,
    data,
    registradoPor,
    novaData: novaData ?? undefined,
    novaHorario: novoHorario ?? undefined,
  });

  return {
    suspenso: r.suspenso ?? false,
    faltas_consecutivas: r.faltas_consecutivas ?? 0,
    remarcacoes_automaticas: r.remarcacoes_automaticas ?? 0,
  };
}

// ===========================================================================
// ROTEADOR OPERACIONAL (Presença/Painel do Tarefeiro)
// ---------------------------------------------------------------------------
// Decide entre o NOVO MODELO (remarca/avança o plano) e o LEGADO em runtime.
// Critério oficial e ESTRITO: vínculo só é "novo modelo" quando o gate
// `assistidos.usa_agenda_plano = true` E existe plano em
// `plano_tratamento_sessoes`. As flags vindas da UI são apenas hints; a rota
// final é SEMPRE revalidada aqui contra o estado atual do backend.
// NUNCA converte/reconcilia: legado permanece legado.
// ===========================================================================

/** Existe ao menos uma etapa de plano para o vínculo? */
export async function vinculoTemPlano(vinculoId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from("plano_tratamento_sessoes")
    .select("id", { count: "exact", head: true })
    .eq("assistido_tratamento_id", vinculoId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

/** Gate oficial: assistido do vínculo habilitado no novo modelo. */
export async function vinculoUsaNovoModelo(vinculoId: string): Promise<boolean> {
  const { data: vincRow, error: errV } = await supabase
    .from("assistido_tratamentos")
    .select("assistido_id")
    .eq("id", vinculoId)
    .maybeSingle();
  if (errV) throw new Error(errV.message);
  const assistidoId = (vincRow as { assistido_id: string } | null)?.assistido_id;
  if (!assistidoId) return false;
  const { data: aRow, error: errA } = await supabase
    .from("assistidos")
    .select("usa_agenda_plano")
    .eq("id", assistidoId)
    .maybeSingle();
  if (errA) throw new Error(errA.message);
  return (aRow as { usa_agenda_plano: boolean | null } | null)?.usa_agenda_plano === true;
}

export type StatusPresenca = "presente" | "ausente";

export interface RoteamentoPresencaParams {
  vinculoId: string;
  status: StatusPresenca;
  data: string;
  registradoPor: string;
  /** Hint da UI (performance); a rota final é revalidada no serviço. */
  temPlano?: boolean;
  /** Hint da UI (performance); a rota final é revalidada no serviço. */
  usaNovoModelo?: boolean;
}

export interface RoteamentoPresencaResult {
  rota: "plano" | "legado";
  usaNovoModelo: boolean;
  temPlano: boolean;
  remarcacaoAplicavel: boolean;
}

/**
 * Roteia presença/ausência operacional para o novo modelo ou o legado.
 * Revalida SEMPRE o estado real (gate + plano) antes de decidir a rota.
 */
export async function registrarPresencaRoteada(
  params: RoteamentoPresencaParams,
): Promise<RoteamentoPresencaResult> {
  const { vinculoId, status, data, registradoPor } = params;

  // Revalidação obrigatória: nunca confiar cegamente nas flags da UI.
  const usaNovoModelo =
    params.usaNovoModelo === false ? false : await vinculoUsaNovoModelo(vinculoId);
  const temPlano =
    params.temPlano === false ? false : await vinculoTemPlano(vinculoId);

  const ehNovoModelo = usaNovoModelo === true && temPlano === true;

  if (ehNovoModelo) {
    if (status === "presente") {
      await registrarPresencaPlano(vinculoId, data, registradoPor);
    } else {
      await registrarAusenciaPlano(vinculoId, data, registradoPor);
    }
    return { rota: "plano", usaNovoModelo, temPlano, remarcacaoAplicavel: status === "ausente" };
  }

  // LEGADO: registra presença/ausência sem remarcar, converter ou reconciliar.
  const { error } = await supabase.rpc("registrar_presenca", {
    p_assistido_tratamento_id: vinculoId,
    p_data: data,
    p_status_presenca: status,
    p_registrado_por: registradoPor,
  });
  if (error) throw new Error(error.message);
  return { rota: "legado", usaNovoModelo, temPlano, remarcacaoAplicavel: false };
}


// HOMOLOGAÇÃO CONTROLADA (painel admin)
// ---------------------------------------------------------------------------
// Superfície administrativa segura para conduzir a homologação do novo modelo:
// prévia obrigatória, conversão pela porta única, rollback controlado (com
// trava de segurança), reprocessamento idempotente e auditoria. NÃO há lógica
// de agenda paralela aqui: tudo reusa `construirPlanoConsolidado` (regra pura)
// e as RPCs `pts_*` (gravação transacional). Conversão e rollback já auditam
// no servidor; prévia e reprocessamento auditam via `pts_homologacao_auditar`.
// ===========================================================================

/** Estado do gate (global + por assistido) para exibição no painel. */
export interface GateHomologacao {
  global_ativo: boolean;
  assistido_ativo: boolean;
}

export async function obterGateHomologacao(assistidoId: string): Promise<GateHomologacao> {
  const { data: regra } = await supabase
    .from("regras_operacionais")
    .select("valor")
    .eq("chave", "agenda_plano_ativo")
    .maybeSingle();
  const { data: a } = await supabase
    .from("assistidos")
    .select("usa_agenda_plano")
    .eq("id", assistidoId)
    .maybeSingle();
  const valor = (regra as { valor?: string } | null)?.valor;
  return {
    global_ativo: valor === "true" || valor === "1",
    assistido_ativo: (a as { usa_agenda_plano?: boolean } | null)?.usa_agenda_plano === true,
  };
}

/** Item de prévia por tratamento (vínculo) — o que será gerado na conversão. */
export interface PreviaConversaoItem {
  vinculo_id: string;
  tratamento_id: string;
  tratamento_nome: string;
  modo_agendamento: string;
  ordem_tratamento: number | null;
  quantidade_parametrizada: number | null;
  quantidade_total: number;
  quantidade_realizada: number;
  etapas_previstas: number;
  etapa_ativa_numero: number | null;
  agenda_ativa_data: string | null;
  agenda_ativa_horario: string | null;
  publico_livre: boolean;
  sugestoes_a_partir_de: string | null;
  sessoes_a_substituir: number;
}

export interface PreviaConversao {
  assistido_id: string;
  itens: PreviaConversaoItem[];
  total_planos: number;
  total_etapas: number;
  total_sessoes_ativas: number;
  total_sessoes_a_substituir: number;
}

/**
 * PRÉVIA OBRIGATÓRIA: calcula (sem gravar) exatamente o que a porta única
 * `converterAssistidoParaPlano` produziria. Usa o MESMO motor de regra
 * (`construirPlanoConsolidado`) e a MESMA data-base, garantindo prévia == efeito.
 */
export async function gerarPreviaConversao(assistidoId: string): Promise<PreviaConversao> {
  const { vinc, tipoMap } = await carregarContexto(assistidoId);
  if (vinc.length === 0) throw new Error("Assistido sem tratamentos ativos para converter.");

  const statusPorEtapa = await carregarStatusPorEtapa(vinc.map((v) => v.id));
  const baseStart = resolverDataBaseProjecao(null);
  const planos = construirPlanoConsolidado(
    montarInputs(vinc, tipoMap, statusPorEtapa),
    baseStart,
  );

  const tipoIds = Array.from(new Set(vinc.map((v) => v.tratamento_id))).filter(Boolean);
  const nomePorTipo = new Map<string, { nome: string; qtd: number | null }>();
  if (tipoIds.length > 0) {
    const { data: tt } = await supabase
      .from("tipos_tratamento")
      .select("id, nome, quantidade_padrao_sessoes")
      .in("id", tipoIds);
    for (const t of (tt ?? []) as { id: string; nome: string; quantidade_padrao_sessoes: number | null }[]) {
      nomePorTipo.set(t.id, { nome: t.nome, qtd: t.quantidade_padrao_sessoes });
    }
  }

  const hojeStr = baseStart.toISOString().slice(0, 10);
  const substituirPorVinculo = new Map<string, number>();
  {
    const { data: ag } = await supabase
      .from("agenda_tratamentos_assistido")
      .select("assistido_tratamento_id, status, data_sessao")
      .eq("assistido_id", assistidoId)
      .eq("status", "agendado");
    for (const a of (ag ?? []) as { assistido_tratamento_id: string; data_sessao: string }[]) {
      if (a.data_sessao >= hojeStr) {
        substituirPorVinculo.set(
          a.assistido_tratamento_id,
          (substituirPorVinculo.get(a.assistido_tratamento_id) ?? 0) + 1,
        );
      }
    }
  }

  const planoPorRef = new Map(planos.map((p) => [p.ref, p]));
  const itens: PreviaConversaoItem[] = vinc.map((v) => {
    const tt = tipoMap.get(v.tratamento_id);
    const meta = nomePorTipo.get(v.tratamento_id);
    const p = planoPorRef.get(v.id);
    const plano = p?.plano;
    return {
      vinculo_id: v.id,
      tratamento_id: v.tratamento_id,
      tratamento_nome: meta?.nome ?? "Tratamento",
      modo_agendamento: modoDe(tt),
      ordem_tratamento: tt?.ordem_tratamento ?? null,
      quantidade_parametrizada: meta?.qtd ?? null,
      quantidade_total: v.quantidade_total,
      quantidade_realizada: v.quantidade_realizada,
      etapas_previstas: plano?.etapas.length ?? 0,
      etapa_ativa_numero: plano?.sessaoAtiva?.numero_etapa ?? null,
      agenda_ativa_data: plano?.sessaoAtiva?.data ?? null,
      agenda_ativa_horario: plano?.sessaoAtiva?.horario ?? null,
      publico_livre: plano?.publicoLivre ?? false,
      sugestoes_a_partir_de: plano?.sugestoesAPartirDe ?? null,
      sessoes_a_substituir: substituirPorVinculo.get(v.id) ?? 0,
    };
  });

  const resumo: PreviaConversao = {
    assistido_id: assistidoId,
    itens,
    total_planos: itens.length,
    total_etapas: itens.reduce((s, i) => s + i.etapas_previstas, 0),
    total_sessoes_ativas: itens.filter((i) => i.agenda_ativa_data).length,
    total_sessoes_a_substituir: itens.reduce((s, i) => s + i.sessoes_a_substituir, 0),
  };

  await homologacaoAuditarRpc({
    assistidoId,
    acao: "PLANO_PREVIA_HOMOLOGACAO",
    resultado: {
      total_planos: resumo.total_planos,
      total_etapas: resumo.total_etapas,
      total_sessoes_ativas: resumo.total_sessoes_ativas,
      total_sessoes_a_substituir: resumo.total_sessoes_a_substituir,
    },
  });

  return resumo;
}

/** Resultado da avaliação de segurança do rollback. */
export interface RollbackSeguranca {
  seguro: boolean;
  motivo: string | null;
  etapas_realizadas: number;
  etapas_ausentes: number;
  presencas_pos_conversao: number;
}

/**
 * Avalia se o rollback limpo ainda é operacionalmente seguro. Deixa de ser
 * seguro quando o assistido já avançou no novo modelo (qualquer etapa
 * realizada/ausente/suspensa, ou presença registrada).
 */
export async function avaliarSegurancaRollback(assistidoId: string): Promise<RollbackSeguranca> {
  const { data: etapas } = await supabase
    .from("plano_tratamento_sessoes")
    .select("status_etapa")
    .eq("assistido_id", assistidoId);
  const rows = (etapas ?? []) as { status_etapa: string }[];
  const realizadas = rows.filter((e) => e.status_etapa === "realizada").length;
  const ausentes = rows.filter((e) =>
    e.status_etapa === "ausente" || e.status_etapa === "suspensa",
  ).length;

  const { data: vinc } = await supabase
    .from("assistido_tratamentos")
    .select("id")
    .eq("assistido_id", assistidoId);
  const vincIds = ((vinc ?? []) as { id: string }[]).map((v) => v.id);
  let presencas = 0;
  if (vincIds.length > 0) {
    const { count } = await supabase
      .from("presencas_tratamentos")
      .select("id", { count: "exact", head: true })
      .in("assistido_tratamento_id", vincIds);
    presencas = count ?? 0;
  }

  const avancou = realizadas > 0 || ausentes > 0 || presencas > 0;
  return {
    seguro: !avancou,
    motivo: avancou
      ? "Assistido já avançou no novo modelo (há execução registrada). Rollback limpo não é mais apropriado — use reconciliação corretiva."
      : null,
    etapas_realizadas: realizadas,
    etapas_ausentes: ausentes,
    presencas_pos_conversao: presencas,
  };
}

/**
 * Rollback CONTROLADO: revalida a segurança antes de chamar a porta única
 * `reverterPilotoPlano`. Se não for mais seguro, lança erro orientando
 * reconciliação corretiva (defesa em profundidade junto da trava de UI).
 */
export async function rollbackControladoPlano(assistidoId: string): Promise<RollbackResult> {
  const seg = await avaliarSegurancaRollback(assistidoId);
  if (!seg.seguro) {
    throw new Error(seg.motivo ?? "Rollback não é mais seguro para este assistido.");
  }
  return reverterPilotoPlano(assistidoId);
}

/** Reprocessamento idempotente pelo painel (reconcilia + audita). */
export async function reprocessarAssistidoHomologacao(assistidoId: string): Promise<void> {
  await reconciliarPlanoAssistido(assistidoId);
  await homologacaoAuditarRpc({
    assistidoId,
    acao: "PLANO_REPROCESSAMENTO_HOMOLOGACAO",
    resultado: { reconciliado: true },
  });
}
