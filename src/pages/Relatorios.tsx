import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function Relatorios() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground mt-1">Relatórios operacionais e gerenciais</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          "Assistidos por Tratamento",
          "Frequência de Presença",
          "Entrevistas Realizadas",
          "Tratamentos Concluídos",
          "Faltas por Período",
          "Carga por Tarefeiro",
        ].map((title) => (
          <Card key={title} className="glass-card hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="py-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">Em breve</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
