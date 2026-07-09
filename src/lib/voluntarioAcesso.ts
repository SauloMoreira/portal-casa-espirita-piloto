/**
 * SAAS-06-C1-FIX05 — Orientação entre atuação (voluntário) e acesso.
 *
 * INV-ATU: cadastro de voluntário NUNCA concede acesso ao sistema.
 * Este módulo é puro: só ajuda a UI a orientar o administrador.
 */
import type { AppRole } from "@/constants/roles";

/** Papéis considerados "acesso operacional" ao sistema (não-assistido). */
export const OPERATIONAL_ROLES: AppRole[] = [
  "tarefeiro",
  "entrevistador",
  "coordenador_de_tratamento",
  "admin",
  "administrador_master",
];

/** Tipos de atuação que sugerem necessidade futura de acesso operacional. */
export const TIPOS_OPERACIONAIS = ["Tarefeiro", "Médium"] as const;

export function requiresOperationalAccessHint(tipos: string[] | null | undefined): boolean {
  if (!tipos || tipos.length === 0) return false;
  return tipos.some((t) => (TIPOS_OPERACIONAIS as readonly string[]).includes(t));
}

export const ACESSO_LABELS = {
  concedido: "Acesso operacional: Ativo",
  naoConcedido: "Acesso ao sistema: Não concedido",
  orientacao:
    "Este cadastro define a atuação da pessoa na casa, mas não libera acesso ao sistema. Para conceder acesso operacional, vá em Acesso e Segurança → Permissões de Acesso.",
  orientacaoCurta:
    "Tipo de voluntário não equivale a acesso ao sistema. Gerencie permissões em Acesso e Segurança → Permissões de Acesso.",
} as const;
