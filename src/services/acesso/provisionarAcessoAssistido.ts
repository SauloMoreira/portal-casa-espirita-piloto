/**
 * SAAS-06-C1-STAB10-A.1 — Cliente tipado do provisionamento de acesso do assistido.
 *
 * Encapsula a chamada à Edge Function `provisionar-acesso-assistido`:
 *   - lê apenas códigos funcionais conhecidos;
 *   - nunca propaga mensagens brutas de Auth/SQL/RLS/PostgREST à UI;
 *   - aplica fallback para respostas 2xx sem JSON, código desconhecido ou falha de rede.
 */
import { supabase } from "@/integrations/supabase/client";
import { edgeBodyError, resolveInvokeErrorMessage } from "@/lib/edgeFunctionResponse";

export type ProvisionarAcessoInput = {
  assistido_id: string;
  email: string;
  password: string;
  celular: string;
  data_nascimento: string;
};

export const PROVISIONAR_ERROR_CODES = [
  "REQUEST_INVALIDO",
  "NAO_AUTORIZADO",
  "ASSISTIDO_NAO_ENCONTRADO",
  "ASSISTIDO_EXCLUIDO",
  "ASSISTIDO_SEM_INSTITUICAO",
  "ASSISTIDO_ACESSO_INCONSISTENTE",
  "CROSS_TENANT_ACCESS_DENIED",
  "OPERADOR_SEM_PAPEL_GLOBAL",
  "EMAIL_INVALIDO",
  "CELULAR_INVALIDO",
  "DATA_NASCIMENTO_INVALIDA",
  "EMAIL_EM_USO",
  "PROVISIONAMENTO_FALHOU",
  "PROVISIONAMENTO_RESULTADO_INDETERMINADO",
  "AUTH_USER_ORFAO",
  "FALHA_REDE",
  "RESPOSTA_INVALIDA",
] as const;
export type ProvisionarErrorCode = (typeof PROVISIONAR_ERROR_CODES)[number];

export type ProvisionarResult =
  | { ok: true; user_id?: string; already_provisioned?: boolean }
  | { ok: false; code: ProvisionarErrorCode };

const KNOWN = new Set<string>(PROVISIONAR_ERROR_CODES);

function normalizeCode(raw: unknown): ProvisionarErrorCode {
  if (typeof raw === "string" && KNOWN.has(raw)) return raw as ProvisionarErrorCode;
  return "PROVISIONAMENTO_FALHOU";
}

export async function provisionarAcessoAssistido(
  input: ProvisionarAcessoInput,
): Promise<ProvisionarResult> {
  try {
    const { data, error } = await supabase.functions.invoke("provisionar-acesso-assistido", {
      body: input,
    });

    if (error) {
      // Erro não-2xx: extrai o código funcional do corpo JSON, jamais a mensagem bruta.
      const rawMsg = await resolveInvokeErrorMessage(error as any);
      return { ok: false, code: normalizeCode(rawMsg) };
    }

    if (data == null || typeof data !== "object") {
      return { ok: false, code: "RESPOSTA_INVALIDA" };
    }
    const embedded = edgeBodyError(data);
    if (embedded) return { ok: false, code: normalizeCode(embedded) };

    const d = data as Record<string, unknown>;
    return {
      ok: true,
      user_id: typeof d.user_id === "string" ? d.user_id : undefined,
      already_provisioned: d.already_provisioned === true,
    };
  } catch {
    return { ok: false, code: "FALHA_REDE" };
  }
}

export function mensagemAmigavel(code: ProvisionarErrorCode): string {
  switch (code) {
    case "EMAIL_EM_USO":
      return "Este e-mail já possui uma conta no sistema.";
    case "EMAIL_INVALIDO":
      return "E-mail inválido.";
    case "CELULAR_INVALIDO":
      return "Celular inválido.";
    case "DATA_NASCIMENTO_INVALIDA":
      return "Data de nascimento inválida.";
    case "CROSS_TENANT_ACCESS_DENIED":
      return "Você não tem permissão para gerar acesso deste assistido.";
    case "OPERADOR_SEM_PAPEL_GLOBAL":
      return "Seu perfil não permite gerar acessos.";
    case "ASSISTIDO_ACESSO_INCONSISTENTE":
      return "Este assistido já possui um acesso parcialmente vinculado. Peça ao administrador para regularizar antes de gerar novamente.";
    case "ASSISTIDO_EXCLUIDO":
      return "Este assistido está excluído.";
    case "ASSISTIDO_NAO_ENCONTRADO":
      return "Assistido não encontrado.";
    case "ASSISTIDO_SEM_INSTITUICAO":
      return "Assistido sem instituição vinculada.";
    case "PROVISIONAMENTO_RESULTADO_INDETERMINADO":
      return "Não foi possível confirmar o resultado. Verifique o acesso antes de tentar novamente.";
    case "AUTH_USER_ORFAO":
      return "A conta ficou em estado inconsistente e requer regularização manual pelo administrador.";
    case "NAO_AUTORIZADO":
      return "Sessão expirada. Faça login novamente.";
    case "FALHA_REDE":
      return "Falha de comunicação. Verifique a conexão e tente novamente.";
    case "RESPOSTA_INVALIDA":
      return "Resposta inesperada do servidor. Tente novamente em instantes.";
    case "REQUEST_INVALIDO":
      return "Dados inválidos. Revise os campos e tente novamente.";
    default:
      return "Não foi possível criar o acesso. Tente novamente.";
  }
}
