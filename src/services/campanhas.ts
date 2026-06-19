import { supabase } from "@/integrations/supabase/client";
import type { Campanha } from "@/lib/campanhas";

export type CampanhaInput = {
  titulo: string;
  subtitulo?: string | null;
  descricao_curta?: string | null;
  descricao_completa?: string | null;
  imagem_url?: string | null;
  imagem_origem?: string;
  imagem_otimizada?: boolean;
  imagem_atualizada_em?: string | null;
  imagem_atualizada_por?: string | null;
  ordem?: number;
  destaque?: boolean;
  data_inicio?: string | null;
  data_fim?: string | null;
  ativo?: boolean;
};

const TABLE = "campanhas";

/** Lista todas as campanhas (uso administrativo). */
export async function listCampanhas(): Promise<Campanha[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("destaque", { ascending: false })
    .order("ordem", { ascending: true })
    .order("titulo", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Campanha[];
}

/** Lista campanhas vigentes para exibição ao assistido. */
export async function listCampanhasVigentes(): Promise<Campanha[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("ativo", true)
    .or(`data_inicio.is.null,data_inicio.lte.${hoje}`)
    .or(`data_fim.is.null,data_fim.gte.${hoje}`)
    .order("destaque", { ascending: false })
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Campanha[];
}

export async function createCampanha(input: CampanhaInput): Promise<void> {
  const { error } = await supabase.from(TABLE).insert(input);
  if (error) throw error;
}

export async function updateCampanha(id: string, input: Partial<CampanhaInput>): Promise<void> {
  const { error } = await supabase.from(TABLE).update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteCampanha(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export async function toggleCampanhaAtivo(id: string, ativo: boolean): Promise<void> {
  return updateCampanha(id, { ativo });
}
