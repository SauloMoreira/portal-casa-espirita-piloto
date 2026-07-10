/**
 * SAAS-06-C1-FIX09 — Stub para "Abrir chamado técnico".
 *
 * A Central de Chamados definitiva é entregue no FIX10 (SAAS-06-C1). Enquanto
 * a UI/tabela de chamados não existe, este helper apenas:
 *  1. Copia os detalhes técnicos amigáveis para a área de transferência.
 *  2. Loga um marcador estruturado no console para diagnóstico interno.
 *
 * Quando o FIX10 aterrissar, este helper passa a persistir em
 * `chamados_suporte` + `chamado_mensagens` sem alterar callers.
 */
import type { FriendlyError } from "@/lib/supabaseFriendlyErrors";
import { formatSupportDetails } from "@/lib/supabaseFriendlyErrors";

export interface AbrirChamadoInput {
  origem: string; // ex.: "Sessões Públicas"
  friendly: FriendlyError;
  instituicaoId?: string | null;
  userId?: string | null;
}

export async function abrirChamadoTecnico(
  input: AbrirChamadoInput,
): Promise<{ copiado: boolean; texto: string }> {
  const linhas = [
    "Chamado técnico — SaaS Casa Espírita",
    `Origem: ${input.origem}`,
    formatSupportDetails(input.friendly),
    `Instituição: ${input.instituicaoId ?? "—"}`,
    `Usuário: ${input.userId ?? "—"}`,
    `Data/hora: ${new Date().toISOString()}`,
    `Mensagem exibida: ${input.friendly.message}`,
  ];
  const texto = linhas.join("\n");

  // Log estruturado interno (não exibido ao usuário final).
  console.warn("[chamado-tecnico:pending-fix10]", {
    origem: input.origem,
    codigo: input.friendly.code,
    operacao: input.friendly.operacao,
    entidade: input.friendly.entidade,
    instituicaoId: input.instituicaoId,
    userId: input.userId,
  });

  let copiado = false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      copiado = true;
    }
  } catch {
    copiado = false;
  }
  return { copiado, texto };
}
