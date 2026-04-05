import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";

export default function Auditoria() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Auditoria</h1>
        <p className="text-sm text-muted-foreground mt-1">Histórico de ações do sistema</p>
      </div>

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Logs de Auditoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Shield className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhum registro de auditoria</p>
            <p className="text-xs mt-1">As ações do sistema serão registradas aqui</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
