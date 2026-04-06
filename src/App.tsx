import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";

import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Usuarios from "./pages/Usuarios";
import Tratamentos from "./pages/Tratamentos";
import Assistidos from "./pages/Assistidos";
import Entrevistas from "./pages/Entrevistas";
import FazerEntrevista from "./pages/FazerEntrevista";
import Agenda from "./pages/Agenda";
import Presenca from "./pages/Presenca";
import MeusTratamentos from "./pages/MeusTratamentos";
import MinhaAgenda from "./pages/MinhaAgenda";
import MeuPerfil from "./pages/MeuPerfil";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import Auditoria from "./pages/Auditoria";
import RegrasOperacionais from "./pages/RegrasOperacionais";
import Excecoes from "./pages/Excecoes";
import Instituicao from "./pages/Instituicao";
import CoordenadorListaEspera from "./pages/CoordenadorListaEspera";
import CoordenadorTratamentos from "./pages/CoordenadorTratamentos";
import CoordenadorAgenda from "./pages/CoordenadorAgenda";
import Notificacoes from "./pages/Notificacoes";
import MeusDocumentos from "./pages/MeusDocumentos";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/usuarios" element={<ProtectedRoute allowedRoles={["admin"]}><Usuarios /></ProtectedRoute>} />
              <Route path="/tratamentos" element={<ProtectedRoute allowedRoles={["admin"]}><Tratamentos /></ProtectedRoute>} />
              <Route path="/assistidos" element={<ProtectedRoute allowedRoles={["admin", "entrevistador"]}><Assistidos /></ProtectedRoute>} />
              <Route path="/entrevistas" element={<ProtectedRoute allowedRoles={["admin", "entrevistador"]}><Entrevistas /></ProtectedRoute>} />
              <Route path="/fazer-entrevista" element={<ProtectedRoute allowedRoles={["admin", "entrevistador"]}><FazerEntrevista /></ProtectedRoute>} />
              <Route path="/agenda" element={<ProtectedRoute allowedRoles={["admin", "entrevistador"]}><Agenda /></ProtectedRoute>} />
              <Route path="/presenca" element={<ProtectedRoute allowedRoles={["admin", "tarefeiro"]}><Presenca /></ProtectedRoute>} />
              <Route path="/meus-tratamentos" element={<ProtectedRoute allowedRoles={["assistido"]}><MeusTratamentos /></ProtectedRoute>} />
              <Route path="/minha-agenda" element={<ProtectedRoute allowedRoles={["assistido"]}><MinhaAgenda /></ProtectedRoute>} />
              <Route path="/meu-perfil" element={<ProtectedRoute allowedRoles={["assistido"]}><MeuPerfil /></ProtectedRoute>} />
              <Route path="/meus-documentos" element={<ProtectedRoute allowedRoles={["assistido"]}><MeusDocumentos /></ProtectedRoute>} />
              <Route path="/notificacoes" element={<Notificacoes />} />
              <Route path="/lista-espera" element={<ProtectedRoute allowedRoles={["coordenador_de_tratamento"]}><CoordenadorListaEspera /></ProtectedRoute>} />
              <Route path="/coordenador-tratamentos" element={<ProtectedRoute allowedRoles={["coordenador_de_tratamento"]}><CoordenadorTratamentos /></ProtectedRoute>} />
              <Route path="/coordenador-agenda" element={<ProtectedRoute allowedRoles={["coordenador_de_tratamento"]}><CoordenadorAgenda /></ProtectedRoute>} />
              <Route path="/relatorios" element={<ProtectedRoute allowedRoles={["admin", "entrevistador", "coordenador_de_tratamento", "tarefeiro"]}><Relatorios /></ProtectedRoute>} />
              <Route path="/configuracoes" element={<ProtectedRoute allowedRoles={["admin"]}><Configuracoes /></ProtectedRoute>} />
              <Route path="/auditoria" element={<ProtectedRoute allowedRoles={["admin"]}><Auditoria /></ProtectedRoute>} />
              <Route path="/regras" element={<ProtectedRoute allowedRoles={["admin"]}><RegrasOperacionais /></ProtectedRoute>} />
              <Route path="/excecoes" element={<ProtectedRoute allowedRoles={["admin"]}><Excecoes /></ProtectedRoute>} />
              <Route path="/instituicao" element={<ProtectedRoute allowedRoles={["admin"]}><Instituicao /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
