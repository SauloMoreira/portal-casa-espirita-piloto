/**
 * SAAS-05-D — Queries diretas à tabela T-DIR `avisos_internos` são escopadas
 * pela instituição ativa via `getCurrentInstituicaoId()`. Quando não houver
 * tenant ativo, o hook simplesmente não carrega nada (fail-closed silencioso,
 * apropriado para um bell que roda em toda tela protegida).
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";

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
  const { selecionada } = useInstituicaoAtiva();
  const instituicaoId = selecionada?.id ?? null;

  const fetchAvisos = useCallback(async () => {
    if (!user) return;
    if (!instituicaoId) {
      // Sem tenant ativo: fail-closed (mostra vazio).
      setAvisos([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("avisos_internos")
      .select("id, tipo, titulo, mensagem, lido, lido_em, link, created_at")
      .eq("destinatario_id", user.id)
      .eq("instituicao_id", instituicaoId)
      .order("created_at", { ascending: false })
      .limit(50);
    setAvisos((data as Aviso[]) || []);
    setLoading(false);
  }, [user, instituicaoId]);

  useEffect(() => {
    fetchAvisos();
  }, [fetchAvisos]);

  // Realtime
  useEffect(() => {
    if (!user || !instituicaoId) return;
    const channelName = "avisos-" + user.id + "-" + instituicaoId + "-" + Math.random().toString(36).slice(2, 8);
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "avisos_internos",
        filter: `destinatario_id=eq.${user.id}`,
      }, (payload) => {
        const novo = payload.new as Aviso & { instituicao_id?: string | null };
        // Descarta avisos de outro tenant (fail-closed cliente).
        if (novo.instituicao_id && novo.instituicao_id !== instituicaoId) return;
        setAvisos((prev) => [novo, ...prev]);
        // Dispatch custom event for toast notification
        window.dispatchEvent(new CustomEvent("aviso-novo", { detail: novo }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, instituicaoId]);

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
