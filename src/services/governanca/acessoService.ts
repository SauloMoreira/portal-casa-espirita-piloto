import { supabase } from "@/integrations/supabase/client";
import type { PromotionStatus, AdminPromotionRole } from "@/lib/adminPromotion";

/**
 * Q1-C2 — Wrapper tipado para RPCs de Governança de Acesso (achado A-1).
 *
 * Encapsula as chamadas `supabase.rpc` de governança, normaliza os retornos
 * `jsonb` das funções `SECURITY DEFINER` do backend em uniões discriminadas e
 * propaga erros de negócio como `Error`. Não altera comportamento, RLS, grants,
 * policies, schema nem as próprias funções do backend.
 */

export type OperationalAccessRole =
  | "entrevistador"
  | "tarefeiro"
  | "coordenador_de_tratamento";

/** Retorno de `solicitar_promocao_admin`. */
export interface PromocaoResult {
  id: string;
  required_approvals: number;
  excecao_master: boolean;
}

/** Retorno de `decidir_promocao_admin`. */
export interface DecisaoPromocaoResult {
  status: PromotionStatus;
  aprovacoes?: number;
  necessarias?: number;
}

/** Retorno de `fn_conceder_acesso_operacional` / `fn_revogar_acesso_operacional`. */
export interface AcessoOperacionalResult {
  status: "concedido" | "ja_concedido" | "revogado" | "inexistente";
  role: OperationalAccessRole;
}

/** Formato bruto do `jsonb` retornado pelas RPCs. */
type RpcJson = Record<string, unknown> | null;

/** Extrai o payload, propagando erro de transporte ou erro de negócio. */
function unwrap(data: unknown, error: { message: string } | null): Record<string, unknown> {
  if (error) throw new Error(error.message);
  const json = (data ?? {}) as RpcJson;
  if (json && typeof json === "object" && typeof json.error === "string") {
    throw new Error(json.error);
  }
  return (json ?? {}) as Record<string, unknown>;
}

export async function solicitarPromocaoAdmin(params: {
  targetUserId: string;
  targetRole: AdminPromotionRole;
  justificativa: string;
}): Promise<PromocaoResult> {
  const { data, error } = await supabase.rpc("solicitar_promocao_admin", {
    p_target_user_id: params.targetUserId,
    p_target_role: params.targetRole,
    p_justificativa: params.justificativa,
  });
  const json = unwrap(data, error);
  return {
    id: String(json.id ?? ""),
    required_approvals: Number(json.required_approvals ?? 0),
    excecao_master: Boolean(json.excecao_master),
  };
}

export async function decidirPromocaoAdmin(params: {
  requestId: string;
  decision: "aprovar" | "rejeitar";
  motivo?: string | null;
}): Promise<DecisaoPromocaoResult> {
  const { data, error } = await supabase.rpc("decidir_promocao_admin", {
    p_request_id: params.requestId,
    p_decision: params.decision,
    p_motivo: params.motivo ?? null,
  });
  const json = unwrap(data, error);
  return {
    status: json.status as PromotionStatus,
    aprovacoes: json.aprovacoes != null ? Number(json.aprovacoes) : undefined,
    necessarias: json.necessarias != null ? Number(json.necessarias) : undefined,
  };
}

export async function concederAcessoOperacional(params: {
  targetUserId: string;
  role: OperationalAccessRole;
  motivo?: string | null;
  instituicaoId?: string | null;
}): Promise<AcessoOperacionalResult> {
  const { data, error } = await supabase.rpc("fn_conceder_acesso_operacional", {
    p_target_user_id: params.targetUserId,
    p_role: params.role,
    p_motivo: params.motivo ?? null,
    p_instituicao_id: params.instituicaoId ?? null,
  });
  const json = unwrap(data, error);
  return {
    status: json.status as AcessoOperacionalResult["status"],
    role: (json.role as OperationalAccessRole) ?? params.role,
  };
}

export async function revogarAcessoOperacional(params: {
  targetUserId: string;
  role: OperationalAccessRole;
  motivo?: string | null;
}): Promise<AcessoOperacionalResult> {
  const { data, error } = await supabase.rpc("fn_revogar_acesso_operacional", {
    p_target_user_id: params.targetUserId,
    p_role: params.role,
    p_motivo: params.motivo ?? null,
  });
  const json = unwrap(data, error);
  return {
    status: json.status as AcessoOperacionalResult["status"],
    role: (json.role as OperationalAccessRole) ?? params.role,
  };
}
