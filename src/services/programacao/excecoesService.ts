/**
 * SAAS-05-D — Queries diretas às tabelas T-DIR `excecoes_operacionais` e
 * `regras_operacionais` são escopadas pela instituição ativa via
 * `requireInstituicaoId()` (fail-closed).
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";
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
  const instituicaoId = requireInstituicaoId();
  let q = supabase
    .from("excecoes_operacionais")
    .select("*")
    .eq("instituicao_id", instituicaoId)
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
  const instituicaoId = requireInstituicaoId();
  let excecaoId = id;
  if (id) {
    const { error } = await supabase
      .from("excecoes_operacionais")
      .update(input as TablesUpdate<"excecoes_operacionais">)
      .eq("id", id)
      .eq("instituicao_id", instituicaoId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase
      .from("excecoes_operacionais")
      .insert({ ...input, instituicao_id: instituicaoId } as TablesInsert<"excecoes_operacionais">)
      .select("id")
      .single();
    if (error) throw error;
    excecaoId = (data as { id: string } | null)?.id;
  }

  // Caminho principal (imediato): aplica efeito na agenda e enfileira a
  // comunicação oficial. A reconciliação no cron é apenas rede de segurança.
  // SAAS-05-E1: RPC tenant-aware — p_instituicao_id obrigatório.
  if (excecaoId) {
    const { error: rpcError } = await supabase.rpc(
      "fn_processar_excecao_notificacoes",
      { p_excecao_id: excecaoId, p_instituicao_id: instituicaoId },
    );
    if (rpcError) {
      console.error("Falha ao processar notificações da exceção", rpcError);
    }
  }
}

export async function alternarAtivoExcecao(id: string, ativo: boolean): Promise<void> {
  const instituicaoId = requireInstituicaoId();
  const { error } = await supabase
    .from("excecoes_operacionais")
    .update({ ativo } as TablesUpdate<"excecoes_operacionais">)
    .eq("id", id)
    .eq("instituicao_id", instituicaoId);
  if (error) throw error;
}

export async function excluirExcecao(id: string): Promise<void> {
  const instituicaoId = requireInstituicaoId();
  const { error } = await supabase
    .from("excecoes_operacionais")
    .delete()
    .eq("id", id)
    .eq("instituicao_id", instituicaoId);
  if (error) throw error;
}

const ROLLOUT_KEY = "excecao_notificacao_ativa";

export type { RolloutMonitor };

/** Lê o interruptor de contenção do rollout (true = liberado). */
export async function obterRolloutAtivo(): Promise<boolean> {
  const instituicaoId = requireInstituicaoId();
  const { data, error } = await supabase
    .from("regras_operacionais")
    .select("valor")
    .eq("instituicao_id", instituicaoId)
    .eq("chave", ROLLOUT_KEY)
    .maybeSingle();
  if (error) throw error;
  return String((data as { valor?: string } | null)?.valor ?? "true").toLowerCase() === "true";
}

/** Liga/desliga a notificação automática por exceção (contenção rápida). */
export async function definirRolloutAtivo(ativo: boolean): Promise<void> {
  const instituicaoId = requireInstituicaoId();
  const { error } = await supabase
    .from("regras_operacionais")
    .update({ valor: ativo ? "true" : "false" } as TablesUpdate<"regras_operacionais">)
    .eq("instituicao_id", instituicaoId)
    .eq("chave", ROLLOUT_KEY);
  if (error) throw error;
}

/** Painel de monitoramento das primeiras ocorrências reais do rollout. */
export async function obterRolloutMonitor(diasJanela = 14): Promise<RolloutMonitor> {
  const instituicaoId = requireInstituicaoId();
  const desde = new Date(Date.now() - diasJanela * 24 * 60 * 60 * 1000).toISOString();
  // SAAS-05-E1: RPC tenant-aware — p_instituicao_id obrigatório.
  const { data, error } = await supabase.rpc("fn_monitor_excecao_notificacoes", {
    p_desde: desde,
    p_instituicao_id: instituicaoId,
  });
  if (error) throw error;
  return parseRolloutMonitor(data);
}
