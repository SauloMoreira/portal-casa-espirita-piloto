/**
 * P1.2 — Hook de observabilidade operacional.
 *
 * Gerencia o seletor de janela (24h / 7d / 30d, default 7d) e busca o payload
 * consolidado via React Query. Leitura pura — nenhum efeito colateral.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { carregarObservabilidade } from "@/services/observabilidade/observabilidadeService";
import {
  JANELA_PADRAO,
  type JanelaObservabilidade,
} from "@/lib/observabilidade";

export function useObservabilidade() {
  const [janela, setJanela] = useState<JanelaObservabilidade>(JANELA_PADRAO);

  const query = useQuery({
    queryKey: ["observabilidade", janela],
    queryFn: () => carregarObservabilidade(janela),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    janela,
    setJanela,
    data: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
