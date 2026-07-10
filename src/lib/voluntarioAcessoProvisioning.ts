/**
 * SAAS-06-C1-FIX16 — Cliente do provisionamento de acesso para voluntários
 * órfãos (sem auth.users). Chama a edge function `voluntario-provisionar-acesso`.
 *
 * REGRAS APROVADAS:
 * - Nunca criar auth.users com e-mail sintético/placeholder.
 * - E-mail REAL é obrigatório no ato de conceder acesso.
 * - Idempotente: reaproveita usuário por CPF/e-mail; não duplica vínculos.
 * - Cadastro do voluntário permanece permitido sem e-mail; só o acesso exige.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ProvisionarAcessoInput {
  voluntarioId: string;
  email: string;
  role: "entrevistador" | "tarefeiro" | "coordenador_de_tratamento";
  motivo?: string | null;
}

export interface ProvisionarAcessoResult {
  userId: string;
  userCriado: boolean;
  grantStatus: string;
}

export function isEmailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function provisionarAcessoVoluntario(
  input: ProvisionarAcessoInput,
): Promise<ProvisionarAcessoResult> {
  if (!input.voluntarioId) {
    throw new Error("Selecione o voluntário para gerar o acesso.");
  }
  if (!input.email || !isEmailValido(input.email)) {
    throw new Error("Informe um e-mail válido para criar o acesso ao sistema.");
  }

  const { data, error } = await supabase.functions.invoke(
    "voluntario-provisionar-acesso",
    {
      body: {
        voluntario_id: input.voluntarioId,
        email: input.email.trim().toLowerCase(),
        role: input.role,
        motivo: input.motivo ?? null,
      },
    },
  );

  if (error) throw new Error(error.message || "Falha ao gerar acesso.");
  const payload = (data ?? {}) as Record<string, unknown>;
  if (typeof payload.error === "string") throw new Error(payload.error);

  return {
    userId: String(payload.user_id ?? ""),
    userCriado: Boolean(payload.user_criado),
    grantStatus: String(payload.grant_status ?? "concedido"),
  };
}

export interface VoluntarioOrfao {
  voluntario_id: string;
  nome_completo: string;
  email: string | null;
  celular: string | null;
  cpf: string | null;
  tipos_voluntario: string[] | null;
  status: string;
  possui_email: boolean;
  created_at: string;
}

export async function fetchVoluntariosOrfaosDoTenant(
  instituicaoId: string,
): Promise<VoluntarioOrfao[]> {
  if (!instituicaoId) return [];
  const { data, error } = await supabase.rpc("fn_voluntarios_orfaos_do_tenant", {
    p_instituicao_id: instituicaoId,
  });
  if (error) return [];
  return (data ?? []) as VoluntarioOrfao[];
}
