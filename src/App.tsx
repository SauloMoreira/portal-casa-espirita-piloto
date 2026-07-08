import { Suspense, lazy, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequireInstituicao } from "@/components/RequireInstituicao";
import { AppLayout } from "@/components/AppLayout";
import { withErrorBoundary as guard } from "@/components/ErrorBoundary";
import { useThemeColors } from "@/hooks/useThemeColors";
import { ROUTES } from "@/constants";

// Eager: small auth/entry pages on the critical path.
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SolicitarCadastro from "./pages/SolicitarCadastro";
import MfaVerify from "./pages/MfaVerify";

// Lazy: route-split the heavier authenticated pages to lighten the initial bundle.
const CheckinPublico = lazy(() => import("./pages/CheckinPublico"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const GovernancaAcessos = lazy(() => import("./pages/GovernancaAcessos"));
const EscopoOperacional = lazy(() => import("./pages/EscopoOperacional"));
const SolicitacoesCadastro = lazy(() => import("./pages/SolicitacoesCadastro"));
const SegurancaConta = lazy(() => import("./pages/SegurancaConta"));
const Tratamentos = lazy(() => import("./pages/Tratamentos"));
const Assistidos = lazy(() => import("./pages/Assistidos"));
const ConsultaAssistido = lazy(() => import("./pages/ConsultaAssistido"));
const MigrarAssistido = lazy(() => import("./pages/MigrarAssistido"));
const HomologacaoAgenda = lazy(() => import("./pages/HomologacaoAgenda"));
const Entrevistas = lazy(() => import("./pages/Entrevistas"));
const FazerEntrevista = lazy(() => import("./pages/FazerEntrevista"));
const Agenda = lazy(() => import("./pages/Agenda"));
const AvisosAusencia = lazy(() => import("./pages/AvisosAusencia"));
const Presenca = lazy(() => import("./pages/Presenca"));
const MeusTratamentos = lazy(() => import("./pages/MeusTratamentos"));
const MinhaAgenda = lazy(() => import("./pages/MinhaAgenda"));
const MeuPerfil = lazy(() => import("./pages/MeuPerfil"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const GestaoCores = lazy(() => import("./pages/GestaoCores"));
const Auditoria = lazy(() => import("./pages/Auditoria"));
const RegrasOperacionais = lazy(() => import("./pages/RegrasOperacionais"));
const GovernancaParametros = lazy(() => import("./pages/GovernancaParametros"));
const Excecoes = lazy(() => import("./pages/Excecoes"));
const ExcecoesOperacionais = lazy(() => import("./pages/ExcecoesOperacionais"));
const ProgramacaoPadrao = lazy(() => import("./pages/ProgramacaoPadrao"));
const Instituicao = lazy(() => import("./pages/Instituicao"));
const CoordenadorListaEspera = lazy(() => import("./pages/CoordenadorListaEspera"));
const CoordenadorTratamentos = lazy(() => import("./pages/CoordenadorTratamentos"));
const CoordenadorAgenda = lazy(() => import("./pages/CoordenadorAgenda"));
const Notificacoes = lazy(() => import("./pages/Notificacoes"));
const CentralNotificacoes = lazy(() => import("./pages/CentralNotificacoes"));
const Observabilidade = lazy(() => import("./pages/Observabilidade"));
const MeusDocumentos = lazy(() => import("./pages/MeusDocumentos"));
const CentralIA = lazy(() => import("./pages/CentralIA"));
const Voluntarios = lazy(() => import("./pages/Voluntarios"));
const FuncoesVoluntariado = lazy(() => import("./pages/FuncoesVoluntariado"));
const CentralAjuda = lazy(() => import("./pages/CentralAjuda"));
const SessoesPublicas = lazy(() => import("./pages/SessoesPublicas"));
const AcaoSocial = lazy(() => import("./pages/AcaoSocial"));
const Campanhas = lazy(() => import("./pages/Campanhas"));
const Eventos = lazy(() => import("./pages/Eventos"));
const ComunicacaoInstitucional = lazy(() => import("./pages/ComunicacaoInstitucional"));
const PainelInstitucional = lazy(() => import("./pages/PainelInstitucional"));
const SegurancaPrivacidade = lazy(() => import("./pages/SegurancaPrivacidade"));
const OAuthConsent = lazy(() => import("./pages/OAuthConsent"));
const NotFound = lazy(() => import("./pages/NotFound"));

// SaaS Portal / Hub (SAAS-03)
const Portal = lazy(() => import("./pages/Portal"));
const PortalInstituicoes = lazy(() => import("./pages/PortalInstituicoes"));
const PortalModulos = lazy(() => import("./pages/PortalModulos"));
const PortalAdmin = lazy(() => import("./pages/PortalAdmin"));
const PortalAssinaturas = lazy(() => import("./pages/PortalAssinaturas"));

const queryClient = new QueryClient();

const ThemeLoader = ({ children }: { children: React.ReactNode }) => {
  useThemeColors();
  return <>{children}</>;
};

const RouteFallback = () => (
  <div className="flex h-[60vh] w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
  </div>
);

// SAAS-05-D — Wrapper que exige instituição ativa selecionada em rotas
// operacionais. Rotas globais (identidade, portal, check-in público) NÃO usam.
const tenant = (node: ReactNode) => (
  <RequireInstituicao>{node}</RequireInstituicao>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ThemeLoader>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path={ROUTES.login} element={<Login />} />
                <Route path={ROUTES.solicitarCadastro} element={<SolicitarCadastro />} />
                <Route path={ROUTES.forgotPassword} element={<ForgotPassword />} />
                <Route path={ROUTES.resetPassword} element={<ResetPassword />} />
                <Route path={ROUTES.mfaVerify} element={<MfaVerify />} />
                <Route path={ROUTES.checkinPublico()} element={guard(<CheckinPublico />, "Check-in Público")} />
                <Route path={ROUTES.segurancaPrivacidade} element={guard(<SegurancaPrivacidade />, "Segurança e Privacidade")} />
                <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
                <Route path={ROUTES.home} element={<Navigate to={ROUTES.dashboard} replace />} />


                <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                  <Route path={ROUTES.dashboard} element={tenant(guard(<Dashboard />, "Dashboard"))} />
                  <Route path={ROUTES.usuarios} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(<Usuarios />)}</ProtectedRoute>} />
                  <Route path={ROUTES.solicitacoesCadastro} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<SolicitacoesCadastro />, "Solicitações de Cadastro"))}</ProtectedRoute>} />
                  <Route path={ROUTES.governancaAcessos} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<GovernancaAcessos />, "Governança de Acessos"))}</ProtectedRoute>} />
                  <Route path={ROUTES.escopoOperacional} element={<ProtectedRoute allowedRoles={["admin", "administrador_master"]}>{tenant(guard(<EscopoOperacional />, "Escopo Operacional"))}</ProtectedRoute>} />
                  <Route path={ROUTES.segurancaConta} element={<ProtectedRoute allowedRoles={["admin"]}>{guard(<SegurancaConta />, "Segurança da Conta")}</ProtectedRoute>} />

                  <Route path={ROUTES.tratamentos} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(<Tratamentos />)}</ProtectedRoute>} />
                  <Route path={ROUTES.assistidos} element={<ProtectedRoute allowedRoles={["admin", "entrevistador"]}>{tenant(<Assistidos />)}</ProtectedRoute>} />
                  <Route path={ROUTES.consultaAssistido} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<ConsultaAssistido />, "Consulta do Assistido"))}</ProtectedRoute>} />
                  <Route path={ROUTES.migrarAssistido} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<MigrarAssistido />, "Migrar Assistido"))}</ProtectedRoute>} />
                  <Route path={ROUTES.homologacaoAgenda} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<HomologacaoAgenda />, "Homologação da Agenda"))}</ProtectedRoute>} />
                  <Route path={ROUTES.entrevistas} element={<ProtectedRoute allowedRoles={["admin", "entrevistador", "tarefeiro"]}>{tenant(<Entrevistas />)}</ProtectedRoute>} />
                  <Route path={ROUTES.fazerEntrevista} element={<ProtectedRoute allowedRoles={["admin", "entrevistador"]}>{tenant(guard(<FazerEntrevista />, "Fazer Entrevista"))}</ProtectedRoute>} />
                  <Route path={ROUTES.agenda} element={<ProtectedRoute allowedRoles={["admin", "entrevistador", "tarefeiro"]}>{tenant(guard(<Agenda />, "Agenda"))}</ProtectedRoute>} />
                  <Route path={ROUTES.avisosAusencia} element={<ProtectedRoute allowedRoles={["admin", "entrevistador", "tarefeiro", "coordenador_de_tratamento"]}>{tenant(guard(<AvisosAusencia />, "Avisos de Ausência"))}</ProtectedRoute>} />
                  <Route path={ROUTES.presenca} element={<ProtectedRoute allowedRoles={["admin", "tarefeiro"]}>{tenant(guard(<Presenca />, "Controle de Presença"))}</ProtectedRoute>} />
                  <Route path={ROUTES.meusTratamentos} element={<ProtectedRoute allowedRoles={["assistido"]}>{guard(<MeusTratamentos />, "Meus Tratamentos")}</ProtectedRoute>} />
                  <Route path={ROUTES.minhaAgenda} element={<ProtectedRoute allowedRoles={["assistido"]}>{guard(<MinhaAgenda />, "Minha Agenda")}</ProtectedRoute>} />
                  <Route path={ROUTES.meuPerfil} element={<ProtectedRoute allowedRoles={["assistido", "admin", "entrevistador", "tarefeiro", "coordenador_de_tratamento"]}><MeuPerfil /></ProtectedRoute>} />
                  <Route path={ROUTES.meusDocumentos} element={<ProtectedRoute allowedRoles={["assistido"]}>{guard(<MeusDocumentos />, "Meus Documentos")}</ProtectedRoute>} />
                  <Route path={ROUTES.notificacoes} element={<Notificacoes />} />
                  <Route path={ROUTES.ajuda} element={guard(<CentralAjuda />, "Central de Ajuda")} />
                  <Route path={ROUTES.centralNotificacoes} element={<ProtectedRoute allowedRoles={["admin", "coordenador_de_tratamento"]}>{tenant(guard(<CentralNotificacoes />, "Central de Notificações"))}</ProtectedRoute>} />
                  <Route path={ROUTES.observabilidade} element={<ProtectedRoute allowedRoles={["admin", "administrador_master", "coordenador_de_tratamento"]}>{tenant(guard(<Observabilidade />, "Observabilidade Operacional"))}</ProtectedRoute>} />
                  <Route path={ROUTES.listaEspera} element={<ProtectedRoute allowedRoles={["coordenador_de_tratamento"]}>{tenant(<CoordenadorListaEspera />)}</ProtectedRoute>} />
                  <Route path={ROUTES.coordenadorTratamentos} element={<ProtectedRoute allowedRoles={["coordenador_de_tratamento"]}>{tenant(<CoordenadorTratamentos />)}</ProtectedRoute>} />
                  <Route path={ROUTES.coordenadorAgenda} element={<ProtectedRoute allowedRoles={["coordenador_de_tratamento"]}>{tenant(<CoordenadorAgenda />)}</ProtectedRoute>} />
                  <Route path={ROUTES.relatorios} element={<ProtectedRoute allowedRoles={["admin", "entrevistador", "coordenador_de_tratamento", "tarefeiro"]}>{tenant(<Relatorios />)}</ProtectedRoute>} />
                  <Route path={ROUTES.configuracoes} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(<Configuracoes />)}</ProtectedRoute>} />
                  <Route path={ROUTES.gestaoCores} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(<GestaoCores />)}</ProtectedRoute>} />
                  <Route path={ROUTES.auditoria} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(<Auditoria />)}</ProtectedRoute>} />
                  <Route path={ROUTES.regras} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(<RegrasOperacionais />)}</ProtectedRoute>} />
                  <Route path={ROUTES.governancaParametros} element={<ProtectedRoute allowedRoles={["admin", "administrador_master"]}>{tenant(<GovernancaParametros />)}</ProtectedRoute>} />
                  <Route path={ROUTES.excecoes} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(<Excecoes />)}</ProtectedRoute>} />
                  <Route path={ROUTES.excecoesOperacionais} element={<ProtectedRoute allowedRoles={["admin", "coordenador_de_tratamento"]}>{tenant(guard(<ExcecoesOperacionais />, "Exceções Operacionais"))}</ProtectedRoute>} />
                  <Route path={ROUTES.programacaoPadrao} element={<ProtectedRoute allowedRoles={["admin", "coordenador_de_tratamento"]}>{tenant(guard(<ProgramacaoPadrao />, "Programação Padrão"))}</ProtectedRoute>} />
                  <Route path={ROUTES.instituicao} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(<Instituicao />)}</ProtectedRoute>} />
                  <Route path={ROUTES.centralIa} element={<ProtectedRoute allowedRoles={["admin", "entrevistador"]}>{tenant(<CentralIA />)}</ProtectedRoute>} />
                  <Route path={ROUTES.voluntarios} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<Voluntarios />, "Voluntários"))}</ProtectedRoute>} />
                  <Route path={ROUTES.funcoesVoluntariado} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(<FuncoesVoluntariado />)}</ProtectedRoute>} />
                  <Route path={ROUTES.sessoesPublicas} element={<ProtectedRoute allowedRoles={["admin", "tarefeiro"]}>{tenant(guard(<SessoesPublicas />, "Sessões Públicas"))}</ProtectedRoute>} />
                  <Route path={ROUTES.acaoSocial} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<AcaoSocial />, "Ação Social"))}</ProtectedRoute>} />
                  <Route path={ROUTES.campanhas} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<Campanhas />, "Campanhas"))}</ProtectedRoute>} />
                  <Route path={ROUTES.eventos} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<Eventos />, "Eventos"))}</ProtectedRoute>} />
                 <Route path={ROUTES.comunicacaoInstitucional} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<ComunicacaoInstitucional />, "Comunicação Institucional"))}</ProtectedRoute>} />
                 <Route path={ROUTES.painelInstitucional} element={<ProtectedRoute allowedRoles={["admin"]}>{tenant(guard(<PainelInstitucional />, "Painel Institucional"))}</ProtectedRoute>} />

                 {/* SaaS Portal / Hub (SAAS-03) — acessível a qualquer usuário autenticado, sem exigir tenant ativo. */}
                 <Route path={ROUTES.portal} element={guard(<Portal />, "Portal SaaS")} />
                 <Route path={ROUTES.portalInstituicoes} element={guard(<PortalInstituicoes />, "Portal · Instituições")} />
                 <Route path={ROUTES.portalModulos} element={guard(<PortalModulos />, "Portal · Módulos")} />
                 <Route path={ROUTES.portalAdmin} element={guard(<PortalAdmin />, "Portal · Administração")} />

                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeLoader>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
