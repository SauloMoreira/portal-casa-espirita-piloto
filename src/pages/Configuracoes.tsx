import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Palette } from "lucide-react";

export default function Configuracoes() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Preferências visuais e administrativas do sistema</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
        <Card
          className="glass-card cursor-pointer hover:shadow-md transition-shadow group"
          onClick={() => navigate("/configuracoes/cores")}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
              Gestão de Cores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Personalize as cores do sistema para refletir a identidade visual da instituição
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
