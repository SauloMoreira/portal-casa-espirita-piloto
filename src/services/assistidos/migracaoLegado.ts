import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import {
  buildAssistidoLegadoInsert,
  validateTratamentoLegado,
  previewAgendaMigracao,
  resolverDataBaseProjecao,
  quantidadeRestante,
  type AssistidoLegadoBase,
  type TratamentoLegadoInput,
  type TipoMigracao,
} from "@/lib/migracaoLegado";
import {
  normalizarSessoes,
  projetarAgendaConsolidada,
  sessoesIguais,
  isTratamentoPublicoLivre,
  MODO_AGENDADO_POR_DATA_INICIAL,
  type ParametrosTipoAgenda,
  type TratamentoProjecaoResultado,
} from "@/lib/agendaRules";
import type { SessaoGerada } from "@/types/fazerEntrevista";

export interface MigrarAssistidoParams {
  userId: string;
  /** Quando definido, migra um assistido já existente em vez de criar novo. */
  assistidoExistenteId?: string | null;
  base: AssistidoLegadoBase;
  /** Sobrescrever dados cadastrais sensíveis de um assistido existente. */
  confirmarSobrescritaSensiveis?: boolean;
  dataMigracao: string;
  observacaoMigracao?: string | null;
  tratamentos: TratamentoLegadoInput[];
  /** Tipos oficiais por tratamento_id (agenda + modo + ordem + flags públicas). */
  tiposPorTratamento: Record<string, TipoMigracao>;
  /** Data base da projeção (yyyy-MM-dd). Piso em hoje aplicado neste contexto. */
  dataBaseProjecao?: string | null;
  /**
   * Payload da prévia exibida ao operador, por índice de tratamento. O serviço
   * recalcula e compara: só grava se for idêntico ao canônico do backend.
   */
  sessoesPrevistasPorIndice?: Record<number, SessaoGerada[]>;
  /** Confirmações administrativas por índice de tratamento. */
  confirmacoes?: Record<
    number,
    {
      statusIncompativel?: boolean;
      colisaoSessaoFutura?: boolean;
      duplicidade?: boolean;
    }
  >;
  /**
   * Quando true, grava apenas os vínculos (sem agenda rígida). Usado pelo botão
   * secundário "Salvar sem gerar agenda agora" — o assistido pode ficar sem
   * próxima sessão até uma reconciliação posterior.
   */
  pularAgenda?: boolean;
}


export interface MigrarAssistidoResult {
  assistidoId: string;
  vinculosCriados: number;
  sessoesCriadas: number;
}

const ATIVO_STATUSES = ["aguardando_inicio", "aguardando_agendamento", "liberado", "em_andamento"];

async function getVinculoAtivoExistente(assistidoId: string, tratamentoId: string) {
  const { data } = await supabase
    .from("assistido_tratamentos")
    .select("id, status")
    .eq("assistido_id", assistidoId)
    .eq("tratamento_id", tratamentoId)
    .in("status", ATIVO_STATUSES)
    .limit(1);
  return data && data.length > 0 ? data[0] : null;
}

async function getSessoesFuturas(assistidoId: string, tratamentoId: string): Promise<string[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("agenda_tratamentos_assistido")
    .select("data_sessao")
    .eq("assistido_id", assistidoId)
    .eq("tratamento_id", tratamentoId)
    .eq("status", "agendado")
    .gte("data_sessao", hoje);
  return (data ?? []).map((r: { data_sessao: string }) => r.data_sessao);
}

/**
 * Migra um assistido legado preservando o estágio atual. A agenda restante é
 * calculada pela MESMA regra oficial do fluxo normal (via `previewAgendaTratamento`).
 *
 * Garantia prévia == gravação sem confiar cegamente na UI:
 *  - o serviço recalcula a prévia no backend com os mesmos inputs;
 *  - normaliza canonicamente e compara com o payload vindo da UI;
 *  - só grava (via RPC transacional idempotente) se forem idênticos.
 */
export async function migrarAssistidoLegado(
  params: MigrarAssistidoParams,
): Promise<MigrarAssistidoResult> {
  const {
    userId,
    assistidoExistenteId,
    base,
    confirmarSobrescritaSensiveis,
    dataMigracao,
    observacaoMigracao,
    tratamentos,
    tiposPorTratamento,
    dataBaseProjecao,
    sessoesPrevistasPorIndice = {},
    confirmacoes = {},
    pularAgenda = false,
  } = params;


  if (!base.nome?.trim()) throw new Error("Informe o nome do assistido.");
  if (tratamentos.length === 0) throw new Error("Adicione ao menos um tratamento.");

  // 1. Resolver assistido (novo ou existente)
  let assistidoId: string;

  if (assistidoExistenteId) {
    assistidoId = assistidoExistenteId;
    const updatePayload: Record<string, unknown> = {
      celular: (base.celular ?? "").replace(/\D/g, "") || null,
      cep: (base.cep ?? "").replace(/\D/g, "") || null,
      logradouro: base.logradouro?.trim() || null,
      numero: base.numero?.trim() || null,
      complemento: base.complemento?.trim() || null,
      bairro: base.bairro?.trim() || null,
      cidade: base.cidade?.trim() || null,
      estado: base.estado?.trim().toUpperCase() || null,
      foto_url: base.foto_url || null,
      origem_cadastro: "legado",
      migrado_legado: true,
      data_migracao: dataMigracao,
      observacao_migracao: observacaoMigracao?.trim() || null,
    };
    if (confirmarSobrescritaSensiveis) {
      updatePayload.nome = base.nome.trim();
      updatePayload.cpf = (base.cpf ?? "").replace(/\D/g, "") || null;
      updatePayload.email = base.email?.trim() || null;
      updatePayload.data_nascimento = base.data_nascimento?.trim() || null;
    }
    const { error } = await supabase
      .from("assistidos")
      .update(updatePayload as TablesUpdate<"assistidos">)
      .eq("id", assistidoId);
    if (error) throw new Error(error.message);
  } else {
    const payload = buildAssistidoLegadoInsert(base, {
      userId,
      dataMigracao,
      observacaoMigracao,
    });
    const { data, error } = await supabase
      .from("assistidos")
      .insert(payload as TablesInsert<"assistidos">)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Erro ao cadastrar assistido.");
    assistidoId = (data as { id: string }).id;
  }

  // 2. Revalidar e montar payload canônico (backend autoritativo) via projeção
  // CONSOLIDADA única — mesma inteligência do fluxo normal. A data manual só é
  // considerada no modo agendado_por_data_inicial.
  const previa = previewAgendaMigracao(
    tratamentos.map((t) => ({
      tratamento_id: t.tratamento_id,
      status: t.status,
      quantidade_total: Number(t.quantidade_total),
      quantidade_realizada: Number(t.quantidade_realizada),
      dataInicio: t.proxima_sessao_data ?? null,
    })),
    tiposPorTratamento,
    dataBaseProjecao,
  );

  const tratamentosPayload: Array<{
    tratamento_id: string;
    status: string;
    quantidade_total: number;
    quantidade_realizada: number;
    observacao: string | null;
    sessoes: SessaoGerada[];
  }> = [];

  let sessoesCriadasPrevistas = 0;

  for (let i = 0; i < tratamentos.length; i++) {
    const t = tratamentos[i];
    const conf = confirmacoes[i] ?? {};
    const tipo = tiposPorTratamento[t.tratamento_id];
    if (!tipo) throw new Error("Parâmetros de agenda do tratamento não encontrados.");

    const proj = previa[i];

    // Caso público livre com sugestões: NÃO gera agenda rígida — sugestões são
    // apenas projeção/exibição (schema não diferencia sugestão de sessão).
    // Coerência prévia == gravação: mesmos metadados, sem gravação rígida.
    // `pularAgenda` força gravar apenas os vínculos (botão "salvar sem agendar").
    const sessoesRigidas = pularAgenda ? [] : proj.sessoes; // vazio no caso público

    // Compara com o payload exibido ao operador (quando enviado)
    const enviado = sessoesPrevistasPorIndice[i];
    if (enviado && !sessoesIguais(enviado, sessoesRigidas)) {
      throw new Error(
        "A prévia exibida divergiu do cálculo oficial. Recarregue a revisão da agenda e tente novamente.",
      );
    }

    // Revalidações de consistência imediatamente antes de gravar
    const vinculoAtivo = await getVinculoAtivoExistente(assistidoId, t.tratamento_id);
    const sessoesFuturas = sessoesRigidas.length
      ? await getSessoesFuturas(assistidoId, t.tratamento_id)
      : [];
    const colide = sessoesRigidas.some((s) => sessoesFuturas.includes(s.data_sessao));

    const errors = validateTratamentoLegado(
      {
        ...t,
        // Data manual só vale para agendado_por_data_inicial.
        proxima_sessao_data:
          tipo.modo_agendamento === MODO_AGENDADO_POR_DATA_INICIAL
            ? t.proxima_sessao_data
            : null,
      },
      {
        diaSemana: tipo.dia_semana ?? null,
        sessoesFuturas: colide ? sessoesFuturas : [],
        vinculoAtivoExistente: !!vinculoAtivo,
        confirmarStatusIncompativel: conf.statusIncompativel,
        confirmarColisaoSessaoFutura: conf.colisaoSessaoFutura,
        confirmarDuplicidade: conf.duplicidade,
      },
    );
    if (errors.length > 0) throw new Error(errors[0]);

    if (colide && !conf.colisaoSessaoFutura) {
      throw new Error(
        "Já existe sessão futura no mesmo dia para este tratamento. Confirme para prosseguir.",
      );
    }

    tratamentosPayload.push({
      tratamento_id: t.tratamento_id,
      status: t.status,
      quantidade_total: Number(t.quantidade_total),
      quantidade_realizada: Number(t.quantidade_realizada),
      observacao: t.observacao?.trim() || null,
      sessoes: normalizarSessoes(sessoesRigidas),
    });
    sessoesCriadasPrevistas += sessoesRigidas.length;
  }


  // 3. Gravação transacional e idempotente (vínculos + sessões)
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "migrar_assistido_legado_tratamento",
    {
      p_assistido_id: assistidoId,
      p_tratamentos: tratamentosPayload as unknown as Json,
    },
  );
  if (rpcErr) throw new Error(rpcErr.message);

  const result = (rpcData ?? {}) as {
    vinculos_criados?: number;
    vinculos_atualizados?: number;
    sessoes_criadas?: number;
  };

  return {
    assistidoId,
    vinculosCriados: (result.vinculos_criados ?? 0) + (result.vinculos_atualizados ?? 0),
    sessoesCriadas: result.sessoes_criadas ?? sessoesCriadasPrevistas,
  };
}

export interface ReconciliarVinculoInput {
  vinculo_id: string;
  tratamento_id: string;
  /** Status corrigido (continuidade real). */
  status: string;
  quantidade_total: number;
  quantidade_realizada: number;
  observacao?: string | null;
  /** Parâmetros oficiais de agenda do tipo de tratamento. */
  tipo: ParametrosTipoAgenda;
  /** Modo de agendamento oficial do tipo de tratamento. */
  modo_agendamento: string;
  /** Ordem oficial do tratamento (cadeia sequencial). */
  ordem_tratamento: number;
  /** Override de data inicial (modo por data inicial / livre). */
  dataInicio?: string | null;
  /** Flags estruturais do tipo (caso público livre). NÃO alteram o modo. */
  trabalho_publico?: boolean;
  permite_entrada_sem_agendamento?: boolean;
}

/**
 * Reconciliação segura de um assistido legado JÁ existente. Reutiliza a MESMA
 * inteligência oficial do fluxo normal através de `projetarAgendaConsolidada`:
 * tratamentos sequenciais são ENCADEADOS por ordem (cada um começa após a
 * última sessão do anterior) e os livres rodam em paralelo. Sem cálculo de
 * datas paralelo e sem regra própria de agenda.
 *
 * A mesma RPC idempotente é usada — reexecução não duplica agenda.
 */
export async function reconciliarAssistidoLegado(
  assistidoId: string,
  vinculos: ReconciliarVinculoInput[],
  baseStart: Date = new Date(),
): Promise<MigrarAssistidoResult> {
  const parseInicio = (s?: string | null): Date | null => {
    if (!s || !s.trim()) return null;
    const d = new Date(s.trim() + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const projecoes = projetarAgendaConsolidada(
    vinculos.map((v) => ({
      ref: v.vinculo_id,
      tratamento_id: v.tratamento_id,
      status: v.status,
      quantidade_total: v.quantidade_total,
      quantidade_realizada: v.quantidade_realizada,
      modo_agendamento: v.modo_agendamento,
      ordem_tratamento: v.ordem_tratamento,
      tipo: v.tipo,
      dataInicio: parseInicio(v.dataInicio),
      trabalhoPublico: v.trabalho_publico === true,
      permiteEntradaSemAgendamento: v.permite_entrada_sem_agendamento === true,
    })),
    baseStart,
  );

  const projPorRef = new Map(projecoes.map((p) => [p.ref, p]));

  const tratamentosPayload = vinculos.map((v) => {
    const proj = projPorRef.get(v.vinculo_id);
    return {
      vinculo_id: v.vinculo_id,
      tratamento_id: v.tratamento_id,
      status: v.status,
      quantidade_total: v.quantidade_total,
      quantidade_realizada: v.quantidade_realizada,
      observacao: v.observacao?.trim() || null,
      sessoes: normalizarSessoes(proj?.sessoes ?? []),
    };
  });

  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "migrar_assistido_legado_tratamento",
    {
      p_assistido_id: assistidoId,
      p_tratamentos: tratamentosPayload as unknown as Json,
    },
  );
  if (rpcErr) throw new Error(rpcErr.message);

  const result = (rpcData ?? {}) as {
    vinculos_criados?: number;
    vinculos_atualizados?: number;
    sessoes_criadas?: number;
  };

  return {
    assistidoId,
    vinculosCriados: (result.vinculos_criados ?? 0) + (result.vinculos_atualizados ?? 0),
    sessoesCriadas: result.sessoes_criadas ?? 0,
  };
}

// ===========================================================================
// Reconciliação oficial por assistido (prévia + execução + auditoria).
//
// Reusa EXCLUSIVAMENTE a regra oficial (`projetarAgendaConsolidada` via
// `reconciliarAssistidoLegado`). A prévia e a execução compartilham a MESMA
// base e os MESMOS inputs — a execução recalcula e compara antes de gravar
// (prévia == gravação para tudo o que for persistível).
// ===========================================================================

/** Classificação da origem de cada tratamento na reconciliação. */
export type OrigemReconciliacao = "persistivel" | "sugestao" | "nao_aplicavel";

export interface ReconciliacaoItemPreview {
  vinculo_id: string;
  tratamento_id: string;
  nome: string;
  modo_agendamento: string;
  status: string;
  ordem: number | null;
  total: number;
  realizadas: number;
  restante: number;
  origem: OrigemReconciliacao;
  geraAgenda: boolean;
  motivoNaoGera?: string;
  /** Sessões rígidas que SERÃO gravadas (vazio para sugestão/não aplicável). */
  sessoes: SessaoGerada[];
  tratamentoPublicoComSugestao?: boolean;
  liberadoDesde?: string | null;
  sugestoesAPartirDe?: string | null;
  sugestoes?: SessaoGerada[];
}

export interface ReconciliacaoPreview {
  assistidoId: string;
  /** Base resolvida (yyyy-MM-dd) — piso em hoje aplicado neste contexto. */
  baseStart: string;
  itens: ReconciliacaoItemPreview[];
  totalSessoesRigidas: number;
  totalSomenteSugestao: number;
}

interface VinculoComTipo {
  input: ReconciliarVinculoInput;
  nome: string;
}

/** Lê o estado real do assistido (vínculos + tipos) para a reconciliação. */
async function carregarVinculosReconciliacao(assistidoId: string): Promise<VinculoComTipo[]> {
  const { data: vinculos, error: errV } = await supabase
    .from("assistido_tratamentos")
    .select("id, tratamento_id, status, quantidade_total, quantidade_realizada, observacoes")
    .eq("assistido_id", assistidoId);
  if (errV) throw new Error(errV.message);

  const rows = (vinculos ?? []) as Array<{
    id: string;
    tratamento_id: string;
    status: string;
    quantidade_total: number;
    quantidade_realizada: number;
    observacoes: string | null;
  }>;

  const tipoIds = Array.from(new Set(rows.map((r) => r.tratamento_id))).filter(Boolean);
  if (tipoIds.length === 0) return [];

  const { data: tipos, error: errT } = await supabase
    .from("tipos_tratamento")
    .select(
      "id, nome, modo_agendamento, ordem_tratamento, dia_semana, horario, frequencia_valor, frequencia_unidade, trabalho_publico, permite_entrada_sem_agendamento, tratamento_livre",
    )
    .in("id", tipoIds);
  if (errT) throw new Error(errT.message);

  type TipoRow = {
    id: string;
    nome: string;
    modo_agendamento: string | null;
    ordem_tratamento: number | null;
    dia_semana: number | null;
    horario: string | null;
    frequencia_valor: number | null;
    frequencia_unidade: string | null;
    trabalho_publico: boolean | null;
    permite_entrada_sem_agendamento: boolean | null;
    tratamento_livre: boolean | null;
  };
  const tipoMap = new Map(((tipos ?? []) as TipoRow[]).map((t) => [t.id, t]));

  return rows.map((r) => {
    const tt = tipoMap.get(r.tratamento_id);
    const modo =
      tt?.modo_agendamento ??
      (tt?.tratamento_livre ? "livre_concomitante" : "sequencial_bloqueante");
    const input: ReconciliarVinculoInput = {
      vinculo_id: r.id,
      tratamento_id: r.tratamento_id,
      status: r.status,
      quantidade_total: Number(r.quantidade_total),
      quantidade_realizada: Number(r.quantidade_realizada),
      observacao: r.observacoes,
      tipo: {
        dia_semana: tt?.dia_semana ?? null,
        horario: tt?.horario ?? null,
        frequencia_valor: tt?.frequencia_valor ?? null,
        frequencia_unidade: tt?.frequencia_unidade ?? null,
      },
      modo_agendamento: modo,
      ordem_tratamento: tt?.ordem_tratamento ?? 999,
      trabalho_publico: tt?.trabalho_publico === true,
      permite_entrada_sem_agendamento: tt?.permite_entrada_sem_agendamento === true,
    };
    return { input, nome: tt?.nome ?? "Tratamento" };
  });
}

/** Projeta os vínculos do assistido pela regra oficial (igual à execução). */
function projetarReconciliacao(
  vinculos: VinculoComTipo[],
  baseStart: Date,
): Map<string, TratamentoProjecaoResultado> {
  const parseInicio = (s?: string | null): Date | null => {
    if (!s || !s.trim()) return null;
    const d = new Date(s.trim() + "T12:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const projecoes = projetarAgendaConsolidada(
    vinculos.map((v) => ({
      ref: v.input.vinculo_id,
      tratamento_id: v.input.tratamento_id,
      status: v.input.status,
      quantidade_total: v.input.quantidade_total,
      quantidade_realizada: v.input.quantidade_realizada,
      modo_agendamento: v.input.modo_agendamento,
      ordem_tratamento: v.input.ordem_tratamento,
      tipo: v.input.tipo,
      dataInicio: parseInicio(v.input.dataInicio),
      trabalhoPublico: v.input.trabalho_publico === true,
      permiteEntradaSemAgendamento: v.input.permite_entrada_sem_agendamento === true,
    })),
    baseStart,
  );
  return new Map(projecoes.map((p) => [p.ref, p]));
}

function classificarOrigem(proj: TratamentoProjecaoResultado): OrigemReconciliacao {
  if (proj.tratamentoPublicoComSugestao) return "sugestao";
  if (proj.geraAgenda && proj.sessoes.length > 0) return "persistivel";
  return "nao_aplicavel";
}

/**
 * Prévia da reconciliação oficial — sem gravar. Usa a mesma base/inputs da
 * execução para garantir prévia == gravação.
 */
export async function previewReconciliacao(
  assistidoId: string,
  baseStart?: string | Date | null,
): Promise<ReconciliacaoPreview> {
  const base = resolverDataBaseProjecao(baseStart ?? null);
  const vinculos = await carregarVinculosReconciliacao(assistidoId);
  const projMap = projetarReconciliacao(vinculos, base);

  let totalSessoesRigidas = 0;
  let totalSomenteSugestao = 0;

  const itens: ReconciliacaoItemPreview[] = vinculos
    .map((v) => {
      const proj = projMap.get(v.input.vinculo_id)!;
      const origem = classificarOrigem(proj);
      const sessoes = origem === "persistivel" ? normalizarSessoes(proj.sessoes) : [];
      if (origem === "persistivel") totalSessoesRigidas += sessoes.length;
      if (origem === "sugestao") totalSomenteSugestao += 1;
      return {
        vinculo_id: v.input.vinculo_id,
        tratamento_id: v.input.tratamento_id,
        nome: v.nome,
        modo_agendamento: v.input.modo_agendamento,
        status: v.input.status,
        ordem: v.input.ordem_tratamento ?? null,
        total: v.input.quantidade_total,
        realizadas: v.input.quantidade_realizada,
        restante: quantidadeRestante(v.input.quantidade_total, v.input.quantidade_realizada),
        origem,
        geraAgenda: proj.geraAgenda,
        motivoNaoGera: proj.motivoNaoGera,
        sessoes,
        tratamentoPublicoComSugestao: proj.tratamentoPublicoComSugestao,
        liberadoDesde: proj.liberadoDesde,
        sugestoesAPartirDe: proj.sugestoesAPartirDe,
        sugestoes: proj.sugestoes,
      } as ReconciliacaoItemPreview;
    })
    .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));

  return {
    assistidoId,
    baseStart: base.toISOString().slice(0, 10),
    itens,
    totalSessoesRigidas,
    totalSomenteSugestao,
  };
}

export interface ReconciliacaoExecucaoResult extends MigrarAssistidoResult {
  totalSomenteSugestao: number;
  reprocessamento: boolean;
  idempotenteSemNovas: boolean;
}

/**
 * Executa a reconciliação oficial: recalcula, valida (prévia == gravação para o
 * que for persistível) e grava apenas a agenda rígida pela RPC idempotente.
 * Sugestões nunca são persistidas. Registra trilha de auditoria.
 */
export async function executarReconciliacao(
  assistidoId: string,
  baseStart?: string | Date | null,
  opts: { esperado?: ReconciliacaoItemPreview[] } = {},
): Promise<ReconciliacaoExecucaoResult> {
  const base = resolverDataBaseProjecao(baseStart ?? null);
  const vinculos = await carregarVinculosReconciliacao(assistidoId);
  const projMap = projetarReconciliacao(vinculos, base);

  // prévia == gravação: compara o que será persistido com o snapshot exibido.
  if (opts.esperado) {
    const espPorVinculo = new Map(opts.esperado.map((e) => [e.vinculo_id, e]));
    for (const v of vinculos) {
      const proj = projMap.get(v.input.vinculo_id)!;
      const origem = classificarOrigem(proj);
      const persistivel = origem === "persistivel" ? proj.sessoes : [];
      const esp = espPorVinculo.get(v.input.vinculo_id);
      const espSessoes = esp && esp.origem === "persistivel" ? esp.sessoes : [];
      if (!sessoesIguais(espSessoes, persistivel)) {
        throw new Error(
          "A prévia exibida divergiu do cálculo oficial. Recarregue a reconciliação e tente novamente.",
        );
      }
    }
  }

  // Detecta reprocessamento: já havia agenda persistida antes desta execução.
  const { count: agendaAntes } = await supabase
    .from("agenda_tratamentos_assistido")
    .select("id", { count: "exact", head: true })
    .eq("assistido_id", assistidoId);

  const totalSomenteSugestao = vinculos.filter(
    (v) => classificarOrigem(projMap.get(v.input.vinculo_id)!) === "sugestao",
  ).length;

  // Execução oficial — mesma base/inputs da prévia.
  const result = await reconciliarAssistidoLegado(
    assistidoId,
    vinculos.map((v) => v.input),
    base,
  );

  const reprocessamento = (agendaAntes ?? 0) > 0;
  const idempotenteSemNovas = result.sessoesCriadas === 0;

  // Auditoria (best-effort — não interrompe a reconciliação se falhar).
  try {
    await supabase.rpc("registrar_auditoria_reconciliacao", {
      p_assistido_id: assistidoId,
      p_dados: {
        base_projecao: base.toISOString().slice(0, 10),
        sessoes_rigidas_gravadas: result.sessoesCriadas,
        tratamentos_so_sugestao: totalSomenteSugestao,
        vinculos: result.vinculosCriados,
        reprocessamento,
        idempotente_sem_novas: idempotenteSemNovas,
      } as unknown as Json,
    });
  } catch {
    // silencioso: a gravação da agenda é a operação crítica.
  }

  return {
    ...result,
    totalSomenteSugestao,
    reprocessamento,
    idempotenteSemNovas,
  };
}
