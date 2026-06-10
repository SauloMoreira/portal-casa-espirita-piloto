export const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

export const ENTREVISTA_STATUS_LABELS: Record<string, string> = {
  aguardando_palestras: "Aguardando Palestras",
  apto_para_entrevista: "Apto para Entrevista",
  entrevista_agendada: "Entrevista Agendada",
  entrevistado: "Entrevistado",
  em_tratamento: "Em Tratamento",
  concluido: "Concluído",
  inativo: "Inativo",
};

export const TIPO_ENTREVISTA_LABELS: Record<string, string> = {
  regular: "Regular",
  livre: "Livre",
};

export const MODO_AGENDAMENTO = {
  sequencialBloqueante: "sequencial_bloqueante",
  livreConcomitante: "livre_concomitante",
  agendadoPorDataInicial: "agendado_por_data_inicial",
} as const;

export const VINCULO_STATUS_RESETAVEL = [
  "aguardando_inicio",
  "aguardando_liberacao",
  "aguardando_agendamento",
] as const;

export const EMPTY_ASSISTIDO_FORM = {
  nome: "",
  cpf: "",
  celular: "",
  email: "",
  data_nascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  foto_url: null as string | null,
  observacoes: "",
};

export const ENTREVISTA_MESSAGES = {
  selecioneAssistido: "Selecione um assistido",
  naoApto: "Assistido não está apto para entrevista regular",
  informeData: "Informe a data da entrevista",
  cpfJaCadastrado: "CPF já cadastrado",
  preenchaObservacoes: "Preencha as observações antes de usar o assistente",
  navegadorSemVoz: "Navegador não suporta reconhecimento de voz",
} as const;
