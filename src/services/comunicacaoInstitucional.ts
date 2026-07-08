import { supabase } from "@/integrations/supabase/client";
import { VERSAO_TERMO_CONSENTIMENTO } from "@/lib/consentimento";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";
import type {
  ComunicacaoInstitucional,
  ComunicacaoStatus,
  ComunicacaoTipo,
} from "@/lib/comunicacaoInstitucional";

const TABLE = "comunicacoes_institucionais";

export interface ComunicacaoSavePayload {
  titulo: string;
  tipo: ComunicacaoTipo;
  mensagem: string;
  campanha_id?: string | null;
  evento_id?: string | null;
  status?: ComunicacaoStatus;
  publico_estimado?: number;
}

export async function listComunicacoes(): Promise<ComunicacaoInstitucional[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ComunicacaoInstitucional[];
}

export async function createComunicacao(payload: ComunicacaoSavePayload): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({ ...payload, instituicao_id: requireInstituicaoId() });
  if (error) throw error;
}

export async function updateComunicacao(id: string, payload: Partial<ComunicacaoSavePayload>): Promise<void> {
  const { error } = await supabase.from(TABLE).update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteComunicacao(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/**
 * Atualiza o status. Quando aprovado, registra revisor/data e atualiza o
 * total de público elegível (snapshot do momento da aprovação).
 */
export async function setStatusComunicacao(
  id: string,
  status: ComunicacaoStatus,
  revisorId?: string,
): Promise<void> {
  const patch: Partial<ComunicacaoInstitucional> = { status };
  if (status === "aprovada") {
    patch.revisado_at = new Date().toISOString();
    patch.revisado_por = revisorId ?? null;
    patch.publico_estimado = await contarPublicoElegivel();
  }
  const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
  if (error) throw error;
}

/** Conta o público elegível (consentimento ativo na versão vigente do termo). */
export async function contarPublicoElegivel(): Promise<number> {
  const { data, error } = await supabase.rpc("contar_publico_elegivel", {
    p_versao: VERSAO_TERMO_CONSENTIMENTO,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

// ===================== Módulo 5B — Envio institucional =====================

import { JANELA_ANTISPAM_DIAS, LOTE_PADRAO, type EnvioInstitucional } from "@/lib/comunicacaoEnvio";

/**
 * Prepara a fila de envio respeitando consentimento e proteção anti-spam.
 * Não dispara nada — apenas monta os destinatários elegíveis.
 */
export async function prepararEnvio(
  comunicacaoId: string,
  janelaDias: number = JANELA_ANTISPAM_DIAS,
): Promise<{ total: number; bloqueados: number }> {
  const { data, error } = await supabase.rpc("preparar_envio_institucional", {
    p_comunicacao_id: comunicacaoId,
    p_versao: VERSAO_TERMO_CONSENTIMENTO,
    p_janela_dias: janelaDias,
  });
  if (error) throw error;
  const res = data as { error?: string; total?: number; bloqueados?: number };
  if (res?.error) throw new Error(res.error);
  return { total: res?.total ?? 0, bloqueados: res?.bloqueados ?? 0 };
}

/** Dispara um lote da fila institucional via edge function controlada. */
export async function dispararLote(
  comunicacaoId: string,
  loteMax: number = LOTE_PADRAO,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("comunicacao-dispatch", {
    body: { comunicacao_id: comunicacaoId, lote_max: loteMax },
  });
  if (error) throw error;
  return data as Record<string, unknown>;
}

/** Lista os itens da fila de uma comunicação (observabilidade — somente admin via RLS). */
export async function listEnvios(comunicacaoId: string): Promise<EnvioInstitucional[]> {
  const { data, error } = await supabase
    .from("comunicacoes_institucionais_envios")
    .select("*")
    .eq("comunicacao_id", comunicacaoId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EnvioInstitucional[];
}
