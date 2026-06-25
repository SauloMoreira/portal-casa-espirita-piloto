/**
 * P1.2 — Service de leitura da observabilidade operacional.
 *
 * Única responsabilidade: chamar a RPC `fn_observabilidade_operacional`
 * (fonte de verdade) e devolver o payload tipado. Sem lógica paralela.
 */
import { supabase } from "@/integrations/supabase/client";
import { withRetry } from "@/lib/resilience";
import type {
  JanelaObservabilidade,
  ObservabilidadePayload,
} from "@/lib/observabilidade";

export async function carregarObservabilidade(
  janela: JanelaObservabilidade,
): Promise<ObservabilidadePayload> {
  return withRetry(async () => {
    const { data, error } = await supabase.rpc("fn_observabilidade_operacional", {
      p_janela: janela,
    });
    if (error) throw error;
    return data as unknown as ObservabilidadePayload;
  });
}
