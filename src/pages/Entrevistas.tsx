import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, BookOpen, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Entrevistas() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Entrevistas Fraternas</h1>
          <p className="text-sm text-muted-foreground mt-1">Agenda e acompanhamento de entrevistas</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Agendar Entrevista
        </Button>
      </div>

      <Tabs defaultValue="agendadas">
        <TabsList>
          <TabsTrigger value="agendadas">Agendadas</TabsTrigger>
          <TabsTrigger value="realizadas">Realizadas</TabsTrigger>
          <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
        </TabsList>
        <TabsContent value="agendadas" className="mt-4">
          <Card className="glass-card">
            <CardContent className="py-12">
              <div className="flex flex-col items-center text-muted-foreground">
                <Calendar className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhuma entrevista agendada</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="realizadas" className="mt-4">
          <Card className="glass-card">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma entrevista realizada
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="pendentes" className="mt-4">
          <Card className="glass-card">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhuma entrevista pendente
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
