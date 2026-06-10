import { useCallback, useEffect, useState } from "react";
import { agendaService } from "@/services";

/**
 * Domain hook for an assistido's real treatment agenda. The real agenda
 * (agenda_tratamentos_assistido) is the single source of truth — this hook
 * never derives sessions from theoretical treatment rules.
 */
export function useAgendaTratamentos(assistidoId: string | null | undefined) {
  const [sessoes, setSessoes] = useState<
    Awaited<ReturnType<typeof agendaService.listSessoesDoAssistido>>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!assistidoId) return;
    setLoading(true);
    try {
      const rows = await agendaService.listSessoesDoAssistido(assistidoId);
      setSessoes(rows);
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, [assistidoId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessoes, loading, error, refresh };
}
