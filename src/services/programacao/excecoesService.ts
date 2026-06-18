import { supabase } from "@/integrations/supabase/client";

export interface ExcecaoOperacional {
  id: string;
  tipo: string;
  atividade: string;
  tratamento_id: string | null;
  data_excecao: string;
  horario_afetado: string | null;
  status: string;
  nova_data: string | null;
  novo_horario: string | null;
  motivo: string | null;
  observacao_interna: string | null;
  mensagem_ia: string | null;
  prioridade: number;
  ativo: boolean;
  criado_por: string | null;
  atualizado_por: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExcecaoFiltros {
  busca?: string;
  tipo?: string;
  status?: string;
  ativo?: boolean | null;
  inicio?: string | null;
  fim?: string | null;
}

export type ExcecaoInput = Partial<
  Omit<ExcecaoOperacional, "id" | "created_at" | "updated_at">
>;

export async function listarExcecoes(f: ExcecaoFiltros): Promise<ExcecaoOperacional[]> {
  let q = supabase
    .from("excecoes_operacionais")
    .select("*")
    .order("data_excecao", { ascending: false })
    .order("prioridade", { ascending: false });

  if (f.tipo) q = q.eq("tipo", f.tipo);
  if (f.status) q = q.eq("status", f.status);
  if (f.ativo !== null && f.ativo !== undefined) q = q.eq("ativo", f.ativo);
  if (f.inicio) q = q.gte("data_excecao", f.inicio);
  if (f.fim) q = q.lte("data_excecao", f.fim);
  if (f.busca && f.busca.trim()) {
    const b = `%${f.busca.trim()}%`;
    q = q.or(`atividade.ilike.${b},motivo.ilike.${b}`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ExcecaoOperacional[];
}

export async function salvarExcecao(input: ExcecaoInput, id?: string): Promise<void> {
  if (id) {
    const { error } = await supabase
      .from("excecoes_operacionais")
      .update(input as never)
      .eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("excecoes_operacionais")
      .insert(input as never);
    if (error) throw error;
  }
}

export async function alternarAtivoExcecao(id: string, ativo: boolean): Promise<void> {
  const { error } = await supabase
    .from("excecoes_operacionais")
    .update({ ativo } as never)
    .eq("id", id);
  if (error) throw error;
}

export async function excluirExcecao(id: string): Promise<void> {
  const { error } = await supabase.from("excecoes_operacionais").delete().eq("id", id);
  if (error) throw error;
}
