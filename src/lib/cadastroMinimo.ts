// ============================================================================
// Cadastro mínimo operacional do assistido (regras puras e testáveis).
//
// Decisão funcional: no cadastro inicial só Nome + Celular são obrigatórios.
// Todos os demais campos (CPF, e-mail, nascimento, endereço, motivo) são
// opcionais nessa etapa e podem ser completados depois.
//
// O backend é a fonte de verdade (trigger trg_assistido_cadastro_minimo):
// este módulo apenas espelha as regras para feedback imediato na UI.
// ============================================================================

import { isValidCPF, isValidEmail, isValidPhone } from "./validators";
import { normalizeCelular } from "./normalize";

export interface CadastroMinimoInput {
  nome?: string | null;
  celular?: string | null;
  cpf?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Valida o CADASTRO MÍNIMO inicial do assistido.
 * Apenas Nome e Celular são obrigatórios. Os demais campos só são validados
 * quando informados (formato), nunca exigidos nesta etapa.
 */
export function validarCadastroMinimo(input: CadastroMinimoInput): ValidationResult {
  const errors: Record<string, string> = {};

  const nome = (input.nome ?? "").trim();
  if (!nome) errors.nome = "Nome obrigatório";

  const celular = (input.celular ?? "").trim();
  if (!celular) errors.celular = "Celular obrigatório";
  else if (!isValidPhone(celular)) errors.celular = "Celular inválido";

  // Opcionais: só validam formato quando preenchidos.
  if (input.cpf && input.cpf.replace(/\D/g, "").length > 0 && !isValidCPF(input.cpf)) {
    errors.cpf = "CPF inválido";
  }
  if (input.email && input.email.trim().length > 0 && !isValidEmail(input.email.trim())) {
    errors.email = "E-mail inválido";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Indica se o cadastro está COMPLETO (todos os dados complementares presentes).
 * Espelha public.fn_assistido_cadastro_esta_completo. Usado apenas para rótulo
 * de status na UI — não bloqueia nada.
 */
export function cadastroEstaCompleto(input: CadastroMinimoInput): boolean {
  const has = (v?: string | null) => !!(v && v.toString().trim().length > 0);
  return (
    has(input.nome) &&
    !!normalizeCelular(input.celular ?? null) &&
    has(input.cpf?.replace?.(/\D/g, "") ?? input.cpf) &&
    has(input.email) &&
    has(input.data_nascimento) &&
    has(input.cep?.replace?.(/\D/g, "") ?? input.cep) &&
    has(input.logradouro) &&
    has(input.numero) &&
    has(input.bairro) &&
    has(input.cidade) &&
    has(input.estado)
  );
}

/** Rótulo/tom de status do cadastro para exibição na UI. */
export function rotuloStatusCadastro(completo: boolean): { label: string; tom: "ok" | "pendente" } {
  return completo
    ? { label: "Cadastro completo", tom: "ok" }
    : { label: "Cadastro mínimo (completar depois)", tom: "pendente" };
}

/**
 * Verifica deduplicação por celular contra uma lista de assistidos já
 * carregados (verificação otimista no cliente; o backend é a garantia final).
 * Retorna o id do assistido existente com o mesmo celular, ou null.
 */
export function encontrarDuplicadoPorCelular(
  celular: string | null | undefined,
  assistidos: Array<{ id: string; celular?: string | null; telefone?: string | null }>,
  ignorarId?: string | null,
): string | null {
  const alvo = normalizeCelular(celular ?? null);
  if (!alvo) return null;
  for (const a of assistidos) {
    if (ignorarId && a.id === ignorarId) continue;
    const cel = normalizeCelular(a.celular ?? a.telefone ?? null);
    if (cel && cel === alvo) return a.id;
  }
  return null;
}

/** Mensagem canônica para celular duplicado (alinhada ao backend). */
export const CELULAR_DUPLICADO_MSG = "Já existe um assistido cadastrado com este celular.";
