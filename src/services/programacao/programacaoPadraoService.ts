import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export interface ProgramacaoPadrao {
  id: string;
  tipo: string;
  atividade: string;
  tratamento_id: string | null;
  dia_semana: number;
  horario: string | null;
  frequencia: string | null;
  observacao: string | null;
  ativo: boolean;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProgramacaoFiltros {
  busca?: string;
  tipo?: string;
  dia_semana?: number | null;
  ativo?: boolean | null;
}

export type ProgramacaoInput = Partial<
  Omit<ProgramacaoPadrao, "id" | "created_at" | "updated_at">
>;

export async function listarProgramacao(f: ProgramacaoFiltros): Promise<ProgramacaoPadrao[]> {
  let q = supabase
    .from("programacao_padrao")
    .select("*")
    .order("dia_semana", { ascending: true })
    .order("horario", { ascending: true });

  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.dia_semana !== null && f.dia_semana !== undefined) q = q.eq("dia_semana", f.dia_semana);
  if (f.ativo !== null && f.ativo !== undefined) q = q.eq("ativo", f.ativo);
  if (f.busca && f.busca.trim()) {
    const b = `%${f.busca.trim()}%`;
    q = q.or(`atividade.ilike.${b},observacao.ilike.${b}`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProgramacaoPadrao[];
}

export async function salvarProgramacao(input: ProgramacaoInput, id?: string): Promise<void> {
  if (id) {
    const { error } = await supabase
      .from("programacao_padrao")
      .update(input as TablesUpdate<"programacao_padrao">)
      .eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("programacao_padrao")
      .insert(input as TablesInsert<"programacao_padrao">);
    if (error) throw error;
  }
}

export async function alternarAtivoProgramacao(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from("programacao_padrao")
    .update({ ativo } as TablesUpdate<"programacao_padrao">)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirProgramacao(id: string): Promise<void> {
  const { error } = await supabase.from("programacao_padrao").delete().eq("id", id);
  if (error) throw error;
}
