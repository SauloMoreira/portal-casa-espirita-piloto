import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "lucide-react";

export default function MinhaAgenda() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Minha Agenda</h1>
        <p className="text-sm text-muted-foreground mt-1">Seus próximos atendimentos</p>
      </div>

      <Card className="glass-card">
        <CardContent className="py-12">
          <div className="flex flex-col items-center text-muted-foreground">
            <Calendar className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhum atendimento agendado</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
