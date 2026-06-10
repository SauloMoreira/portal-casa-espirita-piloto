import { supabase } from "@/integrations/supabase/client";
import type { PresencaTratamento } from "@/types";

export async function listPresencasPorVinculo(
  assistidoTratamentoIds: string[],
): Promise<PresencaTratamento[]> {
  if (assistidoTratamentoIds.length === 0) return [];
  const { data, error } = await supabase
    .from("presencas_tratamentos")
    .select("*")
    .in("assistido_tratamento_id", assistidoTratamentoIds);
  if (error) throw error;
  return (data ?? []) as PresencaTratamento[];
}

export async function registrarPresenca(
  payload: PresencaTratamento["Insert"] extends never
    ? Partial<PresencaTratamento>
    : Partial<PresencaTratamento>,
): Promise<void> {
  const { error } = await supabase
    .from("presencas_tratamentos")
    .upsert(payload as never);
  if (error) throw error;
}
