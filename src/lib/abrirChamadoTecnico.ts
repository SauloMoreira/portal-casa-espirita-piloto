/**
 * SAAS-06-C1-FIX10 — Helper "Abrir chamado técnico".
 *
 * Comportamento:
 *  1. Se houver `instituicaoId` e sessão autenticada, chama a RPC
 *     `fn_abrir_chamado_tecnico` (SECURITY DEFINER, revoga anon) que grava um
 *     `chamados_suporte` do tipo `tecnico` com origem, código técnico e
 *     metadata seguros (rota atual, operação, entidade).
 *  2. Independentemente do sucesso do backend, copia um resumo técnico para a
 *     área de transferência como fallback UX.
 *  3. Nunca expõe o erro cru — todos os erros são logados internamente.
 */
import { supabase } from "@/integrations/supabase/client";
import type { FriendlyError } from "@/lib/supabaseFriendlyErrors";
import { formatSupportDetails } from "@/lib/supabaseFriendlyErrors";

export interface AbrirChamadoInput {
  origem: string; // ex.: "Sessões Públicas"
  friendly: FriendlyError;
  instituicaoId?: string | null;
  userId?: string | null;
}

export interface AbrirChamadoResult {
  copiado: boolean;
  texto: string;
  chamadoId: string | null;
  persisted: boolean;
}

export async function abrirChamadoTecnico(
  input: AbrirChamadoInput,
): Promise<AbrirChamadoResult> {
  const rota = typeof window !== "undefined" ? window.location.pathname : "";
  const linhas = [
    "Chamado técnico — SaaS Casa Espírita",
    `Origem: ${input.origem}`,
    formatSupportDetails(input.friendly),
    `Rota: ${rota}`,
    `Instituição: ${input.instituicaoId ?? "—"}`,
    `Usuário: ${input.userId ?? "—"}`,
    `Data/hora: ${new Date().toISOString()}`,
    `Mensagem exibida: ${input.friendly.message}`,
  ];
  const texto = linhas.join("\n");

  let chamadoId: string | null = null;
  let persisted = false;

  if (input.instituicaoId) {
    try {
      const assunto = `Erro técnico em ${input.origem}`.slice(0, 200);
      const descricao = [
        input.friendly.message,
        "",
        `Operação: ${input.friendly.operacao}`,
        `Entidade: ${input.friendly.entidade}`,
        `Rota: ${rota}`,
      ].join("\n");
      // Nota: `fn_abrir_chamado_tecnico` é uma RPC SECURITY DEFINER com REVOKE de anon.
      // A tipagem gerada pode não conhecê-la ainda; usamos cast controlado.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("fn_abrir_chamado_tecnico", {
        p_instituicao_id: input.instituicaoId,
        p_origem: input.origem,
        p_assunto: assunto,
        p_descricao: descricao,
        p_codigo_tecnico: input.friendly.code,
        p_metadata: {
          rota,
          operacao: input.friendly.operacao,
          entidade: input.friendly.entidade,
          codigo: input.friendly.code,
        },
      });
      if (!error && data) {
        chamadoId = typeof data === "string" ? data : (data as { id?: string })?.id ?? null;
        persisted = !!chamadoId;
      } else if (error) {
        console.warn("[chamado-tecnico:persist-failed]", error.message);
      }
    } catch (e) {
      console.warn("[chamado-tecnico:persist-exception]", e);
    }
  }

  console.warn("[chamado-tecnico]", {
    origem: input.origem,
    codigo: input.friendly.code,
    operacao: input.friendly.operacao,
    entidade: input.friendly.entidade,
    instituicaoId: input.instituicaoId,
    userId: input.userId,
    chamadoId,
    persisted,
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
  return { copiado, texto, chamadoId, persisted };
}
