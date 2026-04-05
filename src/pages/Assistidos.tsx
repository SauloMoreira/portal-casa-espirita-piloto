import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, HandHeart } from "lucide-react";

export default function Assistidos() {
  const [search, setSearch] = useState("");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Assistidos</h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro e acompanhamento</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Assistido
        </Button>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar assistido por nome..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <HandHeart className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Nenhum assistido cadastrado</p>
            <p className="text-xs mt-1">Cadastre assistidos após a entrevista fraterna</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
