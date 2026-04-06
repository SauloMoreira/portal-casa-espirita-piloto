import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ArrowLeft, Users, CalendarCheck, ClipboardList, CheckCircle, CalendarX, Briefcase } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AssistidosPorTratamento from "@/components/relatorios/AssistidosPorTratamento";
import FrequenciaPresenca from "@/components/relatorios/FrequenciaPresenca";
import EntrevistasRealizadas from "@/components/relatorios/EntrevistasRealizadas";
import TratamentosConcluidos from "@/components/relatorios/TratamentosConcluidos";
import FaltasPorPeriodo from "@/components/relatorios/FaltasPorPeriodo";
import CargaPorTarefeiro from "@/components/relatorios/CargaPorTarefeiro";
import PainelGerencial from "@/components/relatorios/PainelGerencial";

const REPORTS = [
  { key: "assistidos", title: "Assistidos por Tratamento", icon: Users, desc: "Vínculos e status dos assistidos por tratamento" },
  { key: "frequencia", title: "Frequência de Presença", icon: CalendarCheck, desc: "Presenças e ausências por assistido e tratamento" },
  { key: "entrevistas", title: "Entrevistas Realizadas", icon: ClipboardList, desc: "Entrevistas concluídas e tratamentos atribuídos" },
  { key: "concluidos", title: "Tratamentos Concluídos", icon: CheckCircle, desc: "Tratamentos finalizados no período" },
  { key: "faltas", title: "Faltas por Período", icon: CalendarX, desc: "Ausências detalhadas por assistido" },
  { key: "carga", title: "Carga por Tarefeiro", icon: Briefcase, desc: "Volume de trabalho por tarefeiro" },
] as const;

type ReportKey = typeof REPORTS[number]["key"];

const COMPONENTS: Record<ReportKey, React.FC> = {
  assistidos: AssistidosPorTratamento,
  frequencia: FrequenciaPresenca,
  entrevistas: EntrevistasRealizadas,
  concluidos: TratamentosConcluidos,
  faltas: FaltasPorPeriodo,
  carga: CargaPorTarefeiro,
};

export default function Relatorios() {
  const [active, setActive] = useState<ReportKey | null>(null);
  const { role } = useAuth();

  // Gerencial reports restricted to admin and coordenador
  const showGerencial = role === "admin" || role === "coordenador_de_tratamento";

  if (active) {
    const report = REPORTS.find((r) => r.key === active)!;
    const Component = COMPONENTS[active];
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setActive(null)} className="gap-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{report.title}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{report.desc}</p>
          </div>
        </div>
        <Component />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground mt-1">Relatórios operacionais e gerenciais</p>
      </div>

      {showGerencial && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Painel Gerencial — Mês Atual</h2>
          <PainelGerencial />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
          <Card key={r.key} className="glass-card hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setActive(r.key)}>
            <CardContent className="py-6 flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2.5 group-hover:bg-primary/15 transition-colors">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>
    </div>
  );
}
