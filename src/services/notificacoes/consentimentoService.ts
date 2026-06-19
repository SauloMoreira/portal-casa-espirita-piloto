import { supabase } from "@/integrations/supabase/client";
import {
  VERSAO_TERMO_CONSENTIMENTO,
  snapshotDaAcao,
  type ConsentimentoAcao,
  type ConsentimentoOrigem,
} from "@/lib/consentimento";

export interface ConsentimentoPreferencia {
  assistido_id: string;
  whatsapp_ativo: boolean;
  consentimento_status: string | null;
  consentimento_at: string | null;
  consentimento_origem: string | null;
  consentimento_versao: string | null;
  opt_out_at: string | null;
  opt_out_motivo: string | null;
}

export interface ConsentimentoHistorico {
  id: string;
  assistido_id: string;
  canal: string;
  acao: string;
  origem: string;
  versao_termo: string | null;
  observacao: string | null;
  created_at: string;
}

/** Snapshot de consentimento do assistido (campos de preferência). */
export async function getConsentimento(assistidoId: string): Promise<ConsentimentoPreferencia | null> {
  const { data, error } = await supabase
    .from("notificacoes_preferencias")
    .select(
      "assistido_id, whatsapp_ativo, consentimento_status, consentimento_at, consentimento_origem, consentimento_versao, opt_out_at, opt_out_motivo",
    )
    .eq("assistido_id", assistidoId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConsentimentoPreferencia) ?? null;
}

/** Histórico imutável de consentimento (mais recente primeiro). */
export async function getHistoricoConsentimento(assistidoId: string, limit = 50): Promise<ConsentimentoHistorico[]> {
  const { data, error } = await supabase
    .from("consentimentos_comunicacao")
    .select("id, assistido_id, canal, acao, origem, versao_termo, observacao, created_at")
    .eq("assistido_id", assistidoId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ConsentimentoHistorico[]) ?? [];
}

/**
 * Registra uma ação de consentimento: grava o histórico imutável e atualiza
 * o snapshot na preferência (incluindo o flag operacional `whatsapp_ativo`).
 */
export async function registrarConsentimento(
  assistidoId: string,
  acao: ConsentimentoAcao,
  origem: ConsentimentoOrigem = "app",
  observacao?: string,
): Promise<void> {
  const concedido = acao === "concedido";
  const snap = snapshotDaAcao(acao);

  // 1) trilha imutável
  const { error: histErr } = await supabase.from("consentimentos_comunicacao").insert({
    assistido_id: assistidoId,
    canal: "whatsapp",
    acao,
    origem,
    versao_termo: VERSAO_TERMO_CONSENTIMENTO,
    observacao: observacao ?? null,
  });
  if (histErr) throw histErr;

  // 2) snapshot atual na preferência (mantém compatibilidade com o gate de envio)
  const { error: prefErr } = await supabase
    .from("notificacoes_preferencias")
    .upsert(
      {
        assistido_id: assistidoId,
        whatsapp_ativo: concedido,
        consentimento_status: snap.consentimento_status,
        consentimento_at: snap.consentimento_at,
        consentimento_origem: origem,
        consentimento_versao: snap.consentimento_versao,
        opt_out_at: concedido ? null : new Date().toISOString(),
        opt_out_motivo: concedido ? null : (observacao || "consentimento_revogado"),
      },
      { onConflict: "assistido_id" },
    );
  if (prefErr) throw prefErr;
}
