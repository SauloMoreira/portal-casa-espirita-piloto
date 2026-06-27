import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import {
  elegibilidadeListaEspera,
  type MotivoListaEspera,
} from "@/lib/agendaRules";
import { getTratamentosCoordenados } from "@/services/coordenacao/escopo";

/**
 * Service ÚNICO da Lista de Espera do coordenador.
 *
 * Responsável por carregar os candidatos operacionais, resolver os sinais
 * exigidos pela regra centralizada (`elegibilidadeListaEspera`) e devolver os
 * itens já prontos para a UI. É a única fonte para a página e para o contador
 * do dashboard — a elegibilidade NÃO é reimplementada em nenhum outro lugar.
 */

/** Status do vínculo que podem representar pendência de coordenação. */
const STATUS_CANDIDATOS = [
  "aguardando_agendamento",
  "aguardando_inicio",
  "liberado",
  "em_andamento",
];

/** Status de agenda que contam como sessão futura realmente válida. */
const STATUS_AGENDA_VALIDA = ["agendado"];

export interface ListaEsperaItem {
  id: string;
  assistido_id: string;
  assistido_nome: string;
  tratamento_id: string;
  tratamento_nome: string;
  quantidade_total: number;
  entrevista_data: string | null;
  status: string;
  tratamento_tipo: string | null;
  dia_semana: number | null;
  horario: string | null;
  frequencia_valor: number | null;
  frequencia_unidade: string | null;
  prioridade: string;
  urgencia: string | null;
  dias_espera: number;
  motivo: MotivoListaEspera;
}

export interface ListaEsperaResultado {
  itens: ListaEsperaItem[];
  tratamentoNomes: string[];
}

/**
 * Carrega e calcula a Lista de Espera para o coordenador `userId`.
 * Aplica a regra oficial centralizada para decidir elegibilidade + motivo.
 */
export async function carregarListaEspera(
  userId: string,
): Promise<ListaEsperaResultado> {
  const tratamentosCoordenados = await getTratamentosCoordenados(userId);
  if (tratamentosCoordenados.length === 0) {
    return { itens: [], tratamentoNomes: [] };
  }

  const { data: meusTrat } = await supabase
    .from("tipos_tratamento")
    .select(
      "id, nome, tipo, dia_semana, horario, frequencia_valor, frequencia_unidade, modo_agendamento, trabalho_publico, permite_entrada_sem_agendamento",
    )
    .in("id", tratamentosCoordenados);

  if (!meusTrat || meusTrat.length === 0) {
    return { itens: [], tratamentoNomes: [] };
  }

  const tratMap = Object.fromEntries(meusTrat.map((t: any) => [t.id, t]));
  const tratIds = meusTrat.map((t: any) => t.id);
  const tratamentoNomes = meusTrat.map((t: any) => t.nome);

  const { data: vinculos } = await supabase
    .from("assistido_tratamentos")
    .select(
      "id, assistido_id, tratamento_id, quantidade_total, quantidade_realizada, status, entrevista_id, prioridade, urgencia, origem, created_at",
    )
    .in("tratamento_id", tratIds)
    .in("status", STATUS_CANDIDATOS);

  if (!vinculos || vinculos.length === 0) {
    return { itens: [], tratamentoNomes };
  }

  const vinculoIds = vinculos.map((v: any) => v.id);
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Assistidos
  const assistidoIds = [...new Set(vinculos.map((v: any) => v.assistido_id))];
  const { data: assistidos } = await supabase
    .from("assistidos")
    .select("id, nome")
    .in("id", assistidoIds);
  const assistMap = Object.fromEntries(
    (assistidos || []).map((a: any) => [a.id, a.nome]),
  );

  // Entrevistas (para a data de referência de espera)
  const entrevistaIds = vinculos.map((v: any) => v.entrevista_id).filter(Boolean);
  const { data: entrevistas } = entrevistaIds.length
    ? await supabase
        .from("entrevistas_fraternas")
        .select("id, data")
        .in("id", entrevistaIds)
    : { data: [] as any[] };
  const entMap = Object.fromEntries(
    (entrevistas || []).map((e: any) => [e.id, e.data]),
  );

  // Sessões futuras VÁLIDAS por vínculo (ativa/agendada e data >= hoje).
  const { data: agendaFutura } = await supabase
    .from("agenda_tratamentos_assistido")
    .select("assistido_tratamento_id")
    .in("assistido_tratamento_id", vinculoIds)
    .in("status", STATUS_AGENDA_VALIDA)
    .gte("data_sessao", todayStr);
  const comSessaoFutura = new Set(
    (agendaFutura || []).map((g: any) => g.assistido_tratamento_id),
  );

  // Etapas ativas válidas no novo modelo por vínculo.
  const { data: etapasAtivas } = await supabase
    .from("plano_tratamento_sessoes")
    .select("assistido_tratamento_id")
    .in("assistido_tratamento_id", vinculoIds)
    .eq("status_etapa", "ativa");
  const comEtapaAtiva = new Set(
    (etapasAtivas || []).map((p: any) => p.assistido_tratamento_id),
  );

  const itens: ListaEsperaItem[] = [];

  for (const v of vinculos as any[]) {
    const trat = tratMap[v.tratamento_id];
    if (!trat) continue;

    const { elegivel, motivo } = elegibilidadeListaEspera({
      status: v.status,
      quantidade_total: v.quantidade_total ?? 0,
      quantidade_realizada: v.quantidade_realizada ?? 0,
      modo_agendamento: trat.modo_agendamento ?? "",
      temSessaoFuturaValida: comSessaoFutura.has(v.id),
      temEtapaAtivaValida: comEtapaAtiva.has(v.id),
      legado: (v.origem ?? "").toLowerCase() === "legado",
      trabalhoPublico: trat.trabalho_publico ?? false,
      permiteEntradaSemAgendamento: trat.permite_entrada_sem_agendamento ?? false,
    });

    if (!elegivel || !motivo) continue;

    const entDate = v.entrevista_id ? entMap[v.entrevista_id] || null : null;
    itens.push({
      id: v.id,
      assistido_id: v.assistido_id,
      assistido_nome: assistMap[v.assistido_id] || "—",
      tratamento_id: v.tratamento_id,
      tratamento_nome: trat.nome || "—",
      quantidade_total: v.quantidade_total,
      entrevista_data: entDate,
      status: v.status,
      tratamento_tipo: trat.tipo ?? null,
      dia_semana: trat.dia_semana ?? null,
      horario: trat.horario ?? null,
      frequencia_valor: trat.frequencia_valor ?? 1,
      frequencia_unidade: trat.frequencia_unidade ?? "semanas",
      prioridade: v.prioridade || "normal",
      urgencia: v.urgencia || null,
      dias_espera: entDate
        ? differenceInDays(today, new Date(entDate))
        : differenceInDays(today, new Date(v.created_at)),
      motivo,
    });
  }

  return { itens, tratamentoNomes };
}

/** Contador da Lista de Espera (mesma regra/serviço da página). */
export async function contarListaEspera(userId: string): Promise<number> {
  const { itens } = await carregarListaEspera(userId);
  return itens.length;
}
