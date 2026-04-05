import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Heart } from "lucide-react";

export default function Tratamentos() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Gestão de Tratamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro e configuração dos tratamentos</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Tratamento
        </Button>
      </div>

      <Tabs defaultValue="todos" className="w-full">
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="espiritual">Espiritual</TabsTrigger>
          <TabsTrigger value="holistico">Holístico</TabsTrigger>
        </TabsList>

        <TabsContent value="todos" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar tratamento..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Heart className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhum tratamento cadastrado</p>
                <p className="text-xs mt-1">Cadastre tratamentos espirituais e holísticos</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="espiritual" className="mt-4">
          <Card className="glass-card">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum tratamento espiritual cadastrado
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="holistico" className="mt-4">
          <Card className="glass-card">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Nenhum tratamento holístico cadastrado
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
