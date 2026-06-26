/** Centralized labels, colors and constants for the Voluntários module. */
import type { VoluntarioFormState } from "@/types/voluntarios";

export const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

export const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-green-100 text-green-800",
  inativo: "bg-gray-100 text-gray-800",
  afastado: "bg-yellow-100 text-yellow-800",
  desligado: "bg-red-100 text-red-800",
};

export const TIPOS_VOLUNTARIO = ["Médium", "Tarefeiro"];

/** Termo de Adesão lifecycle status. */
export const TERMO_STATUS = {
  NAO_GERADO: "nao_gerado",
  GERADO: "gerado",
  ASSINADO_ENVIADO: "assinado_enviado",
  VALIDADO: "validado",
  REJEITADO: "rejeitado",
} as const;

export const TERMO_STATUS_LABELS: Record<string, string> = {
  nao_gerado: "Não gerado",
  gerado: "Pendente de assinatura",
  assinado_enviado: "Assinado enviado",
  validado: "Validado",
  rejeitado: "Rejeitado",
};

export const TERMO_STATUS_COLORS: Record<string, string> = {
  nao_gerado: "bg-gray-100 text-gray-700",
  gerado: "bg-amber-100 text-amber-800",
  assinado_enviado: "bg-blue-100 text-blue-800",
  validado: "bg-green-100 text-green-800",
  rejeitado: "bg-red-100 text-red-800",
};

/** Signed-term upload constraints. */
export const TERMO_UPLOAD = {
  maxBytes: 15 * 1024 * 1024, // 15MB
  accepted: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  acceptAttr: "application/pdf,image/jpeg,image/png,image/webp",
} as const;


export const FILTER_TODOS = "todos";

export const VOLUNTARIO_MESSAGES = {
  required: "Obrigatório",
  invalidCpf: "CPF inválido",
  invalidEmail: "E-mail inválido",
  invalidPhone: "Celular inválido",
  cpfDuplicado: "CPF já cadastrado",
  selectTipo: "Selecione pelo menos um tipo",
  saveError: "Erro ao salvar",
  created: "Voluntário cadastrado",
  updated: "Voluntário atualizado",
  emptyList: "Nenhum voluntário encontrado",
} as const;

export const emptyVoluntarioForm: VoluntarioFormState = {
  nome_completo: "",
  celular: "",
  cpf: "",
  email: "",
  rg: "",
  data_nascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  foto_url: null,
  data_ingresso_sistema: new Date().toISOString().split("T")[0],
  data_adesao_voluntariado: "",
  tipos_voluntario: [],
  funcoes_ids: [],
  atuacao_detalhada: "",
  status: "ativo",
  data_desligamento: "",
  observacoes: "",
  origem_cadastro: null,
  origem_assistido_id: null,
  origem_user_id: null,
};
