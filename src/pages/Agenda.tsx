import { Card, CardContent } from "@/components/ui/card";
import { Calendar as CalendarIcon } from "lucide-react";

export default function Agenda() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Agenda</h1>
        <p className="text-sm text-muted-foreground mt-1">Calendário de tratamentos e entrevistas</p>
      </div>

      <Card className="glass-card">
        <CardContent className="py-12">
          <div className="flex flex-col items-center text-muted-foreground">
            <CalendarIcon className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Agenda em breve</p>
            <p className="text-xs mt-1">Cadastre tratamentos para visualizar a agenda</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
