import { supabase } from "@/integrations/supabase/client";

/**
 * Q1-C3 — Wrapper tipado para a RPC de elegibilidade do Comunicador (achado C3-1).
 *
 * Encapsula `sou_comunicador_elegivel` restaurando a checagem de tipo do nome
 * da RPC e do shape de retorno. Não altera comportamento, RLS, grants, policies,
 * schema nem a função `SECURITY DEFINER` do backend.
 */

/** Retorna true se o usuário logado é um Comunicador elegível a alertas da Central. */
export async function souComunicadorElegivel(): Promise<boolean> {
  const { data, error } = await supabase.rpc("sou_comunicador_elegivel");
  if (error) throw error;
  return Boolean(data);
}
