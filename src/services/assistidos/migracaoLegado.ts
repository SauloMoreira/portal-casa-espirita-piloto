import { supabase } from "@/integrations/supabase/client";
import {
  buildAssistidoLegadoInsert,
  validateTratamentoLegado,
  previewAgendaMigracao,
  type AssistidoLegadoBase,
  type TratamentoLegadoInput,
  type TipoMigracao,
} from "@/lib/migracaoLegado";
import {
  normalizarSessoes,
  projetarAgendaConsolidada,
  sessoesIguais,
  MODO_AGENDADO_POR_DATA_INICIAL,
  type ParametrosTipoAgenda,
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
    tipoAgendaPorTratamento,
    sessoesPrevistasPorIndice = {},
    confirmacoes = {},
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
      .update(updatePayload as never)
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
      .insert(payload as never)
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Erro ao cadastrar assistido.");
    assistidoId = (data as { id: string }).id;
  }

  // 2. Revalidar e montar payload canônico por tratamento (backend autoritativo)
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
    const tipo = tipoAgendaPorTratamento[t.tratamento_id];
    if (!tipo) throw new Error("Parâmetros de agenda do tratamento não encontrados.");

    // Recalcula a prévia no backend usando a regra oficial
    const preview = previewAgendaTratamento(t, tipo, t.proxima_sessao_data);

    // Compara com o payload exibido ao operador (quando enviado)
    const enviado = sessoesPrevistasPorIndice[i];
    if (enviado && !sessoesIguais(enviado, preview.sessoes)) {
      throw new Error(
        "A prévia exibida divergiu do cálculo oficial. Recarregue a revisão da agenda e tente novamente.",
      );
    }

    // Revalidações de consistência imediatamente antes de gravar
    const vinculoAtivo = await getVinculoAtivoExistente(assistidoId, t.tratamento_id);
    const sessoesFuturas = preview.sessoes.length
      ? await getSessoesFuturas(assistidoId, t.tratamento_id)
      : [];
    const colide = preview.sessoes.some((s) => sessoesFuturas.includes(s.data_sessao));

    const errors = validateTratamentoLegado(t, {
      diaSemana: tipo.dia_semana ?? null,
      sessoesFuturas: colide ? sessoesFuturas : [],
      vinculoAtivoExistente: !!vinculoAtivo,
      confirmarStatusIncompativel: conf.statusIncompativel,
      confirmarColisaoSessaoFutura: conf.colisaoSessaoFutura,
      confirmarDuplicidade: conf.duplicidade,
    });
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
      sessoes: normalizarSessoes(preview.sessoes),
    });
    sessoesCriadasPrevistas += preview.sessoes.length;
  }

  // 3. Gravação transacional e idempotente (vínculos + sessões)
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    "migrar_assistido_legado_tratamento",
    {
      p_assistido_id: assistidoId,
      p_tratamentos: tratamentosPayload as never,
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
      p_tratamentos: tratamentosPayload as never,
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
