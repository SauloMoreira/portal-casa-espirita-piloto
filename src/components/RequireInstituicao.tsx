/**
 * SAAS-05-D — Guard de rotas operacionais.
 *
 * Exige instituição ativa selecionada no `InstituicaoContext`. Falha fechado:
 * - Sem contexto → erro do próprio hook (bug de composição).
 * - Sem instituição ativa e sem opções → redireciona para o Portal.
 * - Com opções mas sem seleção → redireciona para o Portal para o usuário
 *   escolher (o próprio Portal já auto-seleciona quando há apenas uma).
 *
 * O guard é apenas hint de UI: a RLS legada e as policies shadow do backend
 * seguem como fonte de verdade (SAAS-05-C/05-F).
 */
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { ROUTES } from "@/constants";

interface RequireInstituicaoProps {
  children: React.ReactNode;
  /** Rota de destino quando não há tenant ativo. Default: Portal. */
  fallback?: string;
}

export function RequireInstituicao({
  children,
  fallback = ROUTES.portal,
}: RequireInstituicaoProps) {
  const { isLoading, selecionada } = useInstituicaoAtiva();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-[40vh] w-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!selecionada) {
    return (
      <Navigate
        to={fallback}
        replace
        state={{ from: location.pathname, reason: "instituicao_ausente" }}
      />
    );
  }

  return <>{children}</>;
}
