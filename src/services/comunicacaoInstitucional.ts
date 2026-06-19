import { supabase } from "@/integrations/supabase/client";
import { VERSAO_TERMO_CONSENTIMENTO } from "@/lib/consentimento";
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
  const { error } = await supabase.from(TABLE).insert(payload);
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
