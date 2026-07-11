import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Heart } from "lucide-react";
import { format } from "date-fns";
import { getTratamentosCoordenados } from "@/services/coordenacao/escopo";

const STATUS_LABELS: Record<string, string> = {
  aguardando_inicio: "Aguardando Início",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
  aguardando_agendamento: "Aguardando Agendamento",
  aguardando_liberacao: "Aguardando Liberação",
  suspenso: "Suspenso",
};

interface TratItem {
  id: string;
  assistido_nome: string;
  tratamento_nome: string;
  quantidade_realizada: number;
  quantidade_total: number;
  quantidade_faltante: number | null;
  status: string;
  proxima_sessao: string | null;
}

export default function CoordenadorTratamentos() {
  const { user } = useAuth();
  const [items, setItems] = useState<TratItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const tratIds = await getTratamentosCoordenados(user.id);
      if (tratIds.length === 0) { setItems([]); return; }

      const { data: meusTrat } = await supabase
        .from("tipos_tratamento")
        .select("id, nome")
        .in("id", tratIds);

      if (!meusTrat || meusTrat.length === 0) { setItems([]); return; }
      const tratMap = Object.fromEntries(meusTrat.map((t: any) => [t.id, t.nome]));

      const { data: vinculos } = await supabase
        .from("assistido_tratamentos")
        .select("id, assistido_id, tratamento_id, quantidade_realizada, quantidade_total, quantidade_faltante, status")
        .in("tratamento_id", tratIds)
        .in("status", ["aguardando_inicio", "em_andamento"]);

      if (!vinculos || vinculos.length === 0) { setItems([]); return; }

      const assistidoIds = [...new Set(vinculos.map((v: any) => v.assistido_id))];
      const { data: assistidos } = await supabase.from("assistidos").select("id, nome").in("id", assistidoIds);
      const assistMap = Object.fromEntries((assistidos || []).map((a: any) => [a.id, a.nome]));

      const today = format(new Date(), "yyyy-MM-dd");
      const vinculoIds = vinculos.map((v: any) => v.id);
      const { data: agendas } = await supabase
        .from("agenda_tratamentos_assistido")
        .select("assistido_tratamento_id, data_sessao")
        .in("assistido_tratamento_id", vinculoIds)
        .eq("status", "agendado")
        .gte("data_sessao", today)
        .order("data_sessao", { ascending: true });

      const nextSessionMap: Record<string, string> = {};
      for (const a of (agendas || []) as any[]) {
        if (!nextSessionMap[a.assistido_tratamento_id]) {
          nextSessionMap[a.assistido_tratamento_id] = a.data_sessao;
        }
      }

      setItems(vinculos.map((v: any) => ({
        id: v.id,
        assistido_nome: assistMap[v.assistido_id] || "—",
        tratamento_nome: tratMap[v.tratamento_id] || "—",
        quantidade_realizada: v.quantidade_realizada,
        quantidade_total: v.quantidade_total,
        quantidade_faltante: v.quantidade_faltante,
        status: v.status,
        proxima_sessao: nextSessionMap[v.id] || null,
      })));
    };
    fetch();
  }, [user]);

  const filtered = items.filter((i) =>
    i.assistido_nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Heart className="h-6 w-6 text-primary" aria-hidden="true" />
          Tratamentos sob minha coordenação
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Assistidos em tratamento nos trabalhos sob sua responsabilidade.</p>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar assistido..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Heart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum tratamento em andamento</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assistido</TableHead>
                    <TableHead>Tratamento</TableHead>
                    <TableHead>Realizadas</TableHead>
                    <TableHead className="hidden md:table-cell">Faltantes</TableHead>
                    <TableHead className="hidden md:table-cell">Próxima Sessão</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.assistido_nome}</TableCell>
                      <TableCell>{item.tratamento_nome}</TableCell>
                      <TableCell>{item.quantidade_realizada}/{item.quantidade_total}</TableCell>
                      <TableCell className="hidden md:table-cell">{item.quantidade_faltante ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {item.proxima_sessao ? format(new Date(item.proxima_sessao + "T12:00:00"), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.status === "em_andamento" ? "default" : "outline"} className="text-xs">
                          {STATUS_LABELS[item.status] || item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
