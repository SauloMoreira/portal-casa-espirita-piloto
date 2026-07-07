import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { addDays, format, getDay } from "date-fns";
import { generateSessionDates, buildValidDesignacoes } from "@/lib/fazerEntrevista";
import { MODO_AGENDAMENTO, VINCULO_STATUS_RESETAVEL } from "@/constants/fazerEntrevista";
import type {
  EntrevistaAssistido,
  EntrevistaInitialData,
  EntrevistaDesignacao,
  EntrevistaTipoTratamento,
  SubmitEntrevistaParams,
  SubmitEntrevistaResult,
} from "@/types/fazerEntrevista";

const ASSISTIDO_SELECT =
  "id, nome, cpf, celular, email, status, quantidade_palestras";

const TRATAMENTO_SELECT =
  "id, nome, tipo, dia_semana, horario, frequencia_valor, frequencia_unidade, status, ordem_tratamento, tratamento_livre, bloqueia_proximo_tratamento, modo_agendamento, quantidade_padrao_sessoes, trabalho_publico, permite_entrada_sem_agendamento";

export async function fetchInitialData(): Promise<EntrevistaInitialData> {
  const [{ data: assist }, { data: trat }, { data: config }] = await Promise.all([
    supabase.from("assistidos").select(ASSISTIDO_SELECT).is("deleted_at", null).order("nome"),
    supabase.from("tipos_tratamento").select(TRATAMENTO_SELECT).eq("status", "ativo"),
    supabase.from("configuracoes_gerais").select("chave, valor"),
  ]);

  let minPalestras = 3;
  let permitirLivre = true;
  if (config) {
    const minP = config.find((c) => c.chave === "quantidade_minima_palestras");
    const livre = config.find((c) => c.chave === "permitir_entrevista_livre");
    if (minP) minPalestras = parseInt(minP.valor);
    if (livre) permitirLivre = livre.valor === "true";
  }

  return {
    assistidos: (assist as EntrevistaAssistido[]) || [],
    tratamentos: (trat as EntrevistaTipoTratamento[]) || [],
    minPalestras,
    permitirLivre,
  };
}

export async function fetchEntrevistaContext(entrevistaId: string) {
  const { data } = await supabase
    .from("entrevistas_fraternas")
    .select("data, tipo_entrevista, observacoes")
    .eq("id", entrevistaId)
    .maybeSingle();
  return data;
}

export async function isCpfCadastrado(cpfClean: string): Promise<boolean> {
  const { data } = await supabase
    .from("assistidos")
    .select("id")
    .eq("cpf", cpfClean)
    .is("deleted_at", null);
  return !!data && data.length > 0;
}

export async function insertAssistido(
  payload: Record<string, unknown>
): Promise<{ data: EntrevistaAssistido | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("assistidos")
    .insert(payload as TablesInsert<"assistidos">)
    .select(ASSISTIDO_SELECT)
    .single();
  return { data: data as EntrevistaAssistido | null, error };
}

async function reconcileExistingTreatments(assistidoId: string, entrevistaId: string) {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: existingVinculos } = await supabase
    .from("assistido_tratamentos")
    .select("id, tratamento_id, quantidade_realizada, status")
    .eq("assistido_id", assistidoId)
    .eq("entrevista_id", entrevistaId);

  if (!existingVinculos || existingVinculos.length === 0) return;

  for (const vinculo of existingVinculos) {
    await supabase
      .from("agenda_tratamentos_assistido")
      .delete()
      .eq("assistido_tratamento_id", vinculo.id)
      .eq("status", "agendado")
      .gte("data_sessao", today);

    if (
      vinculo.quantidade_realizada === 0 &&
      (VINCULO_STATUS_RESETAVEL as readonly string[]).includes(vinculo.status)
    ) {
      await supabase
        .from("agenda_tratamentos_assistido")
        .delete()
        .eq("assistido_tratamento_id", vinculo.id);
      await supabase.from("assistido_tratamentos").delete().eq("id", vinculo.id);
    }
  }
}

async function reconcileOrphanedTreatments(assistidoId: string) {
  const { data: orphanedVinculos } = await supabase
    .from("assistido_tratamentos")
    .select("id, quantidade_realizada, status")
    .eq("assistido_id", assistidoId)
    .is("entrevista_id", null);

  if (!orphanedVinculos) return;

  const today = format(new Date(), "yyyy-MM-dd");
  for (const vinculo of orphanedVinculos) {
    await supabase
      .from("agenda_tratamentos_assistido")
      .delete()
      .eq("assistido_tratamento_id", vinculo.id)
      .eq("status", "agendado")
      .gte("data_sessao", today);

    if (
      vinculo.quantidade_realizada === 0 &&
      (VINCULO_STATUS_RESETAVEL as readonly string[]).includes(vinculo.status)
    ) {
      await supabase
        .from("agenda_tratamentos_assistido")
        .delete()
        .eq("assistido_tratamento_id", vinculo.id);
      await supabase.from("assistido_tratamentos").delete().eq("id", vinculo.id);
    }
  }
}

/**
 * Orchestrates the full interview submission. All DB logic, triggers and
 * business rules that already live in the database remain untouched — this
 * only coordinates the existing flow exactly as before.
 */
export async function submitEntrevista(
  params: SubmitEntrevistaParams
): Promise<SubmitEntrevistaResult> {
  const {
    selectedAssistido,
    userId,
    dataEntrevista,
    tipoEntrevista,
    observacoes,
    quantidades,
    datasIniciais,
    horarios,
    tratamentoMap,
    agendaEntrevistaId,
  } = params;

  /** Horário efetivo do tratamento: override do entrevistador ou padrão sugerido do tipo. */
  const horarioEfetivo = (tratamentoId: string): string | null =>
    horarios[tratamentoId]?.trim() || tratamentoMap[tratamentoId]?.horario || null;

  const validDesignacoes = buildValidDesignacoes(quantidades, tratamentoMap);

  // Reconcile existing realized interviews
  const { data: existingEntrevistas } = await supabase
    .from("entrevistas_fraternas")
    .select("id")
    .eq("assistido_id", selectedAssistido.id)
    .eq("status", "realizada");

  if (existingEntrevistas && existingEntrevistas.length > 0) {
    for (const existing of existingEntrevistas) {
      await reconcileExistingTreatments(selectedAssistido.id, existing.id);
    }
  }

  await reconcileOrphanedTreatments(selectedAssistido.id);

  // Create or update the interview
  let entrevistaId: string;
  if (agendaEntrevistaId) {
    const { error: updErr } = await supabase
      .from("entrevistas_fraternas")
      .update({
        entrevistador_id: userId,
        data: dataEntrevista + "T00:00:00",
        tipo_entrevista: tipoEntrevista,
        observacoes: observacoes || null,
        status: "realizada",
      })
      .eq("id", agendaEntrevistaId);
    if (updErr) throw new Error(updErr.message);
    entrevistaId = agendaEntrevistaId;
  } else {
    const { data: entrevista, error: entErr } = await supabase
      .from("entrevistas_fraternas")
      .insert({
        assistido_id: selectedAssistido.id,
        entrevistador_id: userId,
        data: dataEntrevista + "T00:00:00",
        tipo_entrevista: tipoEntrevista,
        observacoes: observacoes || null,
        status: "realizada",
      })
      .select("id")
      .single();
    if (entErr || !entrevista) throw new Error(entErr?.message || "Erro ao salvar entrevista");
    entrevistaId = entrevista.id;
  }

  const entrevistaDate = new Date(dataEntrevista + "T12:00:00");

  // Group treatments by modo_agendamento
  const groupA: EntrevistaDesignacao[] = [];
  const groupB: EntrevistaDesignacao[] = [];
  const groupC: EntrevistaDesignacao[] = [];

  for (const d of validDesignacoes) {
    const trat = tratamentoMap[d.tratamento_id];
    if (!trat) continue;
    const modo =
      trat.modo_agendamento ||
      (trat.tratamento_livre
        ? MODO_AGENDAMENTO.livreConcomitante
        : MODO_AGENDAMENTO.sequencialBloqueante);
    if (modo === MODO_AGENDAMENTO.agendadoPorDataInicial) {
      groupC.push(d);
    } else if (modo === MODO_AGENDAMENTO.livreConcomitante) {
      groupB.push(d);
    } else {
      groupA.push(d);
    }
  }

  groupA.sort((a, b) => {
    const oa = tratamentoMap[a.tratamento_id]?.ordem_tratamento ?? 999;
    const ob = tratamentoMap[b.tratamento_id]?.ordem_tratamento ?? 999;
    return oa - ob;
  });

  const findExistingActiveVinculo = async (tratamentoId: string) => {
    const { data } = await supabase
      .from("assistido_tratamentos")
      .select("id, quantidade_realizada, quantidade_total, status")
      .eq("assistido_id", selectedAssistido.id)
      .eq("tratamento_id", tratamentoId)
      .gt("quantidade_realizada", 0)
      .in("status", ["em_andamento", "aguardando_inicio"])
      .limit(1);
    return data && data.length > 0 ? data[0] : null;
  };

  const createTratamentoSchedule = async (
    d: EntrevistaDesignacao,
    startDate: Date
  ): Promise<Date> => {
    const trat = tratamentoMap[d.tratamento_id];
    if (!trat) return startDate;

    const existingVinculo = await findExistingActiveVinculo(d.tratamento_id);
    let vinculoId: string;

    if (existingVinculo) {
      const newTotal = Math.max(d.quantidade_total, existingVinculo.quantidade_realizada);
      await supabase
        .from("assistido_tratamentos")
        .update({ quantidade_total: newTotal, entrevista_id: entrevistaId })
        .eq("id", existingVinculo.id);
      vinculoId = existingVinculo.id;

      const remaining = newTotal - existingVinculo.quantidade_realizada;
      if (remaining <= 0) return startDate;

      const sessions = generateSessionDates(
        startDate,
        trat.dia_semana,
        horarioEfetivo(d.tratamento_id),
        trat.frequencia_valor || 1,
        trat.frequencia_unidade || "semanas",
        remaining
      );

      if (sessions.length > 0) {
        const agendaRows = sessions.map((s) => ({
          assistido_id: selectedAssistido.id,
          assistido_tratamento_id: vinculoId,
          tratamento_id: d.tratamento_id,
          data_sessao: s.data_sessao,
          horario: s.horario,
          status: "agendado",
          registrado_por: userId,
        }));
        await supabase.from("agenda_tratamentos_assistido").insert(agendaRows as TablesInsert<"agenda_tratamentos_assistido">[]);
        const lastSession = sessions[sessions.length - 1];
        return addDays(new Date(lastSession.data_sessao + "T12:00:00"), 1);
      }
      return startDate;
    }

    const { data: vinculo, error: vErr } = await supabase
      .from("assistido_tratamentos")
      .insert({
        assistido_id: selectedAssistido.id,
        tratamento_id: d.tratamento_id,
        quantidade_total: d.quantidade_total,
        quantidade_realizada: 0,
        status: "aguardando_inicio",
        entrevista_id: entrevistaId,
        created_by: userId,
      })
      .select("id")
      .single();

    if (vErr || !vinculo) return startDate;
    vinculoId = vinculo.id;

    const sessions = generateSessionDates(
      startDate,
      trat.dia_semana,
      horarioEfetivo(d.tratamento_id),
      trat.frequencia_valor || 1,
      trat.frequencia_unidade || "semanas",
      d.quantidade_total
    );

    if (sessions.length > 0) {
      const agendaRows = sessions.map((s) => ({
        assistido_id: selectedAssistido.id,
        assistido_tratamento_id: vinculoId,
        tratamento_id: d.tratamento_id,
        data_sessao: s.data_sessao,
        horario: s.horario,
        status: "agendado",
        registrado_por: userId,
      }));
      await supabase.from("agenda_tratamentos_assistido").insert(agendaRows as never);
      const lastSession = sessions[sessions.length - 1];
      return addDays(new Date(lastSession.data_sessao + "T12:00:00"), 1);
    }

    return startDate;
  };

  // Group B (free) — from interview date
  for (const d of groupB) {
    await createTratamentoSchedule(d, entrevistaDate);
  }

  // Group C (agendado_por_data_inicial) — date provided or wait list
  for (const d of groupC) {
    const startDateStr = datasIniciais[d.tratamento_id];
    if (startDateStr) {
      const startDate = new Date(startDateStr + "T12:00:00");
      await createTratamentoSchedule(d, startDate);
    } else {
      const trat = tratamentoMap[d.tratamento_id];
      if (!trat) continue;
      const existingVinculo = await findExistingActiveVinculo(d.tratamento_id);
      if (existingVinculo) {
        const newTotal = Math.max(d.quantidade_total, existingVinculo.quantidade_realizada);
        await supabase
          .from("assistido_tratamentos")
          .update({
            quantidade_total: newTotal,
            entrevista_id: entrevistaId,
            status: "aguardando_agendamento",
          })
          .eq("id", existingVinculo.id);
      } else {
        await supabase.from("assistido_tratamentos").insert({
          assistido_id: selectedAssistido.id,
          tratamento_id: d.tratamento_id,
          quantidade_total: d.quantidade_total,
          quantidade_realizada: 0,
          status: "aguardando_agendamento",
          entrevista_id: entrevistaId,
          created_by: userId,
        } as never);
      }
    }
  }

  // Group A (sequential blocking) — chained
  if (groupA.length > 0) {
    let chainStartDate = entrevistaDate;
    for (const d of groupA) {
      chainStartDate = await createTratamentoSchedule(d, chainStartDate);
    }
  }

  // Update assistido status
  await supabase
    .from("assistidos")
    .update({ status: validDesignacoes.length > 0 ? "em_tratamento" : "entrevistado" })
    .eq("id", selectedAssistido.id);

  return { entrevistaId, validDesignacoesCount: validDesignacoes.length };
}

export function validateDatasIniciais(
  quantidades: Record<string, string>,
  datasIniciais: Record<string, string>,
  tratamentoMap: Record<string, EntrevistaTipoTratamento>,
  diasSemana: readonly string[]
): { ok: true } | { ok: false; tratamento: string; dia: string } {
  const valid = buildValidDesignacoes(quantidades, tratamentoMap);
  for (const d of valid) {
    const trat = tratamentoMap[d.tratamento_id];
    if (
      trat &&
      trat.modo_agendamento === MODO_AGENDAMENTO.agendadoPorDataInicial &&
      datasIniciais[d.tratamento_id]
    ) {
      if (trat.dia_semana !== null) {
        const selectedDate = new Date(datasIniciais[d.tratamento_id] + "T12:00:00");
        if (getDay(selectedDate) !== trat.dia_semana) {
          return { ok: false, tratamento: trat.nome, dia: diasSemana[trat.dia_semana] };
        }
      }
    }
  }
  return { ok: true };
}
