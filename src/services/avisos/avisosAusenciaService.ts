import { supabase } from "@/integrations/supabase/client";

/**
 * MELHORIA-01 — Fluxo oficial de "não poderei comparecer".
 *
 * Toda a lógica de verdade vive no backend (RPCs SECURITY DEFINER). Este
 * serviço é apenas um wrapper fino: NÃO replica regra de elegibilidade,
 * titularidade, duplicidade ou visibilidade por perfil. O backend é a fonte
 * única de verdade e garante que o tarefeiro nunca receba motivo/justificativa.
 */

export type TipoCompromissoAviso = "sessao" | "entrevista";
export type StatusAviso = "aberto" | "em_tratamento" | "resolvido" | "descartado";

export interface AvisoAusenciaPendente {
  id: string;
  assistido_id: string;
  assistido_nome: string;
  tipo_compromisso: TipoCompromissoAviso;
  data_compromisso: string;
  status: StatusAviso;
  tratado_por: string | null;
  tratado_em: string | null;
  created_at: string;
  /** Conteúdo sensível: vem null para o tarefeiro (backend reduz o payload). */
  motivo: string | null;
  /** Conteúdo sensível: vem null para o tarefeiro. */
  resolucao: string | null;
  /** Indica se o perfil atual pode ver conteúdo sensível. */
  pode_ver_conteudo: boolean;
}

const STATUS_TRATAMENTO: StatusAviso[] = ["em_tratamento", "resolvido", "descartado"];

export const STATUS_AVISO_LABELS: Record<StatusAviso, string> = {
  aberto: "Aberto",
  em_tratamento: "Em tratamento",
  resolvido: "Resolvido",
  descartado: "Descartado",
};

/** Assistido registra um aviso de ausência para um compromisso próprio. */
export async function registrarAvisoAusencia(params: {
  tipoCompromisso: TipoCompromissoAviso;
  compromissoId: string;
  motivo?: string | null;
}): Promise<{ id: string; status: string }> {
  const { data, error } = await (supabase.rpc as any)("fn_registrar_aviso_ausencia", {
    p_tipo_compromisso: params.tipoCompromisso,
    p_compromisso_id: params.compromissoId,
    p_motivo: params.motivo ?? null,
  });
  if (error) throw error;
  return data as { id: string; status: string };
}

/** Equipe trata um aviso, transicionando o estado e registrando trilha. */
export async function tratarAvisoAusencia(params: {
  avisoId: string;
  novoStatus: Exclude<StatusAviso, "aberto">;
  resolucao?: string | null;
}): Promise<{ id: string; status: string }> {
  if (!STATUS_TRATAMENTO.includes(params.novoStatus)) {
    throw new Error("status_invalido");
  }
  const { data, error } = await (supabase.rpc as any)("fn_tratar_aviso_ausencia", {
    p_aviso_id: params.avisoId,
    p_novo_status: params.novoStatus,
    p_resolucao: params.resolucao ?? null,
  });
  if (error) throw error;
  return data as { id: string; status: string };
}

/** Lista avisos para a equipe. Payload é reduzido para tarefeiro pelo backend. */
export async function listarAvisosAusenciaPendentes(
  incluirResolvidos = false,
): Promise<AvisoAusenciaPendente[]> {
  const { data, error } = await (supabase.rpc as any)("fn_avisos_ausencia_pendentes", {
    p_incluir_resolvidos: incluirResolvidos,
  });
  if (error) throw error;
  return (data ?? []) as AvisoAusenciaPendente[];
}
