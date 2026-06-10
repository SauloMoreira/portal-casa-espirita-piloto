import { Card, CardContent } from "@/components/ui/card";
import { eachDayOfInterval, format, isSameDay, isSameMonth } from "date-fns";
import { AGENDA_WEEK_DAYS, getAgendaStatusColor } from "@/constants/agenda";
import { formatEntrevistaTime } from "@/lib/agenda";
import type { AgendaDateRange, EntrevistaAgendaItem } from "@/types/agenda";

interface Props {
  currentDate: Date;
  dateRange: AgendaDateRange;
  groupedByDate: Map<string, EntrevistaAgendaItem[]>;
  onSelectDate: (d: Date) => void;
  onSelectEntrevista: (e: EntrevistaAgendaItem) => void;
}

export function AgendaMonthView({
  currentDate, dateRange, groupedByDate, onSelectDate, onSelectEntrevista,
}: Props) {
  const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });

  return (
    <Card className="glass-card overflow-hidden">
      <CardContent className="p-0">
        <div className="grid grid-cols-7 border-b">
          {AGENDA_WEEK_DAYS.map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2 border-r last:border-r-0">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEntrevistas = groupedByDate.get(key) || [];
            const isToday = isSameDay(day, new Date());
            const isCurrentMonth = isSameMonth(day, currentDate);

            return (
              <div
                key={key}
                className={`min-h-[80px] md:min-h-[100px] border-r border-b last:border-r-0 p-1 cursor-pointer hover:bg-accent/30 transition-colors ${
                  !isCurrentMonth ? "bg-muted/30" : ""
                }`}
                onClick={() => onSelectDate(day)}
              >
                <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? "bg-primary text-primary-foreground" : isCurrentMonth ? "text-foreground" : "text-muted-foreground"
                }`}>
                  {format(day, "d")}
                </div>
                <div className="space-y-0.5">
                  {dayEntrevistas.slice(0, 3).map((e) => {
                    const time = formatEntrevistaTime(e.data);
                    return (
                      <div
                        key={e.id}
                        className={`text-[10px] leading-tight rounded px-1 py-0.5 truncate cursor-pointer ${getAgendaStatusColor(e.status) || "bg-muted"}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onSelectEntrevista(e);
                        }}
                        title={`${e.assistido_nome} — ${time || "s/ horário"}`}
                      >
                        {time ? `${time} ` : ""}
                        {e.assistido_nome.split(" ")[0]}
                      </div>
                    );
                  })}
                  {dayEntrevistas.length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      +{dayEntrevistas.length - 3} mais
                    </div>
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
