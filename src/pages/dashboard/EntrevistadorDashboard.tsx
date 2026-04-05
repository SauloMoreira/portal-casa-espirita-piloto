import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, BookOpen, UserCheck, Clock } from "lucide-react";

export default function EntrevistadorDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Painel do Entrevistador</h1>
        <p className="text-sm text-muted-foreground mt-1">Suas entrevistas e atendimentos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Entrevistas Hoje" value={0} icon={Calendar} />
        <StatCard title="Agendadas" value={0} subtitle="Pendentes" icon={Clock} />
        <StatCard title="Concluídas" value={0} subtitle="Este mês" icon={BookOpen} />
        <StatCard title="Assistidos Encaminhados" value={0} icon={UserCheck} />
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Entrevistas do Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Calendar className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Nenhuma entrevista agendada para hoje</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
