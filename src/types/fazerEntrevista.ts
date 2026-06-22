export interface EntrevistaAssistido {
  id: string;
  nome: string;
  cpf: string | null;
  celular: string | null;
  email: string | null;
  status: string;
  quantidade_palestras: number;
}

export interface EntrevistaTipoTratamento {
  id: string;
  nome: string;
  tipo: string;
  dia_semana: number | null;
  horario: string | null;
  frequencia_valor: number | null;
  frequencia_unidade: string | null;
  status: string;
  ordem_tratamento: number | null;
  tratamento_livre: boolean;
  bloqueia_proximo_tratamento: boolean;
  modo_agendamento: string;
  quantidade_padrao_sessoes: number;
  trabalho_publico?: boolean;
  permite_entrada_sem_agendamento?: boolean;
}

export interface EntrevistaAssistidoForm {
  nome: string;
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
  observacoes: string;
}

export type TipoEntrevista = "regular" | "livre";

export interface EntrevistaDesignacao {
  tratamento_id: string;
  quantidade_total: number;
}

export interface SessaoGerada {
  data_sessao: string;
  horario: string | null;
}

export interface EntrevistaInitialData {
  assistidos: EntrevistaAssistido[];
  tratamentos: EntrevistaTipoTratamento[];
  minPalestras: number;
  permitirLivre: boolean;
}

export interface SubmitEntrevistaParams {
  selectedAssistido: EntrevistaAssistido;
  userId: string;
  dataEntrevista: string;
  tipoEntrevista: TipoEntrevista;
  observacoes: string;
  quantidades: Record<string, string>;
  datasIniciais: Record<string, string>;
  /** Horário efetivo por tratamento (obrigatório para holísticos). Sobrepõe o padrão do tipo. */
  horarios: Record<string, string>;
  tratamentoMap: Record<string, EntrevistaTipoTratamento>;
  agendaEntrevistaId: string | null;
}

export interface SubmitEntrevistaResult {
  entrevistaId: string;
  validDesignacoesCount: number;
}
