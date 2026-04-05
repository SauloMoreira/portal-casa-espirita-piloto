import { Card, CardContent } from "@/components/ui/card";
import { Heart } from "lucide-react";

export default function MeusTratamentos() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Meus Tratamentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Acompanhe seus tratamentos e sessões</p>
      </div>

      <Card className="glass-card">
        <CardContent className="py-12">
          <div className="flex flex-col items-center text-muted-foreground">
            <Heart className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhum tratamento designado</p>
            <p className="text-xs mt-1">Após sua entrevista fraterna, seus tratamentos aparecerão aqui</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
