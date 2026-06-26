// ============================================================================
// Cadastro de voluntário: regras puras e testáveis.
//
// Espelha o backend (trigger trg_voluntario_cadastro + fn_voluntario_*):
//   - Cadastro mínimo: Nome + Celular válido + pelo menos um tipo.
//   - Completude: todos os dados que o termo imprime.
//   - Reaproveitamento de pessoa existente (assistido/usuário) com mapeamento
//     explícito entre DADOS-BASE da pessoa e CONTEXTO de voluntário.
//   - Deduplicação por CPF e celular normalizado.
//
// O backend é a fonte de verdade; este módulo dá feedback imediato na UI.
// ============================================================================

import { isValidCPF, isValidEmail, isValidPhone } from "./validators";
import { normalizeCelular } from "./normalize";

export interface VoluntarioMinimoInput {
  nome_completo?: string | null;
  celular?: string | null;
  tipos_voluntario?: string[] | null;
  cpf?: string | null;
  email?: string | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Valida o CADASTRO MÍNIMO do voluntário.
 * Obrigatórios: Nome, Celular válido e ao menos um tipo de voluntário.
 * CPF/e-mail só validam formato quando informados (nunca exigidos aqui).
 */
export function validarCadastroMinimoVoluntario(
  input: VoluntarioMinimoInput,
): ValidationResult {
  const errors: Record<string, string> = {};

  if (!(input.nome_completo ?? "").trim()) errors.nome_completo = "Nome obrigatório";

  const celular = (input.celular ?? "").trim();
  if (!celular) errors.celular = "Celular obrigatório";
  else if (!isValidPhone(celular)) errors.celular = "Celular inválido";

  if (!input.tipos_voluntario || input.tipos_voluntario.length === 0) {
    errors.tipos_voluntario = "Selecione pelo menos um tipo";
  }

  if (input.cpf && input.cpf.replace(/\D/g, "").length > 0 && !isValidCPF(input.cpf)) {
    errors.cpf = "CPF inválido";
  }
  if (input.email && input.email.trim().length > 0 && !isValidEmail(input.email.trim())) {
    errors.email = "E-mail inválido";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export interface VoluntarioCompletoInput {
  nome_completo?: string | null;
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

/** Campos exigidos para o cadastro ser considerado COMPLETO (e liberar o termo). */
const CAMPOS_COMPLETUDE: Array<{ key: keyof VoluntarioCompletoInput; label: string; digits?: boolean }> = [
  { key: "cpf", label: "CPF", digits: true },
  { key: "email", label: "E-mail" },
  { key: "data_nascimento", label: "Data de nascimento" },
  { key: "cep", label: "CEP", digits: true },
  { key: "logradouro", label: "Logradouro" },
  { key: "numero", label: "Número" },
  { key: "bairro", label: "Bairro" },
  { key: "cidade", label: "Cidade" },
  { key: "estado", label: "Estado" },
];

const preenchido = (v?: string | null, digits?: boolean) => {
  if (!v) return false;
  return (digits ? v.replace(/\D/g, "") : v.toString().trim()).length > 0;
};

/** Lista de campos pendentes para o cadastro ficar completo. Espelha o backend. */
export function pendenciasCadastroVoluntario(input: VoluntarioCompletoInput): string[] {
  const pend: string[] = [];
  if (!preenchido(input.nome_completo)) pend.push("Nome");
  if (!normalizeCelular(input.celular ?? null)) pend.push("Celular");
  for (const c of CAMPOS_COMPLETUDE) {
    if (!preenchido(input[c.key], c.digits)) pend.push(c.label);
  }
  return pend;
}

/** Indica se o cadastro do voluntário está COMPLETO. */
export function voluntarioCadastroCompleto(input: VoluntarioCompletoInput): boolean {
  return pendenciasCadastroVoluntario(input).length === 0;
}

/** Rótulo/tom de status do cadastro para exibição na UI. */
export function rotuloStatusCadastroVoluntario(
  completo: boolean,
): { label: string; tom: "ok" | "pendente" } {
  return completo
    ? { label: "Cadastro completo", tom: "ok" }
    : { label: "Cadastro mínimo (completar depois)", tom: "pendente" };
}

/** Gating do termo: só libera com cadastro completo; senão devolve pendências. */
export function podeGerarTermo(input: VoluntarioCompletoInput): {
  permitido: boolean;
  pendencias: string[];
} {
  const pendencias = pendenciasCadastroVoluntario(input);
  return { permitido: pendencias.length === 0, pendencias };
}

// ---------------------------------------------------------------------------
// Reaproveitamento de pessoa existente.
//
// DADOS-BASE da pessoa (pré-preenchidos a partir de assistido/usuário e
// persistidos no voluntário como cópia editável): nome, cpf, celular, email,
// nascimento, endereço, foto.
//
// CONTEXTO de voluntário (nunca vem da origem; definido no cadastro):
// tipos_voluntario, funções, datas de ingresso/adesão, status, termo.
//
// RASTREABILIDADE (persistida, não editável pelo formulário): origem_cadastro,
// origem_assistido_id, origem_user_id.
// ---------------------------------------------------------------------------

export interface PessoaCandidata {
  origem: "assistido" | "usuario";
  origem_id: string;
  user_id?: string | null;
  nome?: string | null;
  cpf?: string | null;
  celular?: string | null;
  email?: string | null;
  data_nascimento?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  foto_url?: string | null;
  ja_voluntario?: boolean;
}

export interface VoluntarioPrefill {
  nome_completo: string;
  cpf: string;
  celular: string;
  email: string;
  data_nascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  foto_url: string | null;
  origem_cadastro: string;
  origem_assistido_id: string | null;
  origem_user_id: string | null;
}

/** Mapeia uma pessoa existente para o pré-preenchimento dos DADOS-BASE. */
export function mapearPessoaParaPrefill(p: PessoaCandidata): VoluntarioPrefill {
  const s = (v?: string | null) => (v ?? "").toString();
  return {
    nome_completo: s(p.nome),
    cpf: s(p.cpf),
    celular: s(p.celular),
    email: s(p.email),
    data_nascimento: s(p.data_nascimento),
    cep: s(p.cep),
    logradouro: s(p.logradouro),
    numero: s(p.numero),
    complemento: s(p.complemento),
    bairro: s(p.bairro),
    cidade: s(p.cidade),
    estado: s(p.estado),
    foto_url: p.foto_url ?? null,
    origem_cadastro: p.origem === "assistido" ? "reaproveitado_assistido" : "reaproveitado_usuario",
    origem_assistido_id: p.origem === "assistido" ? p.origem_id : null,
    origem_user_id: p.user_id ?? null,
  };
}

/**
 * Deduplicação local (reforço de UX; o backend é a garantia final).
 * Retorna o id do voluntário existente que colide por CPF ou celular.
 */
export function encontrarVoluntarioDuplicado(
  input: { cpf?: string | null; celular?: string | null },
  voluntarios: Array<{ id: string; cpf?: string | null; celular?: string | null; status?: string | null }>,
  ignorarId?: string | null,
): string | null {
  const cpfAlvo = (input.cpf ?? "").replace(/\D/g, "") || null;
  const celAlvo = normalizeCelular(input.celular ?? null);
  for (const v of voluntarios) {
    if (ignorarId && v.id === ignorarId) continue;
    if (v.status === "desligado") continue;
    const cpf = (v.cpf ?? "").replace(/\D/g, "") || null;
    const cel = normalizeCelular(v.celular ?? null);
    if (cpfAlvo && cpf && cpf === cpfAlvo) return v.id;
    if (celAlvo && cel && cel === celAlvo) return v.id;
  }
  return null;
}
