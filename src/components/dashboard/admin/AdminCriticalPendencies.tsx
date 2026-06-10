import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowRight, Hourglass, Clock, CalendarX, type LucideIcon } from "lucide-react";
import type { DashboardPendencia, DashboardPendenciaTipo } from "@/types/adminDashboard";

const PENDENCIA_ICON: Record<DashboardPendenciaTipo, LucideIcon> = {
  aguardando: Hourglass,
  lista_espera: Clock,
  faltas: CalendarX,
};

interface Props {
  pendencias: DashboardPendencia[];
  onOpenAguardando: () => void;
  onNavigate: (path: string) => void;
}

const PENDENCIA_PATH: Partial<Record<DashboardPendenciaTipo, string>> = {
  lista_espera: "/lista-espera",
  faltas: "/relatorios",
};

export function AdminCriticalPendencies({ pendencias, onOpenAguardando, onNavigate }: Props) {
  if (pendencias.length === 0) return null;

  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" /> Pendências Críticas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {pendencias.map((p) => {
            const Icon = PENDENCIA_ICON[p.tipo];
            const path = PENDENCIA_PATH[p.tipo];
            return (
              <div
                key={p.tipo}
                onClick={() => {
                  if (p.tipo === "aguardando") onOpenAguardando();
                  else if (path) onNavigate(path);
                }}
                className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card hover:bg-secondary/50 cursor-pointer transition-colors"
              >
                <Icon className="h-5 w-5 text-warning shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.label}</p>
                  <p className="text-lg font-bold text-foreground">{p.count}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
