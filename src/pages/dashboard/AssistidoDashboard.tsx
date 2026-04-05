import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Calendar, CheckCircle, Clock } from "lucide-react";

export default function AssistidoDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Meu Painel</h1>
        <p className="text-sm text-muted-foreground mt-1">Seus tratamentos e agenda</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tratamentos Ativos" value={0} icon={Heart} />
        <StatCard title="Sessões Realizadas" value={0} icon={CheckCircle} />
        <StatCard title="Sessões Faltantes" value={0} icon={Clock} />
        <StatCard title="Próximo Atendimento" value="—" icon={Calendar} />
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Meus Tratamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Heart className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">Você ainda não possui tratamentos designados</p>
            <p className="text-xs mt-1">Após sua entrevista fraterna, seus tratamentos aparecerão aqui</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
