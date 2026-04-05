import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClipboardCheck, Search, Calendar } from "lucide-react";

export default function Presenca() {
  const [date] = useState(new Date().toLocaleDateString("pt-BR"));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Controle de Presença</h1>
          <p className="text-sm text-muted-foreground mt-1">Registrar presença nos tratamentos</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{date}</span>
        </div>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Tratamentos do Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ClipboardCheck className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhum tratamento agendado para hoje</p>
            <p className="text-xs mt-1">Tratamentos aparecerão aqui conforme a agenda</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
