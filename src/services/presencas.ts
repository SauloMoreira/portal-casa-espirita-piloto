import { supabase } from "@/integrations/supabase/client";
import type { PresencaTratamento } from "@/types";

export async function listPresencasPorSessao(sessaoIds: string[]) {
  if (sessaoIds.length === 0) return [];
  const { data, error } = await supabase
    .from("presencas_tratamentos")
    .select("*")
    .in("agenda_id", sessaoIds);
  if (error) throw error;
  return data ?? [];
}

export async function registrarPresenca(
  payload: Partial<PresencaTratamento>,
): Promise<void> {
  const { error } = await supabase
    .from("presencas_tratamentos")
    .upsert(payload as never);
  if (error) throw error;
}
