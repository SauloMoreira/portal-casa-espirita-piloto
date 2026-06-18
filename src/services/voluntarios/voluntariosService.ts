/**
 * Data access + orchestration for the Voluntários module.
 * Centralizes all Supabase queries previously inlined in the page.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  VoluntarioListItem,
  FuncaoVoluntariado,
  VoluntarioFuncoesMap,
} from "@/types/voluntarios";

export async function fetchVoluntarios(): Promise<VoluntarioListItem[]> {
  const { data } = await supabase
    .from("voluntarios")
    .select("*")
    .order("nome_completo");
  return (data ?? []) as VoluntarioListItem[];
}

export async function fetchFuncoesAtivas(): Promise<FuncaoVoluntariado[]> {
  const { data } = await supabase
    .from("funcoes_voluntariado")
    .select("*")
    .eq("status", "ativo")
    .order("tipo_voluntario")
    .order("nome_funcao");
  return (data ?? []) as FuncaoVoluntariado[];
}

export async function fetchVoluntarioFuncoesMap(): Promise<VoluntarioFuncoesMap> {
  const { data } = await supabase
    .from("voluntario_funcoes")
    .select("voluntario_id, funcao_id");
  const map: VoluntarioFuncoesMap = {};
  (data ?? []).forEach((r) => {
    if (!map[r.voluntario_id]) map[r.voluntario_id] = [];
    map[r.voluntario_id].push(r.funcao_id);
  });
  return map;
}

export async function fetchFuncoesIdsByVoluntario(
  voluntarioId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("voluntario_funcoes")
    .select("funcao_id")
    .eq("voluntario_id", voluntarioId);
  return (data ?? []).map((r) => r.funcao_id);
}

export async function fetchInstituicaoConfig() {
  const { data } = await supabase.from("instituicao_config").select("*").limit(1);
  return data && data.length > 0 ? data[0] : null;
}

export async function isCpfDuplicado(
  cpf: string,
  excludeId?: string | null,
): Promise<boolean> {
  let query = supabase.from("voluntarios").select("id").eq("cpf", cpf);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return !!data && data.length > 0;
}

type VoluntarioPayload = Record<string, unknown>;

export async function saveVoluntario(
  payload: VoluntarioPayload,
  editId: string | null,
  createdBy: string,
): Promise<string> {
  if (editId) {
    const { error } = await supabase
      .from("voluntarios")
      .update(payload as never)
      .eq("id", editId);
    if (error) throw error;
    return editId;
  }
  const { data, error } = await supabase
    .from("voluntarios")
    .insert({ ...payload, created_by: createdBy } as never)
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}

export async function replaceVoluntarioFuncoes(
  voluntarioId: string,
  funcoesIds: string[],
): Promise<void> {
  await supabase.from("voluntario_funcoes").delete().eq("voluntario_id", voluntarioId);
  if (funcoesIds.length > 0) {
    await supabase
      .from("voluntario_funcoes")
      .insert(funcoesIds.map((fid) => ({ voluntario_id: voluntarioId, funcao_id: fid })));
  }
}

// ---- Lifecycle management (inactivate / reactivate / check / delete) ----

export interface VoluntarioActionResult {
  success?: boolean;
  message?: string;
  error?: string;
  can_delete?: boolean;
  blockers?: string[];
  suggestion?: string;
}

type VoluntarioAction = "inactivate" | "reactivate" | "check" | "delete";

async function manageVoluntario(
  action: VoluntarioAction,
  voluntarioId: string,
  motivo?: string | null,
): Promise<VoluntarioActionResult> {
  const { data, error } = await supabase.rpc("gerenciar_voluntario", {
    p_action: action,
    p_voluntario_id: voluntarioId,
    p_motivo: motivo ?? null,
  });
  if (error) throw error;
  return (data ?? {}) as VoluntarioActionResult;
}

export const inactivateVoluntario = (id: string, motivo?: string | null) =>
  manageVoluntario("inactivate", id, motivo);

export const reactivateVoluntario = (id: string, motivo?: string | null) =>
  manageVoluntario("reactivate", id, motivo);

export const checkVoluntarioDeletion = (id: string) =>
  manageVoluntario("check", id);

export const deleteVoluntario = (id: string, motivo?: string | null) =>
  manageVoluntario("delete", id, motivo);
