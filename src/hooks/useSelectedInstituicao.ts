/**
 * SAAS-04 — Seleção de instituição ativa persistente entre sessões.
 *
 * Persiste em localStorage (chave `saas.portal.selectedInstituicaoId`) para
 * manter a instituição escolhida entre janelas/sessões do navegador. A
 * seleção é apenas hint de UI — a RLS no backend segue como fonte de verdade.
 *
 * Fail-closed:
 * - Se o id persistido não estiver na lista `allowedIds` (retornada pelo hub),
 *   a seleção é descartada automaticamente.
 * - `selectInstituicao` recusa qualquer id fora da lista permitida.
 * - Quando há exatamente 1 instituição permitida, seleciona automaticamente.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "saas.portal.selectedInstituicaoId";

function readInitial(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(id: string | null) {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export function useSelectedInstituicao(allowedIds: string[]) {
  const [selectedId, setSelectedIdState] = useState<string | null>(readInitial);

  // Fail-closed: descarta seleção que não está mais permitida.
  useEffect(() => {
    if (selectedId && !allowedIds.includes(selectedId)) {
      setSelectedIdState(null);
      writeStorage(null);
    }
  }, [allowedIds, selectedId]);

  // Auto-seleciona quando há exatamente uma instituição permitida.
  useEffect(() => {
    if (!selectedId && allowedIds.length === 1) {
      const only = allowedIds[0];
      setSelectedIdState(only);
      writeStorage(only);
    }
  }, [allowedIds, selectedId]);

  // Sincroniza entre abas: outra aba mudou a seleção → reflete aqui.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue;
      if (next && !allowedIds.includes(next)) return; // ignora se não permitida
      setSelectedIdState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [allowedIds]);

  const selectInstituicao = useCallback(
    (id: string | null) => {
      if (id && !allowedIds.includes(id)) return false;
      setSelectedIdState(id);
      writeStorage(id);
      return true;
    },
    [allowedIds],
  );

  return { selectedInstituicaoId: selectedId, selectInstituicao };
}

export const SAAS_PORTAL_STORAGE_KEY = STORAGE_KEY;
