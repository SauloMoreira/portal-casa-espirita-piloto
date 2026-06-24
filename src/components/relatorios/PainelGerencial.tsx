import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/StatCard";
import { CheckCircle, Activity, Users, Calendar, CalendarX, Trophy } from "lucide-react";
import { classificarPresenca } from "@/lib/presencaClassificacao";

interface Stats {
  concluidos: number;
  emAndamento: number;
  assistidosAtivos: number;
  sessoesRealizadas: number;
  faltas: number;
  maiorCarga: string;
}

export default function PainelGerencial() {
  const [stats, setStats] = useState<Stats>({ concluidos: 0, emAndamento: 0, assistidosAtivos: 0, sessoesRealizadas: 0, faltas: 0, maiorCarga: "—" });
  const { role, user } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      const now = new Date();
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const fim = now.toISOString().split("T")[0];

      // Get tipos_tratamento for coordinator filtering
      let tratFilter: string[] | null = null;
      if (role === "coordenador_de_tratamento" && user?.id) {
        const { data: myTrats } = await supabase.from("tipos_tratamento").select("id").eq("coordenador_responsavel_id", user.id);
        tratFilter = (myTrats || []).map((t) => t.id);
        if (tratFilter.length === 0) { setStats({ concluidos: 0, emAndamento: 0, assistidosAtivos: 0, sessoesRealizadas: 0, faltas: 0, maiorCarga: "—" }); return; }
      }

      // Fetch vinculos
      let vQ = supabase.from("assistido_tratamentos").select("status, tratamento_id, assistido_id");
      if (tratFilter) vQ = vQ.in("tratamento_id", tratFilter);
      vQ = vQ.limit(5000);
      const { data: vinculos } = await vQ;

      let concluidos = 0, emAndamento = 0;
      const assistidosSet = new Set<string>();
      (vinculos || []).forEach((v: any) => {
        if (v.status === "concluido") concluidos++;
        if (v.status === "em_andamento") { emAndamento++; assistidosSet.add(v.assistido_id); }
      });

      // Presences this month
      let pQ = supabase.from("presencas_tratamentos").select("status_presenca, assistido_tratamento:assistido_tratamentos(tratamento_id)").gte("data", inicio).lte("data", fim).limit(10000);
      const { data: presencas } = await pQ;

      let sessoesRealizadas = 0, faltas = 0;
      (presencas || []).forEach((p: any) => {
        const tid = p.assistido_tratamento?.tratamento_id;
        if (tratFilter && tid && !tratFilter.includes(tid)) return;
        // Fonte única (L-03): justificado é só histórico, não conta presença nem falta.
        const cls = classificarPresenca(p.status_presenca);
        if (cls.contaPresenca) sessoesRealizadas++;
        else if (cls.contaAusencia) faltas++;
      });

      // Maior carga (tarefeiro with most sessions this month)
      let maiorCarga = "—";
      const { data: tipos } = await supabase.from("tipos_tratamento").select("id, tarefeiro_id").not("tarefeiro_id", "is", null);
      if (tipos && tipos.length > 0) {
        const relevantTipos = tratFilter ? tipos.filter((t) => tratFilter!.includes(t.id)) : tipos;
        const { data: sessoes } = await supabase.from("agenda_tratamentos_assistido").select("tratamento_id").in("tratamento_id", relevantTipos.map((t) => t.id)).gte("data_sessao", inicio).lte("data_sessao", fim);

        const cargaMap = new Map<string, number>();
        (sessoes || []).forEach((s) => {
          const tipo = relevantTipos.find((t) => t.id === s.tratamento_id);
          if (tipo?.tarefeiro_id) cargaMap.set(tipo.tarefeiro_id, (cargaMap.get(tipo.tarefeiro_id) || 0) + 1);
        });

        if (cargaMap.size > 0) {
          const topId = [...cargaMap.entries()].sort((a, b) => b[1] - a[1])[0][0];
          const { data: profs } = await supabase.rpc("staff_names", { _ids: [topId] });
          maiorCarga = profs?.[0]?.nome_completo?.split(" ")[0] || "—";
        }
      }

      setStats({ concluidos, emAndamento, assistidosAtivos: assistidosSet.size, sessoesRealizadas, faltas, maiorCarga });
    };
    fetchStats();
  }, [role, user]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      <StatCard title="Concluídos (Mês)" value={stats.concluidos} icon={CheckCircle} />
      <StatCard title="Em Andamento" value={stats.emAndamento} icon={Activity} />
      <StatCard title="Assistidos Ativos" value={stats.assistidosAtivos} icon={Users} />
      <StatCard title="Sessões (Mês)" value={stats.sessoesRealizadas} icon={Calendar} />
      <StatCard title="Faltas (Mês)" value={stats.faltas} icon={CalendarX} />
      <StatCard title="Maior Carga" value={stats.maiorCarga} icon={Trophy} />
    </div>
  );
}
