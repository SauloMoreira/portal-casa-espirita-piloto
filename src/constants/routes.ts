/**
 * Centralized route paths. Use these constants instead of hard-coded strings
 * in <Link>, navigate(), sidebar items and shortcut cards to avoid drift
 * between visual labels and actual routes.
 */
export const ROUTES = {
  // Public / auth
  login: "/login",
  solicitarCadastro: "/cadastro",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  mfaVerify: "/mfa-verify",
  checkinPublico: (token = ":token") => `/checkin-publico/${token}`,

  // Shared
  home: "/",
  dashboard: "/dashboard",
  notificacoes: "/notificacoes",
  centralNotificacoes: "/central-notificacoes",
  relatorios: "/relatorios",
  ajuda: "/ajuda",

  // Atendimento
  assistidos: "/assistidos",
  migrarAssistido: "/migrar-assistido",
  entrevistas: "/entrevistas",
  fazerEntrevista: "/fazer-entrevista",
  agenda: "/agenda",
  presenca: "/presenca",
  sessoesPublicas: "/sessoes-publicas",
  acaoSocial: "/acao-social",
  campanhas: "/campanhas",
  eventos: "/eventos",
  comunicacaoInstitucional: "/comunicacao-institucional",

  // Tratamentos
  tratamentos: "/tratamentos",
  listaEspera: "/lista-espera",
  coordenadorTratamentos: "/coordenador-tratamentos",
  coordenadorAgenda: "/coordenador-agenda",

  // Assistido
  meusTratamentos: "/meus-tratamentos",
  minhaAgenda: "/minha-agenda",
  meuPerfil: "/meu-perfil",
  meusDocumentos: "/meus-documentos",

  // Pessoas
  usuarios: "/usuarios",
  solicitacoesCadastro: "/solicitacoes-cadastro",
  governancaAcessos: "/governanca-acessos",
  segurancaConta: "/seguranca",
  voluntarios: "/voluntarios",
  funcoesVoluntariado: "/funcoes-voluntariado",

  // Inteligência / institucional
  painelInstitucional: "/painel-institucional",
  centralIa: "/central-ia",
  excecoes: "/excecoes",
  excecoesOperacionais: "/excecoes-operacionais",
  programacaoPadrao: "/programacao-padrao",
  auditoria: "/auditoria",
  regras: "/regras",
  configuracoes: "/configuracoes",
  gestaoCores: "/configuracoes/cores",
  instituicao: "/instituicao",
} as const;

export type AppRoute = typeof ROUTES;
