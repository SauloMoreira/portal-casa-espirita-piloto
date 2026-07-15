/**
 * SAAS-04 — Contexto global de instituição ativa.
 *
 * Consolida `usePortalHub` + `useSelectedInstituicao` em um único provider
 * consumido pelo AppLayout. Todas as páginas do Portal e futuros módulos
 * SaaS devem ler o tenant ativo daqui em vez de instanciar os hooks.
 *
 * IMPORTANTE:
 * - O contexto é apenas hint de UI. RLS no backend continua fonte de verdade.
 * - `selecionada` só é preenchida com instituições cujo `vinculo_status` é
 *   `ativo` (fail-closed vem do useSelectedInstituicao/allowedIds).
 */
import React, { createContext, useContext, useEffect, useMemo } from "react";
import {
  usePortalHub,
  type PortalInstituicaoView,
} from "@/hooks/usePortalHub";
import { useSelectedInstituicao } from "@/hooks/useSelectedInstituicao";
import { _setCurrentInstituicaoId } from "@/lib/tenant/currentTenant";

interface InstituicaoContextValue {
  isLoading: boolean;
  isError: boolean;
  isPlatformAdmin: boolean;
  instituicoes: PortalInstituicaoView[];
  allowedIds: string[];
  selectedInstituicaoId: string | null;
  selecionada: PortalInstituicaoView | null;
  selectInstituicao: (id: string | null) => boolean;
}

const InstituicaoContext = createContext<InstituicaoContextValue | undefined>(
  undefined,
);

export const InstituicaoProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isLoading, isError, isPlatformAdmin, instituicoes } = usePortalHub();

  const allowedIds = useMemo(
    () =>
      instituicoes
        .filter((i) => i.vinculo_status === "ativo")
        .map((i) => i.id),
    [instituicoes],
  );

  const { selectedInstituicaoId, selectInstituicao } =
    useSelectedInstituicao(allowedIds, {
      // SAAS-06-C1-FIX17 — platform_admin nunca entra em tenant automaticamente:
      // sem restauração de sessão anterior nem auto-select de único vínculo.
      autoRestore: !isPlatformAdmin,
      autoSelectSingle: !isPlatformAdmin,
      isLoading,
    });

  const selecionada = useMemo(
    () =>
      instituicoes.find((i) => i.id === selectedInstituicaoId) ?? null,
    [instituicoes, selectedInstituicaoId],
  );

  // SAAS-05-D — Espelha o tenant ativo no módulo `currentTenant` para que
  // services/hooks possam falhar fechado sem ler localStorage por fora.
  // Atualiza o espelho sempre que a instituição selecionada realmente mudar.
  // Sem cleanup aqui de propósito: usar cleanup ligado a essa dependência
  // criaria uma janela momentânea com o valor zerado a cada nova execução,
  // mesmo quando o valor final é o mesmo de antes — isso já causou falhas
  // intermitentes reais em requireInstituicaoId() (ex: tela de Entrevistas).
  useEffect(() => {
    _setCurrentInstituicaoId(selecionada?.id ?? null);
  }, [selecionada?.id]);

  // Só zera o espelho quando o provider desmonta de verdade (logout, navegação
  // pra fora da área autenticada) — nunca por causa de uma dependência mudar.
  useEffect(() => {
    return () => {
      _setCurrentInstituicaoId(null);
    };
  }, []);



  const value = useMemo<InstituicaoContextValue>(
    () => ({
      isLoading,
      isError,
      isPlatformAdmin,
      instituicoes,
      allowedIds,
      selectedInstituicaoId,
      selecionada,
      selectInstituicao,
    }),
    [
      isLoading,
      isError,
      isPlatformAdmin,
      instituicoes,
      allowedIds,
      selectedInstituicaoId,
      selecionada,
      selectInstituicao,
    ],
  );

  return (
    <InstituicaoContext.Provider value={value}>
      {children}
    </InstituicaoContext.Provider>
  );
};

export function useInstituicaoAtiva(): InstituicaoContextValue {
  const ctx = useContext(InstituicaoContext);
  if (!ctx) {
    throw new Error(
      "useInstituicaoAtiva deve ser usado dentro de <InstituicaoProvider>",
    );
  }
  return ctx;
}
