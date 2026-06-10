import { useCallback, useEffect, useState } from "react";
import { sessoesPublicasService } from "@/services";

/**
 * Domain hook for public sessions. Wraps the service layer so UI components
 * stay free of raw queries. Returns open sessions for a given date (today by
 * default) plus a manual refresh.
 */
export function useSessoesPublicas(data?: string) {
  const [sessoes, setSessoes] = useState<
    Awaited<ReturnType<typeof sessoesPublicasService.listSessoesAbertas>>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await sessoesPublicasService.listSessoesAbertas(data);
      setSessoes(rows);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessoes, loading, error, refresh };
}
