/**
 * SAAS-05-D — Queries diretas à tabela T-DIR `sessoes_publicas` são escopadas
 * pela instituição ativa via `requireInstituicaoId()` (fail-closed).
 */
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { SessaoPublica, CheckinPublico } from "@/types";
import { SESSAO_PUBLICA_STATUS } from "@/constants";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";

/** Sessões públicas abertas em uma data (default: hoje). */
export async function listSessoesAbertas(
  data = new Date().toISOString().slice(0, 10),
) {
  const instituicaoId = requireInstituicaoId();
  const { data: rows, error } = await supabase
    .from("sessoes_publicas")
    .select("id, total_presentes, data_sessao, status, tratamento_id, tipos_tratamento:tratamento_id(nome)")
    .eq("instituicao_id", instituicaoId)
    .eq("data_sessao", data)
    .eq("status", SESSAO_PUBLICA_STATUS.aberta);
  if (error) throw error;
  return rows ?? [];
}

export async function createSessaoPublica(
  payload: Partial<SessaoPublica>,
): Promise<void> {
  const instituicaoId = requireInstituicaoId();
  const { error } = await supabase
    .from("sessoes_publicas")
    .insert({ ...payload, instituicao_id: instituicaoId } as TablesInsert<"sessoes_publicas">);
  if (error) throw error;
}

// checkins_publicos NÃO é T-DIR base (fluxo público resolve o tenant via
// código da sessão). Deixado sem filtro explícito por instituicao_id neste
// recorte; adaptação delegada ao SAAS-05-E se aplicável.
export async function registrarCheckin(
  payload: Partial<CheckinPublico>,
): Promise<void> {
  const { error } = await supabase
    .from("checkins_publicos")
    .insert(payload as TablesInsert<"checkins_publicos">);
  if (error) throw error;
}
