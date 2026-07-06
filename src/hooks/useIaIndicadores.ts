import { useState, useEffect, useCallback } from "react";
import { fetchIndicadoresIA, type IndicadoresFiltro } from "@/services/ia/indicadores";
import type { IaIndicadores } from "@/types/ia";

const EMPTY: IaIndicadores = {
  totalSugestoes: 0,
  avaliadas: 0,
  pendentes: 0,
  pendentesAntigas: 0,
  baseAderencia: 0,
  motivosPreenchidos: 0,
  aderenciaTotal: 0,
  aderenciaParcial: 0,
  divergencia: 0,
  inconclusiva: 0,
  semUso: 0,
  taxaAderenciaTotal: 0,
  taxaAderenciaParcial: 0,
  taxaDivergencia: 0,
  tratamentosMaisSugeridos: [],
  tratamentosMaisAtribuidos: [],
  queixasMaiorAcerto: [],
  queixasMaiorDivergencia: [],
  evolucao: [],
};

export function useIaIndicadores(filtro: IndicadoresFiltro = {}) {
  const [data, setData] = useState<IaIndicadores>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { inicio, fim } = filtro;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchIndicadoresIA({ inicio, fim }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar indicadores");
    } finally {
      setLoading(false);
    }
  }, [inicio, fim]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
