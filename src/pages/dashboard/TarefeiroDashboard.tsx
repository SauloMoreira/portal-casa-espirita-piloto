import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, Users, Heart, Clock } from "lucide-react";

export default function TarefeiroDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Painel do Tarefeiro</h1>
        <p className="text-sm text-muted-foreground mt-1">Tratamentos e presenças do dia</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tratamentos Hoje" value={0} icon={Heart} />
        <StatCard title="Assistidos Esperados" value={0} icon={Users} />
        <StatCard title="Presenças Pendentes" value={0} icon={Clock} />
        <StatCard title="Presenças Registradas" value={0} icon={ClipboardCheck} />
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Tratamentos do Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Heart className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Nenhum tratamento agendado para hoje</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
