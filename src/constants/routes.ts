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
  segurancaPrivacidade: "/seguranca-privacidade",

  // Shared
  home: "/",
  dashboard: "/dashboard",
  notificacoes: "/notificacoes",
  centralNotificacoes: "/central-notificacoes",
  relatorios: "/relatorios",
  observabilidade: "/observabilidade",
  ajuda: "/ajuda",

  // Atendimento
  assistidos: "/assistidos",
  consultaAssistido: "/consulta-assistido",
  migrarAssistido: "/migrar-assistido",
  homologacaoAgenda: "/homologacao-agenda",
  entrevistas: "/entrevistas",
  fazerEntrevista: "/fazer-entrevista",
  agenda: "/agenda",
  avisosAusencia: "/avisos-ausencia",
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
  escopoOperacional: "/escopo-operacional",
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
  governancaParametros: "/governanca-parametros",
  configuracoes: "/configuracoes",
  gestaoCores: "/configuracoes/cores",
  instituicao: "/instituicao",

  // SaaS Portal / Hub (SAAS-03)
  portal: "/portal",
  portalInstituicoes: "/portal/instituicoes",
  portalModulos: "/portal/modulos",
  portalAdmin: "/portal/admin",
  portalAssinaturas: "/portal/admin/assinaturas",
  portalSolicitacoes: "/portal/admin/solicitacoes",
  portalChamados: "/portal/admin/chamados",
  portalPlanoAssinatura: "/portal/plano-assinatura",
  chamados: "/chamados",
} as const;

export type AppRoute = typeof ROUTES;
