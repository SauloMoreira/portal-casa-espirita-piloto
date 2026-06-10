import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eachDayOfInterval, format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock } from "lucide-react";
import { getAgendaStatusColor } from "@/constants/agenda";
import { formatEntrevistaTime } from "@/lib/agenda";
import { AgendaEntrevistaCard } from "./AgendaEntrevistaCard";
import type { AgendaDateRange, EntrevistaAgendaItem } from "@/types/agenda";

interface Props {
  dateRange: AgendaDateRange;
  groupedByDate: Map<string, EntrevistaAgendaItem[]>;
  onSelectEntrevista: (e: EntrevistaAgendaItem) => void;
  isMobile: boolean;
}

export function AgendaWeekView({ dateRange, groupedByDate, onSelectEntrevista, isMobile }: Props) {
  const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });

  if (isMobile) {
    return (
      <div className="space-y-3">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayEntrevistas = groupedByDate.get(key) || [];
          const isToday = isSameDay(day, new Date());
          return (
            <Card key={key} className={`glass-card ${isToday ? "ring-2 ring-primary/50" : ""}`}>
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className={`w-7 h-7 flex items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-primary text-primary-foreground" : ""
                  }`}>
                    {format(day, "dd")}
                  </span>
                  <span className="capitalize">{format(day, "EEEE", { locale: ptBR })}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                {dayEntrevistas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma entrevista</p>
                ) : (
                  <div className="space-y-2">
                    {dayEntrevistas.map((e) => (
                      <AgendaEntrevistaCard key={e.id} entrevista={e} onClick={() => onSelectEntrevista(e)} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  return (
    <Card className="glass-card overflow-hidden">
      <CardContent className="p-0">
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEntrevistas = groupedByDate.get(key) || [];
            const isToday = isSameDay(day, new Date());
            return (
              <div key={key} className="border-r last:border-r-0 min-h-[300px]">
                <div className={`text-center py-2 border-b ${isToday ? "bg-primary/10" : ""}`}>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {format(day, "EEE", { locale: ptBR })}
                  </p>
                  <p className={`text-sm font-semibold ${
                    isToday ? "bg-primary text-primary-foreground w-7 h-7 rounded-full flex items-center justify-center mx-auto" : ""
                  }`}>
                    {format(day, "dd")}
                  </p>
                </div>
                <div className="p-1 space-y-1">
                  {dayEntrevistas.map((e) => {
                    const time = formatEntrevistaTime(e.data);
                    return (
                      <div
                        key={e.id}
                        className={`text-[11px] rounded p-1.5 cursor-pointer hover:opacity-80 transition-opacity ${getAgendaStatusColor(e.status) || "bg-muted"}`}
                        onClick={() => onSelectEntrevista(e)}
                      >
                        {time && (
                          <p className="font-semibold flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {time}
                          </p>
                        )}
                        <p className="truncate font-medium">{e.assistido_nome}</p>
                        <p className="truncate text-[10px] opacity-80">{e.entrevistador_nome}</p>
                      </div>
                    );
                  })}
                  {dayEntrevistas.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-4">—</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
