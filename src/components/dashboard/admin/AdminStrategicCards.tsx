import { StatCard } from "@/components/StatCard";
import {
  TrendingUp, TrendingDown, Briefcase, BookOpen, CalendarX, Clock, UserCheck, Activity,
} from "lucide-react";
import type {
  DashboardCargaTarefeiro,
  DashboardGraficoSerie,
  DashboardTratamentoTipo,
} from "@/types/adminDashboard";

interface Props {
  topTrat?: DashboardTratamentoTipo;
  bottomTrat?: DashboardTratamentoTipo;
  topTarefeiro?: DashboardCargaTarefeiro;
  publicoPalestras: number;
  faltasMes: number;
  aguardandoAgend: number;
  topAge: DashboardGraficoSerie;
  bottomAge: DashboardGraficoSerie;
  onOpenAguardando: () => void;
}

export function AdminStrategicCards({
  topTrat,
  bottomTrat,
  topTarefeiro,
  publicoPalestras,
  faltasMes,
  aguardandoAgend,
  topAge,
  bottomAge,
  onOpenAguardando,
}: Props) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Maior Tratamento" value={topTrat?.nome || "—"} subtitle={`${topTrat?.count || 0} assistidos`} icon={TrendingUp} />
        <StatCard title="Menor Tratamento" value={bottomTrat?.nome || "—"} subtitle={`${bottomTrat?.count || 0} assistidos`} icon={TrendingDown} />
        <StatCard title="Maior Carga" value={topTarefeiro?.nome?.split(" ")[0] || "—"} subtitle={`${topTarefeiro?.total || 0} vínculos`} icon={Briefcase} />
        <StatCard title="Palestras" value={publicoPalestras} subtitle="Presenças no período" icon={BookOpen} />
        <StatCard title="Faltas" value={faltasMes} subtitle="No período" icon={CalendarX} />
        <div className="cursor-pointer" onClick={onOpenAguardando}>
          <StatCard title="Aguardando Agend." value={aguardandoAgend} subtitle="Ver detalhes ›" icon={Clock} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title="Faixa Mais Presente" value={topAge.name} subtitle={`${topAge.value} assistidos`} icon={UserCheck} />
        <StatCard title="Faixa Menos Presente" value={bottomAge.name === "—" ? "—" : bottomAge.name} subtitle={`${bottomAge.value === Infinity ? 0 : bottomAge.value} assistidos`} icon={Activity} />
      </div>
    </>
  );
}
