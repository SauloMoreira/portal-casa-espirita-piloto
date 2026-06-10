import { supabase } from "@/integrations/supabase/client";
import type { SessaoPublica, CheckinPublico } from "@/types";
import { SESSAO_PUBLICA_STATUS } from "@/constants";

/** Sessões públicas abertas em uma data (default: hoje). */
export async function listSessoesAbertas(
  data = new Date().toISOString().slice(0, 10),
) {
  const { data: rows, error } = await supabase
    .from("sessoes_publicas")
    .select("id, total_presentes, data_sessao, status, tratamento_id, tipos_tratamento:tratamento_id(nome)")
    .eq("data_sessao", data)
    .eq("status", SESSAO_PUBLICA_STATUS.aberta);
  if (error) throw error;
  return rows ?? [];
}

export async function createSessaoPublica(
  payload: Partial<SessaoPublica>,
): Promise<void> {
  const { error } = await supabase
    .from("sessoes_publicas")
    .insert(payload as never);
  if (error) throw error;
}

export async function registrarCheckin(
  payload: Partial<CheckinPublico>,
): Promise<void> {
  const { error } = await supabase
    .from("checkins_publicos")
    .insert(payload as never);
  if (error) throw error;
}
