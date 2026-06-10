import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { AgendaEntrevistaCard } from "./AgendaEntrevistaCard";
import type { EntrevistaAgendaItem } from "@/types/agenda";

interface Props {
  currentDate: Date;
  entrevistas: EntrevistaAgendaItem[];
  onSelectEntrevista: (e: EntrevistaAgendaItem) => void;
}

export function AgendaDayView({ currentDate, entrevistas, onSelectEntrevista }: Props) {
  const sorted = [...entrevistas].sort((a, b) => a.data.localeCompare(b.data));

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold capitalize">
          {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-muted-foreground">
            <CalendarIcon className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhuma entrevista neste dia</p>
            <p className="text-xs mt-1">Navegue para outra data ou ajuste os filtros</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((e) => (
              <AgendaEntrevistaCard key={e.id} entrevista={e} onClick={() => onSelectEntrevista(e)} expanded />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// re-export parseISO usage guard (kept for parity); no behavior change.
export const __agendaDayViewParse = parseISO;
