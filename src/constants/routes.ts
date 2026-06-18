/**
 * Centralized route paths. Use these constants instead of hard-coded strings
 * in <Link>, navigate(), sidebar items and shortcut cards to avoid drift
 * between visual labels and actual routes.
 */
export const ROUTES = {
  // Public / auth
  login: "/login",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  checkinPublico: (token = ":token") => `/checkin-publico/${token}`,

  // Shared
  home: "/",
  dashboard: "/dashboard",
  notificacoes: "/notificacoes",
  centralNotificacoes: "/central-notificacoes",
  relatorios: "/relatorios",

  // Atendimento
  assistidos: "/assistidos",
  entrevistas: "/entrevistas",
  fazerEntrevista: "/fazer-entrevista",
  agenda: "/agenda",
  presenca: "/presenca",
  sessoesPublicas: "/sessoes-publicas",

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
  voluntarios: "/voluntarios",
  funcoesVoluntariado: "/funcoes-voluntariado",

  // Inteligência / institucional
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
