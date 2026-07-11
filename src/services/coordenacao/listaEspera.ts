import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import {
  elegibilidadeListaEspera,
  type MotivoListaEspera,
} from "@/lib/agendaRules";

/**
 * Service ÚNICO da Lista de Espera do coordenador.
 *
 * Responsável por carregar os candidatos operacionais, resolver os sinais
 * exigidos pela regra centralizada (`elegibilidadeListaEspera`) e devolver os
 * itens já prontos para a UI. É a única fonte para a página e para o contador
 * do dashboard — a elegibilidade NÃO é reimplementada em nenhum outro lugar.
 */

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

interface ListaEsperaRpcRow {
  id: string;
  assistido_id: string;
  assistido_nome: string | null;
  tratamento_id: string;
  tratamento_nome: string | null;
  quantidade_total: number | null;
  quantidade_realizada: number | null;
  entrevista_id: string | null;
  entrevista_data: string | null;
  status: string;
  tratamento_tipo: string | null;
  dia_semana: number | null;
  horario: string | null;
  frequencia_valor: number | null;
  frequencia_unidade: string | null;
  modo_agendamento: string | null;
  trabalho_publico: boolean | null;
  permite_entrada_sem_agendamento: boolean | null;
  prioridade: string | null;
  urgencia: string | null;
  origem: string | null;
  created_at: string;
  tem_sessao_futura_valida: boolean | null;
  tem_etapa_ativa_valida: boolean | null;
}

/**
 * Carrega e calcula a Lista de Espera para o coordenador `userId`.
 * Aplica a regra oficial centralizada para decidir elegibilidade + motivo.
 */
export async function carregarListaEspera(
  userId: string,
): Promise<ListaEsperaResultado> {
  const today = new Date();
  const { data, error } = await (supabase as any).rpc("fn_lista_espera_coordenador", {
    p_user_id: userId,
  });

  if (error) throw error;

  const vinculos = (data ?? []) as ListaEsperaRpcRow[];
  if (vinculos.length === 0) {
    return { itens: [], tratamentoNomes: [] };
  }

  const tratamentoNomes = Array.from(
    new Set(vinculos.map((v) => v.tratamento_nome || "—")),
  );

  const itens: ListaEsperaItem[] = [];

  for (const v of vinculos) {
    const { elegivel, motivo } = elegibilidadeListaEspera({
      status: v.status,
      quantidade_total: v.quantidade_total ?? 0,
      quantidade_realizada: v.quantidade_realizada ?? 0,
      modo_agendamento: v.modo_agendamento ?? "",
      temSessaoFuturaValida: v.tem_sessao_futura_valida ?? false,
      temEtapaAtivaValida: v.tem_etapa_ativa_valida ?? false,
      legado: (v.origem ?? "").toLowerCase() === "legado",
      trabalhoPublico: v.trabalho_publico ?? false,
      permiteEntradaSemAgendamento: v.permite_entrada_sem_agendamento ?? false,
    });

    if (!elegivel || !motivo) continue;

    const entDate = v.entrevista_data || null;
    itens.push({
      id: v.id,
      assistido_id: v.assistido_id,
      assistido_nome: v.assistido_nome || "Assistido não localizado — abrir chamado técnico",
      tratamento_id: v.tratamento_id,
      tratamento_nome: v.tratamento_nome || "—",
      quantidade_total: v.quantidade_total ?? 0,
      entrevista_data: entDate,
      status: v.status,
      tratamento_tipo: v.tratamento_tipo ?? null,
      dia_semana: v.dia_semana ?? null,
      horario: v.horario ?? null,
      frequencia_valor: v.frequencia_valor ?? 1,
      frequencia_unidade: v.frequencia_unidade ?? "semanas",
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
