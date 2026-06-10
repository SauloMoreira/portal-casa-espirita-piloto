import { Calendar as CalendarIcon } from "lucide-react";

export function AgendaHeader() {
  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
        <CalendarIcon className="h-6 w-6 text-primary" />
        Agenda de Entrevistas
      </h1>
      <p className="text-sm text-muted-foreground mt-1">Calendário de entrevistas fraternas</p>
    </div>
  );
}
