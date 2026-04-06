import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Aviso {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  lido: boolean;
  lido_em: string | null;
  link: string | null;
  created_at: string;
}

export function useAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchAvisos = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("avisos_internos")
      .select("id, tipo, titulo, mensagem, lido, lido_em, link, created_at")
      .eq("destinatario_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setAvisos((data as Aviso[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAvisos();
  }, [fetchAvisos]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channelName = "avisos-" + user.id + "-" + Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "avisos_internos",
        filter: `destinatario_id=eq.${user.id}`,
      }, (payload) => {
        const novo = payload.new as Aviso;
        setAvisos((prev) => [novo, ...prev]);
        // Dispatch custom event for toast notification
        window.dispatchEvent(new CustomEvent("aviso-novo", { detail: novo }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const naoLidos = avisos.filter((a) => !a.lido).length;

  const marcarComoLido = async (id: string) => {
    await supabase
      .from("avisos_internos")
      .update({ lido: true, lido_em: new Date().toISOString() })
      .eq("id", id);
    setAvisos((prev) => prev.map((a) => a.id === id ? { ...a, lido: true, lido_em: new Date().toISOString() } : a));
  };

  const marcarTodosComoLidos = async () => {
    if (!user) return;
    const ids = avisos.filter((a) => !a.lido).map((a) => a.id);
    if (ids.length === 0) return;
    await supabase
      .from("avisos_internos")
      .update({ lido: true, lido_em: new Date().toISOString() })
      .in("id", ids);
    setAvisos((prev) => prev.map((a) => ({ ...a, lido: true, lido_em: new Date().toISOString() })));
  };

  return { avisos, naoLidos, loading, marcarComoLido, marcarTodosComoLidos, refetch: fetchAvisos };
}
