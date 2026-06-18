/**
 * Domain types for the Voluntários module.
 *
 * Built on top of the auto-generated Supabase row types via `@/types`.
 * Replaces the previous inline `any` usage across the page/components.
 */
import type { Voluntario, FuncaoVoluntariado } from "@/types";

export type { Voluntario, FuncaoVoluntariado };

/** Volunteer row enriched with the function ids loaded separately. */
export interface VoluntarioListItem extends Voluntario {
  funcoes?: string[];
}

export type VoluntarioStatus = "ativo" | "inativo" | "afastado" | "desligado";

/** Editable form state for create/edit. Strings for masked inputs. */
export interface VoluntarioFormState {
  nome_completo: string;
  celular: string;
  cpf: string;
  email: string;
  rg: string;
  data_nascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  foto_url: string | null;
  data_ingresso_sistema: string;
  data_adesao_voluntariado: string;
  tipos_voluntario: string[];
  funcoes_ids: string[];
  atuacao_detalhada: string;
  status: string;
  data_desligamento: string;
  observacoes: string;
}

export type VoluntarioFormErrors = Partial<Record<string, string>>;

export interface VoluntarioFilterState {
  search: string;
  status: string;
  tipo: string;
  funcao: string;
  termo: string;
}

/** Map of voluntario_id -> list of funcao_id. */
export type VoluntarioFuncoesMap = Record<string, string[]>;
