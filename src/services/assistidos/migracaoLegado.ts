import { supabase } from "@/integrations/supabase/client";
import {
  buildAssistidoLegadoInsert,
  buildVinculoLegadoInsert,
  buildProximaSessaoInsert,
  validateTratamentoLegado,
  type AssistidoLegadoBase,
  type TratamentoLegadoInput,
} from "@/lib/migracaoLegado";

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
  /** dia_semana cadastrado por tratamento_id (0-6 ou null). */
  diaSemanaPorTratamento?: Record<string, number | null>;
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
  return (data ?? []).map((r: any) => r.data_sessao);
}

/**
 * Migra um assistido legado: marca origem legado, cria/atualiza o assistido,
 * registra os vínculos de tratamento em andamento e, quando informado e válido,
 * cria a próxima sessão. Não cria entrevistas nem histórico passado e não infere
 * estado global além de marcar o assistido como em tratamento na criação.
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
    diaSemanaPorTratamento = {},
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
    // Dados sensíveis só são sobrescritos com confirmação explícita.
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

  // 2. Tratamentos
  let vinculosCriados = 0;
  let sessoesCriadas = 0;

  for (let i = 0; i < tratamentos.length; i++) {
    const t = tratamentos[i];
    const conf = confirmacoes[i] ?? {};

    const vinculoAtivo = await getVinculoAtivoExistente(assistidoId, t.tratamento_id);
    const sessoesFuturas = t.proxima_sessao_data
      ? await getSessoesFuturas(assistidoId, t.tratamento_id)
      : [];

    const errors = validateTratamentoLegado(t, {
      diaSemana: diaSemanaPorTratamento[t.tratamento_id] ?? null,
      sessoesFuturas,
      vinculoAtivoExistente: !!vinculoAtivo,
      confirmarStatusIncompativel: conf.statusIncompativel,
      confirmarColisaoSessaoFutura: conf.colisaoSessaoFutura,
      confirmarDuplicidade: conf.duplicidade,
    });
    if (errors.length > 0) {
      throw new Error(errors[0]);
    }

    const { data: vinculo, error: vErr } = await supabase
      .from("assistido_tratamentos")
      .insert(buildVinculoLegadoInsert(assistidoId, t, userId) as never)
      .select("id")
      .single();
    if (vErr || !vinculo) throw new Error(vErr?.message || "Erro ao criar vínculo de tratamento.");
    vinculosCriados++;

    const sessaoRow = buildProximaSessaoInsert(
      assistidoId,
      (vinculo as { id: string }).id,
      t,
      userId,
    );
    if (sessaoRow) {
      const { error: sErr } = await supabase
        .from("agenda_tratamentos_assistido")
        .insert(sessaoRow as never);
      if (sErr) throw new Error(sErr.message);
      sessoesCriadas++;
    }
  }

  return { assistidoId, vinculosCriados, sessoesCriadas };
}
