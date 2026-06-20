import { supabase } from "@/integrations/supabase/client";

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
      "id, tratamento_id, status, quantidade_total, quantidade_realizada, quantidade_faltante, origem, observacoes, observacao_migracao, created_at, tipos_tratamento:tratamento_id(nome, ordem_tratamento, modo_agendamento, tratamento_livre, bloqueia_proximo_tratamento)",
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
    tipos_tratamento: {
      nome: string;
      ordem_tratamento: number | null;
      modo_agendamento: string;
      tratamento_livre: boolean;
      bloqueia_proximo_tratamento: boolean;
    } | null;
  };

  const tratamentos: TratamentoConsolidado[] = ((vinculos ?? []) as VinculoRow[])
    .map((v) => {
      const tt = v.tipos_tratamento;
      const modo = tt?.modo_agendamento ?? (tt?.tratamento_livre ? "livre_concomitante" : "sequencial_bloqueante");
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
      };
    })
    .sort((a, b) => (a.ordem_tratamento ?? 999) - (b.ordem_tratamento ?? 999));

  const { data: agenda, error: errS } = await supabase
    .from("agenda_tratamentos_assistido")
    .select(
      "id, assistido_tratamento_id, tratamento_id, data_sessao, horario, status, tipos_tratamento:tratamento_id(nome)",
    )
    .eq("assistido_id", assistidoId)
    .order("data_sessao");
  if (errS) throw new Error(errS.message);

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

  type AgendaRow = {
    id: string;
    assistido_tratamento_id: string;
    tratamento_id: string;
    data_sessao: string;
    horario: string | null;
    status: string;
    tipos_tratamento: { nome: string } | null;
  };

  const sessoes: SessaoConsolidada[] = ((agenda ?? []) as AgendaRow[]).map((s) => ({
    id: s.id,
    vinculo_id: s.assistido_tratamento_id,
    tratamento_id: s.tratamento_id,
    tratamento_nome: s.tipos_tratamento?.nome ?? "Tratamento",
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
