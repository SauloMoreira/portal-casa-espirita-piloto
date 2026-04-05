import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

export default function Configuracoes() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Parâmetros gerais do sistema</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Settings className="h-4 w-4 text-primary" />
              Regras da Entrevista Fraterna
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="min-palestras">Quantidade mínima de palestras para entrevista</Label>
              <Input id="min-palestras" type="number" defaultValue={3} min={0} />
              <p className="text-xs text-muted-foreground">
                O assistido precisa ter assistido este número de palestras para ser elegível à entrevista fraterna
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Permitir entrevista fraterna livre</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permite agendar entrevistas sem o mínimo de palestras
                </p>
              </div>
              <Switch />
            </div>
            <Button className="w-full sm:w-auto">Salvar Configurações</Button>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Informações da Casa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome-casa">Nome da Casa Espírita</Label>
              <Input id="nome-casa" placeholder="Nome da casa espírita" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endereco">Endereço</Label>
              <Input id="endereco" placeholder="Endereço completo" />
            </div>
            <Button className="w-full sm:w-auto">Salvar</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
