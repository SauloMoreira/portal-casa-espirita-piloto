import { supabase } from "@/integrations/supabase/client";
import type { AlimentoAcaoSocial, AcaoSocialConfig } from "@/lib/acaoSocial";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";

export type AlimentoInput = {
  nome: string;
  unidade?: string | null;
  quantidade_necessaria?: number | null;
  quantidade_faltante?: number | null;
  observacao?: string | null;
  ordem?: number;
  ativo?: boolean;
};

const TABLE = "acao_social_alimentos";

/** Lista todos os itens (uso administrativo). */
export async function listAlimentos(): Promise<AlimentoAcaoSocial[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("ativo", { ascending: false })
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AlimentoAcaoSocial[];
}

/** Lista apenas itens ativos (uso na área do assistido). */
export async function listAlimentosAtivos(): Promise<AlimentoAcaoSocial[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AlimentoAcaoSocial[];
}

export async function createAlimento(input: AlimentoInput): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({ ...input, instituicao_id: requireInstituicaoId() });
  if (error) throw error;
}

export async function updateAlimento(id: string, input: Partial<AlimentoInput>): Promise<void> {
  const { error } = await supabase.from(TABLE).update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteAlimento(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export async function toggleAlimentoAtivo(id: string, ativo: boolean): Promise<void> {
  return updateAlimento(id, { ativo });
}

const CONFIG_TABLE = "acao_social_config";

export type AcaoSocialConfigInput = {
  prazo_final_entrega?: string | null;
  observacao_prazo?: string | null;
  exibir_prazo?: boolean;
  mensagem_institucional?: string | null;
};

/** Busca a configuração única da Ação Social (prazo de entrega do mês). */
export async function getAcaoSocialConfig(): Promise<AcaoSocialConfig | null> {
  const { data, error } = await supabase
    .from(CONFIG_TABLE)
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AcaoSocialConfig | null) ?? null;
}

/** Cria ou atualiza a configuração única da Ação Social. */
export async function saveAcaoSocialConfig(input: AcaoSocialConfigInput): Promise<void> {
  const existing = await getAcaoSocialConfig();
  if (existing) {
    const { error } = await supabase.from(CONFIG_TABLE).update(input).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from(CONFIG_TABLE).insert(input);
    if (error) throw error;
  }
}
