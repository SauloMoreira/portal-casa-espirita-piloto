// SAAS-06-C1-STAB02 — Camada única de criação de assistido tenant-aware.
// Ambos os fluxos (Atendimento → Assistidos e Realizar Entrevista → Novo)
// devem usar esta função para garantir mesma regra RLS/FIX08.
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";

export interface CriarAssistidoInput {
  payload: Omit<TablesInsert<"assistidos">, "instituicao_id" | "created_by">;
  instituicaoId: string;
  userId: string;
}

export interface CriarAssistidoResult {
  error: { message: string; code?: string; details?: string; hint?: string } | null;
}

/**
 * Insere um assistido usando exatamente o mesmo shape aprovado no FIX08
 * (sem `.select().single()`, para não depender de SELECT pós-insert).
 */
export async function criarAssistidoTenant(
  input: CriarAssistidoInput
): Promise<CriarAssistidoResult> {
  const { payload, instituicaoId, userId } = input;
  const { error } = await supabase.from("assistidos").insert({
    ...payload,
    created_by: userId,
    instituicao_id: instituicaoId,
  } as TablesInsert<"assistidos">);
  return { error: error as CriarAssistidoResult["error"] };
}

/**
 * Busca o assistido recém-criado por (instituicao_id, celular) usando o SELECT
 * mínimo consumido pelo fluxo de Realizar Entrevista.
 */
export async function fetchAssistidoRecemCriado(
  instituicaoId: string,
  celularClean: string
) {
  const { data, error } = await supabase
    .from("assistidos")
    .select("id, nome, cpf, celular, email, status, quantidade_palestras")
    .eq("instituicao_id", instituicaoId)
    .eq("celular", celularClean)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
}
