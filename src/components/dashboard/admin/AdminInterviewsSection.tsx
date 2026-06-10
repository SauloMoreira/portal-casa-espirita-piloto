import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Briefcase } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { DashboardCargaTarefeiro, EntrevistasPorTipo } from "@/types/adminDashboard";

interface Props {
  entrevistasPorTipo: EntrevistasPorTipo;
  cargaTarefeiros: DashboardCargaTarefeiro[];
}

const Metric = ({ value, label }: { value: number; label: string }) => (
  <div className="rounded-lg bg-secondary/50 p-3 text-center">
    <p className="text-xl font-bold text-foreground">{value}</p>
    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
  </div>
);

export function AdminInterviewsSection({ entrevistasPorTipo, cargaTarefeiros }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Entrevistas no Período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric value={entrevistasPorTipo.total} label="Total" />
            <Metric value={entrevistasPorTipo.regulares} label="Regulares" />
            <Metric value={entrevistasPorTipo.livres} label="Livres" />
            <Metric value={entrevistasPorTipo.realizadas} label="Realizadas" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Carga por Tarefeiro
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cargaTarefeiros.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={cargaTarefeiros.slice(0, 6)}>
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" name="Vínculos" radius={[4, 4, 0, 0]} fill="hsl(174,42%,35%)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados de carga</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
