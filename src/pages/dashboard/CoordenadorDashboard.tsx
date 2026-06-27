import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { ClipboardCheck, Heart, Calendar, Users } from "lucide-react";
import { contarListaEspera } from "@/services/coordenacao/listaEspera";
import { getTratamentosCoordenados } from "@/services/coordenacao/escopo";

export default function CoordenadorDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ espera: 0, andamento: 0, agendados: 0 });

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      // Get treatments coordinated by this user (coordenação N:N)
      const tratIds = await getTratamentosCoordenados(user.id);

      if (tratIds.length === 0) {
        setStats({ espera: 0, andamento: 0, agendados: 0 });
        return;
      }

      // Lista de Espera usa a MESMA regra/serviço da página (sem divergência).
      const espera = await contarListaEspera(user.id);

      const { count: andamento } = await supabase
        .from("assistido_tratamentos")
        .select("id", { count: "exact", head: true })
        .in("tratamento_id", tratIds)
        .in("status", ["em_andamento", "aguardando_inicio"]);

      const today = new Date().toISOString().split("T")[0];
      const { count: agendados } = await supabase
        .from("agenda_tratamentos_assistido")
        .select("id", { count: "exact", head: true })
        .in("tratamento_id", tratIds)
        .eq("status", "agendado")
        .gte("data_sessao", today);

      setStats({
        espera: espera || 0,
        andamento: andamento || 0,
        agendados: agendados || 0,
      });
    };
    fetch();
  }, [user]);


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Painel do Coordenador</h1>
        <p className="text-sm text-muted-foreground mt-1">Acompanhe os tratamentos sob sua coordenação</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Lista de Espera" value={stats.espera} icon={ClipboardCheck} />
        <StatCard title="Em Andamento" value={stats.andamento} icon={Heart} />
        <StatCard title="Sessões Agendadas" value={stats.agendados} icon={Calendar} />
      </div>
    </div>
  );
}
