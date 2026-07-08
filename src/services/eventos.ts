import { supabase } from "@/integrations/supabase/client";
import type { Evento } from "@/lib/eventos";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";

export type EventoInput = {
  titulo: string;
  subtitulo?: string | null;
  descricao_curta?: string | null;
  descricao_completa?: string | null;
  imagem_url?: string | null;
  imagem_origem?: string;
  imagem_otimizada?: boolean;
  imagem_formato?: string;
  imagem_atualizada_em?: string | null;
  imagem_atualizada_por?: string | null;
  local?: string | null;
  data_evento?: string | null;
  data_evento_fim?: string | null;
  ordem?: number;
  destaque?: boolean;
  data_inicio?: string | null;
  data_fim?: string | null;
  ativo?: boolean;
};

const TABLE = "eventos";

/** Lista todos os eventos (uso administrativo). */
export async function listEventos(): Promise<Evento[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("destaque", { ascending: false })
    .order("data_evento", { ascending: true, nullsFirst: false })
    .order("ordem", { ascending: true })
    .order("titulo", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Evento[];
}

/** Lista eventos vigentes para exibição ao assistido. */
export async function listEventosVigentes(): Promise<Evento[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("ativo", true)
    .or(`data_inicio.is.null,data_inicio.lte.${hoje}`)
    .or(`data_fim.is.null,data_fim.gte.${hoje}`)
    .order("destaque", { ascending: false })
    .order("data_evento", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as Evento[];
}

export async function createEvento(input: EventoInput): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({ ...input, instituicao_id: requireInstituicaoId() });
  if (error) throw error;
}

export async function updateEvento(id: string, input: Partial<EventoInput>): Promise<void> {
  const { error } = await supabase.from(TABLE).update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteEvento(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

export async function toggleEventoAtivo(id: string, ativo: boolean): Promise<void> {
  return updateEvento(id, { ativo });
}
