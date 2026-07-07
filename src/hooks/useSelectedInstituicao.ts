/**
 * SAAS-03 — Seleção de instituição ativa (Portal/Hub).
 *
 * Persiste a seleção do usuário em sessionStorage. A seleção é apenas hint
 * de UI: RLS no backend continua sendo a fonte de verdade. Se o id não
 * corresponder a uma instituição permitida (retornada pela query), o hook
 * limpa a seleção automaticamente (fail-closed).
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "saas.portal.selectedInstituicaoId";

function readInitial(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useSelectedInstituicao(allowedIds: string[]) {
  const [selectedId, setSelectedIdState] = useState<string | null>(readInitial);

  // Limpa seleção inválida assim que a lista permitida muda.
  useEffect(() => {
    if (selectedId && !allowedIds.includes(selectedId)) {
      setSelectedIdState(null);
      try {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
    }
  }, [allowedIds, selectedId]);

  // Auto-seleciona quando há exatamente uma instituição permitida.
  useEffect(() => {
    if (!selectedId && allowedIds.length === 1) {
      const only = allowedIds[0];
      setSelectedIdState(only);
      try {
        window.sessionStorage.setItem(STORAGE_KEY, only);
      } catch {
        /* noop */
      }
    }
  }, [allowedIds, selectedId]);

  const selectInstituicao = useCallback(
    (id: string | null) => {
      // Nunca permite selecionar um id fora da lista permitida.
      if (id && !allowedIds.includes(id)) return false;
      setSelectedIdState(id);
      try {
        if (id) window.sessionStorage.setItem(STORAGE_KEY, id);
        else window.sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* noop */
      }
      return true;
    },
    [allowedIds],
  );

  return { selectedInstituicaoId: selectedId, selectInstituicao };
}

export const SAAS_PORTAL_STORAGE_KEY = STORAGE_KEY;
