/**
 * Domain types organized by business area.
 *
 * These are thin, intention-revealing aliases on top of the auto-generated
 * Supabase types (`@/integrations/supabase/types`). Prefer importing from here
 * (e.g. `import type { Assistido } from "@/types"`) instead of using `any` or
 * re-deriving row shapes inline. Extend rows with relational/computed fields
 * via the `*With...` helper types where joins are loaded.
 */
import type { Tables } from "@/integrations/supabase/types";

/* ----------------------------- Core entities ----------------------------- */
export type Assistido = Tables<"assistidos">;
export type Tratamento = Tables<"tipos_tratamento">;
export type VinculoAssistidoTratamento = Tables<"assistido_tratamentos">;
export type SessaoAgendada = Tables<"agenda_tratamentos_assistido">;
export type PresencaTratamento = Tables<"presencas_tratamentos">;

/* ------------------------------ Entrevistas ------------------------------ */
export type EntrevistaFraterna = Tables<"entrevistas_fraternas">;
/** Entrevista ainda não realizada (somente agendada). */
export type EntrevistaAgendada = EntrevistaFraterna;
/** Entrevista já concluída/realizada. */
export type EntrevistaRealizada = EntrevistaFraterna;

/* --------------------------- Sessões públicas ---------------------------- */
export type SessaoPublica = Tables<"sessoes_publicas">;
export type CheckinPublico = Tables<"checkins_publicos">;
export type Palestra = Tables<"palestras">;
export type PresencaPalestra = Tables<"presencas_palestras">;

/* ------------------------------ Voluntários ------------------------------ */
export type Voluntario = Tables<"voluntarios">;
export type FuncaoVoluntariado = Tables<"funcoes_voluntariado">;
export type VoluntarioFuncao = Tables<"voluntario_funcoes">;

/* -------------------------------- Pessoas -------------------------------- */
export type Profile = Tables<"profiles">;
export type UserRole = Tables<"user_roles">;

/* ----------------------------- Inteligência ------------------------------ */
export type IaSugestao = Tables<"ia_sugestoes">;
export type IaFeedback = Tables<"ia_feedback">;
export type IaBiblioteca = Tables<"ia_biblioteca">;

/* --------------------------- Configuração / sys -------------------------- */
export type RegraOperacional = Tables<"regras_operacionais">;
export type InstituicaoConfig = Tables<"instituicao_config">;
export type AvisoInterno = Tables<"avisos_internos">;
export type AuditLog = Tables<"audit_logs">;

export type { Assistido as AssistidoRow };

/* --------------------------- Composed / joined --------------------------- */
export interface SessaoAgendadaComTratamento extends SessaoAgendada {
  tipos_tratamento?: Pick<Tratamento, "id" | "nome"> | null;
}

export interface VinculoComTratamento extends VinculoAssistidoTratamento {
  tipos_tratamento?: Tratamento | null;
}

export * from "./dashboard";
