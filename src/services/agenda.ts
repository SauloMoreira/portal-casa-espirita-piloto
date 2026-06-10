import { supabase } from "@/integrations/supabase/client";

/**
 * Agenda real (agenda_tratamentos_assistido) é a fonte única de verdade
 * para sessões. Sempre consulte sessões reais aqui, nunca derive de regras
 * teóricas do tratamento.
 */
export async function listSessoesDoAssistido(assistidoId: string) {
  const { data, error } = await supabase
    .from("agenda_tratamentos_assistido")
    .select("*, tipos_tratamento:tratamento_id(id, nome)")
    .eq("assistido_id", assistidoId)
    .order("data_sessao", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listSessoesPorData(data: string) {
  const { data: rows, error } = await supabase
    .from("agenda_tratamentos_assistido")
    .select("*, tipos_tratamento:tratamento_id(id, nome)")
    .eq("data_sessao", data)
    .order("horario", { ascending: true });
  if (error) throw error;
  return rows ?? [];
}
