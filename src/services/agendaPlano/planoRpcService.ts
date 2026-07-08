import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";

/**
 * Q1-C4 — Wrappers tipados para as RPCs sensíveis do novo modelo de agenda/plano
 * (presença, ausência, rollback e auditoria de homologação).
 *
 * SAAS-05-E2 — Passa a chamar exclusivamente os overloads tenant-aware das RPCs
 * `pts_*`, injetando `p_instituicao_id` obtido via `requireInstituicaoId()`
 * (fail-closed). Nenhuma leitura de tenant a partir de localStorage.
 */

export interface RollbackResult {
  sessoes_removidas: number;
  sessoes_restauradas: number;
  etapas_removidas: number;
}

export interface PresencaResult {
  concluido: boolean;
  quantidade_realizada: number;
  quantidade_total: number;
}

export interface AusenciaResult {
  suspenso: boolean;
  faltas_consecutivas: number;
  remarcacoes_automaticas: number;
}

/** Formato bruto do `jsonb` retornado pelas RPCs. */
type RpcJson = Record<string, unknown>;

function unwrapJson(data: Json | null, error: { message: string } | null): RpcJson {
  if (error) throw new Error(error.message);
  const json = (data ?? {}) as RpcJson;
  return json && typeof json === "object" ? json : {};
}

export interface RegistrarPresencaRpcArgs {
  vinculoId: string;
  data: string;
  registradoPor: string;
  proximaNumeroEtapa?: number;
  proximaData?: string;
  proximaHorario?: string;
}

/** RPC transacional `pts_registrar_presenca` — overload tenant-aware. */
export async function registrarPresencaRpc(
  args: RegistrarPresencaRpcArgs,
): Promise<PresencaResult> {
  const instituicaoId = requireInstituicaoId();
  const { data, error } = await supabase.rpc("pts_registrar_presenca", {
    p_vinculo_id: args.vinculoId,
    p_data: args.data,
    p_registrado_por: args.registradoPor,
    p_proxima_numero_etapa: args.proximaNumeroEtapa,
    p_proxima_data: args.proximaData,
    p_proxima_horario: args.proximaHorario,
    p_instituicao_id: instituicaoId,
  });
  const json = unwrapJson(data, error);
  return {
    concluido: Boolean(json.concluido),
    quantidade_realizada: Number(json.quantidade_realizada ?? 0),
    quantidade_total: Number(json.quantidade_total ?? 0),
  };
}

export interface RegistrarAusenciaRpcArgs {
  vinculoId: string;
  data: string;
  registradoPor: string;
  novaData?: string;
  novaHorario?: string;
}

/** RPC transacional `pts_registrar_ausencia` — overload tenant-aware. */
export async function registrarAusenciaRpc(
  args: RegistrarAusenciaRpcArgs,
): Promise<AusenciaResult> {
  const instituicaoId = requireInstituicaoId();
  const { data, error } = await supabase.rpc("pts_registrar_ausencia", {
    p_vinculo_id: args.vinculoId,
    p_data: args.data,
    p_registrado_por: args.registradoPor,
    p_nova_data: args.novaData,
    p_nova_horario: args.novaHorario,
    p_instituicao_id: instituicaoId,
  });
  const json = unwrapJson(data, error);
  return {
    suspenso: Boolean(json.suspenso),
    faltas_consecutivas: Number(json.faltas_consecutivas ?? 0),
    remarcacoes_automaticas: Number(json.remarcacoes_automaticas ?? 0),
  };
}

/** RPC transacional `pts_rollback_piloto` — overload tenant-aware. */
export async function rollbackPilotoRpc(assistidoId: string): Promise<RollbackResult> {
  const instituicaoId = requireInstituicaoId();
  const { data, error } = await supabase.rpc("pts_rollback_piloto", {
    p_assistido_id: assistidoId,
    p_instituicao_id: instituicaoId,
  });
  const json = unwrapJson(data, error);
  return {
    sessoes_removidas: Number(json.sessoes_removidas ?? 0),
    sessoes_restauradas: Number(json.sessoes_restauradas ?? 0),
    etapas_removidas: Number(json.etapas_removidas ?? 0),
  };
}

/** RPC de auditoria `pts_homologacao_auditar` — overload tenant-aware. */
export async function homologacaoAuditarRpc(args: {
  assistidoId: string;
  acao: string;
  resultado?: Json;
}): Promise<void> {
  const instituicaoId = requireInstituicaoId();
  const { error } = await supabase.rpc("pts_homologacao_auditar", {
    p_assistido_id: args.assistidoId,
    p_acao: args.acao,
    p_resultado: args.resultado,
    p_instituicao_id: instituicaoId,
  });
  if (error) throw new Error(error.message);
}
