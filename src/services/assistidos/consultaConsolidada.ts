import { supabase } from "@/integrations/supabase/client";
import {
  projetarAgendaConsolidada,
  type TratamentoProjecaoResultado,
} from "@/lib/agendaRules";
import { resolverDataBaseProjecao } from "@/lib/migracaoLegado";

/**
 * Consulta consolidada do assistido (somente leitura) para conferência
 * administrativa. Reaproveita as fontes oficiais já existentes:
 *  - assistidos
 *  - assistido_tratamentos (+ tipos_tratamento)
 *  - agenda_tratamentos_assistido
 *  - presencas_tratamentos
 *
 * Não cria estrutura paralela: apenas lê e organiza para exibição.
 */

export interface AssistidoResumoBusca {
  id: string;
  nome: string;
  celular: string | null;
  cpf: string | null;
  email: string | null;
  status: string | null;
  origem_cadastro: string | null;
  migrado_legado: boolean | null;
}

export interface AssistidoCabecalho extends AssistidoResumoBusca {
  data_migracao: string | null;
  observacao_migracao: string | null;
  foto_url: string | null;
}

/** Origem da informação de "próxima sessão" exibida na tela consolidada. */
export type OrigemProxima = "agendada" | "projetada" | "sugestao" | "sem_proxima";

export interface TratamentoConsolidado {
  vinculo_id: string;
  tratamento_id: string;
  tratamento_nome: string;
  ordem_tratamento: number | null;
  modo_agendamento: string;
  status: string;
  quantidade_total: number;
  quantidade_realizada: number;
  quantidade_faltante: number;
  origem: string | null;
  observacoes: string | null;
  observacao_migracao: string | null;
  sequencial_bloqueante: boolean;
  bloqueia_proximo: boolean;
  /** Origem da próxima sessão: persistida, projetada, sugestão ou nenhuma. */
  proxima_origem: OrigemProxima;
  /** Data (yyyy-MM-dd) da próxima sessão/sugestão, conforme `proxima_origem`. */
  proxima_data: string | null;
  /** Caso público livre: liberado desde / a partir de (sugestões). */
  publico: boolean;
  liberado_desde: string | null;
  sugestoes_a_partir_de: string | null;
}

export interface SessaoConsolidada {
  id: string;
  vinculo_id: string;
  tratamento_id: string;
  tratamento_nome: string;
  data_sessao: string;
  horario: string | null;
  status: string;
  /** Status de presença lançado (se houver registro). */
  status_presenca?: string | null;
}

export interface VisaoConsolidada {
  assistido: AssistidoCabecalho;
  tratamentos: TratamentoConsolidado[];
  sessoes: SessaoConsolidada[];
}

const onlyDigits = (s: string) => s.replace(/\D/g, "");

/** Busca rápida de assistidos por nome, celular, CPF ou e-mail. */
export async function buscarAssistidos(termo: string): Promise<AssistidoResumoBusca[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const digitos = onlyDigits(q);
  const filtros = [`nome.ilike.%${q}%`, `email.ilike.%${q}%`];
  if (digitos.length >= 3) {
    filtros.push(`celular.ilike.%${digitos}%`);
    filtros.push(`cpf.ilike.%${digitos}%`);
  }

  const { data, error } = await supabase
    .from("assistidos")
    .select("id, nome, celular, cpf, email, status, origem_cadastro, migrado_legado")
    .is("deleted_at", null)
    .or(filtros.join(","))
    .order("nome")
    .limit(25);

  if (error) throw new Error(error.message);
  return (data ?? []) as AssistidoResumoBusca[];
}

/** Carrega a visão consolidada completa de um assistido. */
export async function carregarVisaoConsolidada(assistidoId: string): Promise<VisaoConsolidada> {
  const { data: assistido, error: errA } = await supabase
    .from("assistidos")
    .select(
      "id, nome, celular, cpf, email, status, origem_cadastro, migrado_legado, data_migracao, observacao_migracao, foto_url",
    )
    .eq("id", assistidoId)
    .maybeSingle();
  if (errA) throw new Error(errA.message);
  if (!assistido) throw new Error("Assistido não encontrado.");

  const { data: vinculos, error: errV } = await supabase
    .from("assistido_tratamentos")
    .select(
      "id, tratamento_id, status, quantidade_total, quantidade_realizada, quantidade_faltante, origem, observacoes, observacao_migracao, created_at",
    )
    .eq("assistido_id", assistidoId);
  if (errV) throw new Error(errV.message);

  type VinculoRow = {
    id: string;
    tratamento_id: string;
    status: string;
    quantidade_total: number;
    quantidade_realizada: number;
    quantidade_faltante: number;
    origem: string | null;
    observacoes: string | null;
    observacao_migracao: string | null;
    created_at: string;
  };

  const { data: agenda, error: errS } = await supabase
    .from("agenda_tratamentos_assistido")
    .select("id, assistido_tratamento_id, tratamento_id, data_sessao, horario, status")
    .eq("assistido_id", assistidoId)
    .order("data_sessao");
  if (errS) throw new Error(errS.message);

  type AgendaRow = {
    id: string;
    assistido_tratamento_id: string;
    tratamento_id: string;
    data_sessao: string;
    horario: string | null;
    status: string;
  };

  // Carrega os tipos de tratamento referenciados (sem FK declarada → join em JS).
  const tipoIds = Array.from(
    new Set([
      ...((vinculos ?? []) as VinculoRow[]).map((v) => v.tratamento_id),
      ...((agenda ?? []) as AgendaRow[]).map((a) => a.tratamento_id),
    ]),
  ).filter(Boolean);

  type TipoRow = {
    id: string;
    nome: string;
    ordem_tratamento: number | null;
    modo_agendamento: string | null;
    tratamento_livre: boolean | null;
    bloqueia_proximo_tratamento: boolean | null;
    dia_semana: number | null;
    horario: string | null;
    frequencia_valor: number | null;
    frequencia_unidade: string | null;
    trabalho_publico: boolean | null;
    permite_entrada_sem_agendamento: boolean | null;
  };

  let tipos: TipoRow[] = [];
  if (tipoIds.length > 0) {
    const { data: tt, error: errT } = await supabase
      .from("tipos_tratamento")
      .select(
        "id, nome, ordem_tratamento, modo_agendamento, tratamento_livre, bloqueia_proximo_tratamento, dia_semana, horario, frequencia_valor, frequencia_unidade, trabalho_publico, permite_entrada_sem_agendamento",
      )
      .in("id", tipoIds);
    if (errT) throw new Error(errT.message);
    tipos = (tt ?? []) as TipoRow[];
  }
  const tipoMap = new Map(tipos.map((t) => [t.id, t]));

  // Camada A — Persistido: próxima sessão futura realmente agendada por vínculo.
  const hojeStr = new Date().toISOString().slice(0, 10);
  const proximaPersistidaPorVinculo = new Map<string, string>();
  for (const a of ((agenda ?? []) as AgendaRow[])
    .filter((a) => a.status === "agendado" && a.data_sessao >= hojeStr)
    .sort((x, y) => x.data_sessao.localeCompare(y.data_sessao))) {
    if (!proximaPersistidaPorVinculo.has(a.assistido_tratamento_id)) {
      proximaPersistidaPorVinculo.set(a.assistido_tratamento_id, a.data_sessao);
    }
  }

  // Camada B — Projetado pela regra oficial (mesmo motor do fluxo normal).
  // Usado apenas quando NÃO há persistido suficiente para o próximo passo.
  const baseStart = resolverDataBaseProjecao(null);
  const projMap = new Map<string, TratamentoProjecaoResultado>();
  {
    const vinculosRows = (vinculos ?? []) as VinculoRow[];
    const inputs = vinculosRows.map((v) => {
      const tt = tipoMap.get(v.tratamento_id);
      const modo =
        tt?.modo_agendamento ?? (tt?.tratamento_livre ? "livre_concomitante" : "sequencial_bloqueante");
      return {
        ref: v.id,
        tratamento_id: v.tratamento_id,
        status: v.status,
        quantidade_total: v.quantidade_total,
        quantidade_realizada: v.quantidade_realizada,
        modo_agendamento: modo,
        ordem_tratamento: tt?.ordem_tratamento ?? 999,
        tipo: {
          dia_semana: tt?.dia_semana ?? null,
          horario: tt?.horario ?? null,
          frequencia_valor: tt?.frequencia_valor ?? null,
          frequencia_unidade: tt?.frequencia_unidade ?? null,
        },
        trabalhoPublico: tt?.trabalho_publico === true,
        permiteEntradaSemAgendamento: tt?.permite_entrada_sem_agendamento === true,
      };
    });
    for (const p of projetarAgendaConsolidada(inputs, baseStart)) projMap.set(p.ref, p);
  }

  const tratamentos: TratamentoConsolidado[] = ((vinculos ?? []) as VinculoRow[])
    .map((v) => {
      const tt = tipoMap.get(v.tratamento_id);
      const modo =
        tt?.modo_agendamento ?? (tt?.tratamento_livre ? "livre_concomitante" : "sequencial_bloqueante");
      const publico =
        modo === "livre_concomitante" &&
        tt?.trabalho_publico === true &&
        tt?.permite_entrada_sem_agendamento === true;
      const proj = projMap.get(v.id);
      const persistida = proximaPersistidaPorVinculo.get(v.id) ?? null;

      // Classifica a origem da "próxima sessão" sem misturar fontes:
      //  - Persistido tem prioridade (Camada A);
      //  - caso público → Sugestão;
      //  - senão, projeção oficial (Camada B) → Projetada;
      //  - nada projetável → Sem próxima.
      let proxima_origem: OrigemProxima = "sem_proxima";
      let proxima_data: string | null = null;
      let liberado_desde: string | null = null;
      let sugestoes_a_partir_de: string | null = null;

      if (persistida) {
        proxima_origem = "agendada";
        proxima_data = persistida;
      } else if (publico && proj?.tratamentoPublicoComSugestao) {
        proxima_origem = "sugestao";
        proxima_data = proj.sugestoesAPartirDe ?? null;
        liberado_desde = proj.liberadoDesde ?? null;
        sugestoes_a_partir_de = proj.sugestoesAPartirDe ?? null;
      } else if (proj?.geraAgenda && proj.sessoes.length > 0) {
        proxima_origem = "projetada";
        proxima_data = proj.sessoes[0].data_sessao;
      }

      return {
        vinculo_id: v.id,
        tratamento_id: v.tratamento_id,
        tratamento_nome: tt?.nome ?? "Tratamento",
        ordem_tratamento: tt?.ordem_tratamento ?? null,
        modo_agendamento: modo,
        status: v.status,
        quantidade_total: v.quantidade_total,
        quantidade_realizada: v.quantidade_realizada,
        quantidade_faltante: v.quantidade_faltante,
        origem: v.origem,
        observacoes: v.observacoes,
        observacao_migracao: v.observacao_migracao,
        sequencial_bloqueante: modo === "sequencial_bloqueante",
        bloqueia_proximo: !!tt?.bloqueia_proximo_tratamento,
        proxima_origem,
        proxima_data,
        publico,
        liberado_desde,
        sugestoes_a_partir_de,
      };
    })
    .sort((a, b) => (a.ordem_tratamento ?? 999) - (b.ordem_tratamento ?? 999));

  // Presenças lançadas, para enriquecer o status visível das sessões.
  const vinculoIds = tratamentos.map((t) => t.vinculo_id);
  let presencas: { assistido_tratamento_id: string; data: string; status_presenca: string }[] = [];
  if (vinculoIds.length > 0) {
    const { data: pres } = await supabase
      .from("presencas_tratamentos")
      .select("assistido_tratamento_id, data, status_presenca")
      .in("assistido_tratamento_id", vinculoIds);
    presencas = (pres ?? []) as typeof presencas;
  }
  const presMap = new Map(
    presencas.map((p) => [`${p.assistido_tratamento_id}|${p.data}`, p.status_presenca]),
  );

  const sessoes: SessaoConsolidada[] = ((agenda ?? []) as AgendaRow[]).map((s) => ({
    id: s.id,
    vinculo_id: s.assistido_tratamento_id,
    tratamento_id: s.tratamento_id,
    tratamento_nome: tipoMap.get(s.tratamento_id)?.nome ?? "Tratamento",
    data_sessao: s.data_sessao,
    horario: s.horario,
    status: s.status,
    status_presenca: presMap.get(`${s.assistido_tratamento_id}|${s.data_sessao}`) ?? null,
  }));

  return {
    assistido: assistido as AssistidoCabecalho,
    tratamentos,
    sessoes,
  };
}
