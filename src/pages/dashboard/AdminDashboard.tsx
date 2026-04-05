import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Heart, Calendar, ClipboardCheck, BookOpen, UserCheck } from "lucide-react";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Painel Administrativo</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão geral do sistema</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <StatCard title="Assistidos" value={0} subtitle="Cadastrados" icon={Users} />
        <StatCard title="Tratamentos Ativos" value={0} subtitle="Em andamento" icon={Heart} />
        <StatCard title="Entrevistas Agendadas" value={0} subtitle="Pendentes" icon={Calendar} />
        <StatCard title="Presenças Hoje" value={0} subtitle="Registradas" icon={ClipboardCheck} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Entrevistas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <BookOpen className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhuma entrevista registrada ainda</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              Tratamentos em Andamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Heart className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhum tratamento em andamento</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
