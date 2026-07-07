import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { parseRolloutMonitor, type RolloutMonitor } from "./excecoesContracts";

export interface ExcecaoOperacional {
  id: string;
  tipo: string;
  atividade: string;
  tratamento_id: string | null;
  data_excecao: string;
  horario_afetado: string | null;
  status: string;
  nova_data: string | null;
  novo_horario: string | null;
  motivo: string | null;
  observacao_interna: string | null;
  mensagem_ia: string | null;
  prioridade: number;
  ativo: boolean;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExcecaoFiltros {
  busca?: string;
  tipo?: string;
  status?: string;
  ativo?: boolean | null;
  inicio?: string | null;
  fim?: string | null;
}

export type ExcecaoInput = Partial<
  Omit<ExcecaoOperacional, "id" | "created_at" | "updated_at">
>;

export async function listarExcecoes(f: ExcecaoFiltros): Promise<ExcecaoOperacional[]> {
  let q = supabase
    .from("excecoes_operacionais")
    .select("*")
    .order("data_excecao", { ascending: false })
    .order("prioridade", { ascending: false });

  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.status) q = q.eq("status", f.status);
  if (f.ativo !== null && f.ativo !== undefined) q = q.eq("ativo", f.ativo);
  if (f.inicio) q = q.gte("data_excecao", f.inicio);
  if (f.fim) q = q.lte("data_excecao", f.fim);
  if (f.busca && f.busca.trim()) {
    const b = `%${f.busca.trim()}%`;
    q = q.or(`atividade.ilike.${b},motivo.ilike.${b}`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ExcecaoOperacional[];
}

export async function salvarExcecao(input: ExcecaoInput, id?: string): Promise<void> {
  let excecaoId = id;
  if (id) {
    const { error } = await supabase
      .from("excecoes_operacionais")
      .update(input as never)
      .eq("id", id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("excecoes_operacionais")
      .insert(input as never)
      .select("id")
      .single();
    if (error) throw error;
    excecaoId = (data as { id: string } | null)?.id;
  }

  // Caminho principal (imediato): aplica efeito na agenda e enfileira a
  // comunicação oficial. A reconciliação no cron é apenas rede de segurança.
  if (excecaoId) {
    const { error: rpcError } = await supabase.rpc(
      "fn_processar_excecao_notificacoes",
      { p_excecao_id: excecaoId },
    );
    // Falha aqui não deve reverter a exceção já gravada: o cron reconcilia.
    if (rpcError) {
      console.error("Falha ao processar notificações da exceção", rpcError);
    }
  }
}

export async function alternarAtivoExcecao(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from("excecoes_operacionais")
    .update({ ativo } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirExcecao(id: string): Promise<void> {
  const { error } = await supabase.from("excecoes_operacionais").delete().eq("id", id);
  if (error) throw error;
}

const ROLLOUT_KEY = "excecao_notificacao_ativa";

export type { RolloutMonitor };

/** Lê o interruptor de contenção do rollout (true = liberado). */
export async function obterRolloutAtivo(): Promise<boolean> {
  const { data, error } = await supabase
    .from("regras_operacionais")
    .select("valor")
    .eq("chave", ROLLOUT_KEY)
    .maybeSingle();
  if (error) throw error;
  return String((data as { valor?: string } | null)?.valor ?? "true").toLowerCase() === "true";
}

/** Liga/desliga a notificação automática por exceção (contenção rápida). */
export async function definirRolloutAtivo(ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from("regras_operacionais")
    .update({ valor: ativo ? "true" : "false" } as never)
    .eq("chave", ROLLOUT_KEY);
  if (error) throw error;
}

/** Painel de monitoramento das primeiras ocorrências reais do rollout. */
export async function obterRolloutMonitor(diasJanela = 14): Promise<RolloutMonitor> {
  const desde = new Date(Date.now() - diasJanela * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("fn_monitor_excecao_notificacoes", {
    p_desde: desde,
  });
  if (error) throw error;
  return parseRolloutMonitor(data);
}
