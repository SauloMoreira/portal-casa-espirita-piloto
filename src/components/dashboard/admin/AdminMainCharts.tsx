import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, ClipboardCheck, PieChart as PieChartIcon, Target } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, CartesianGrid, AreaChart, Area,
} from "recharts";
import { CHART_COLORS } from "@/constants/dashboard";
import type {
  DashboardGraficoSerie,
  DashboardPresencaSerie,
  DashboardTratamentoTipo,
} from "@/types/adminDashboard";

interface Props {
  tratPorTipo: DashboardTratamentoTipo[];
  presenceChart: DashboardPresencaSerie[];
  ageData: DashboardGraficoSerie[];
  funnel: DashboardGraficoSerie[];
}

const Empty = () => (
  <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
);

export function AdminMainCharts({ tratPorTipo, presenceChart, ageData, funnel }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" /> Assistidos por Tratamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tratPorTipo.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={tratPorTipo.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="nome" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip />
                <Bar dataKey="count" name="Assistidos" radius={[0, 4, 4, 0]}>
                  {tratPorTipo.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" /> Presença × Ausência
          </CardTitle>
        </CardHeader>
        <CardContent>
          {presenceChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={presenceChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(150,12%,90%)" />
                <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="Presenças" stackId="1" stroke="hsl(152,55%,42%)" fill="hsl(152,55%,42%)" fillOpacity={0.4} />
                <Area type="monotone" dataKey="Ausências" stackId="1" stroke="hsl(0,72%,51%)" fill="hsl(0,72%,51%)" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-primary" /> Assistidos por Faixa Etária
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={ageData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                  {ageData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Funil Operacional
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 py-2">
            {funnel.map((step, i) => {
              const maxVal = Math.max(...funnel.map((f) => f.value), 1);
              const pct = (step.value / maxVal) * 100;
              return (
                <div key={step.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{step.name}</span>
                    <span className="font-bold text-foreground">{step.value}</span>
                  </div>
                  <div className="h-3 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
