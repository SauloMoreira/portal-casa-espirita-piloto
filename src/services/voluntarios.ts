/**
 * SAAS-05-D — Queries diretas à tabela T-DIR `voluntarios` são escopadas pela
 * instituição ativa via `requireInstituicaoId()` (fail-closed).
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";
import type { Voluntario } from "@/types";

export async function listFuncoesAtivas() {
  const { data, error } = await supabase
    .from("funcoes_voluntariado")
    .select("*")
    .eq("status", "ativo")
    .order("tipo_voluntario")
    .order("nome_funcao");
  if (error) throw error;
  return data ?? [];
}

export async function listVoluntarioFuncoes() {
  const { data, error } = await supabase
    .from("voluntario_funcoes")
    .select("voluntario_id, funcao_id");
  if (error) throw error;
  return data ?? [];
}

export async function findVoluntarioByCpf(cpf: string, excludeId?: string) {
  const instituicaoId = requireInstituicaoId();
  let query = supabase
    .from("voluntarios")
    .select("id")
    .eq("instituicao_id", instituicaoId)
    .eq("cpf", cpf);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function upsertVoluntario(
  payload: Partial<Voluntario>,
  editId?: string,
): Promise<string> {
  const instituicaoId = requireInstituicaoId();
  if (editId) {
    const { error } = await supabase
      .from("voluntarios")
      .update(payload as TablesUpdate<"voluntarios">)
      .eq("id", editId)
      .eq("instituicao_id", instituicaoId);
    if (error) throw error;
    return editId;
  }
  const { data, error } = await supabase
    .from("voluntarios")
    .insert({ ...payload, instituicao_id: instituicaoId } as TablesInsert<"voluntarios">)
    .select("id")
    .single();
  if (error) throw error;
  return data!.id;
}
