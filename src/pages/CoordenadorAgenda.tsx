import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Search } from "lucide-react";
import { format, addDays } from "date-fns";
import { isTratamentoHolistico } from "@/lib/agendaRules";
import { getTratamentosCoordenados } from "@/services/coordenacao/escopo";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface AgendaItem {
  id: string;
  assistido_nome: string;
  tratamento_nome: string;
  tratamento_tipo: string | null;
  data_sessao: string;
  horario: string | null;
  status: string;
}

/** Ordena por data ASC, horário ASC com NULLS LAST (apenas ordenação — não mascara pendência). */
function ordenarPorDataHorario(a: AgendaItem, b: AgendaItem): number {
  if (a.data_sessao !== b.data_sessao) return a.data_sessao < b.data_sessao ? -1 : 1;
  if (!a.horario && !b.horario) return 0;
  if (!a.horario) return 1;
  if (!b.horario) return -1;
  return a.horario.localeCompare(b.horario);
}

export default function CoordenadorAgenda() {
  const { user } = useAuth();
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const tratIds = await getTratamentosCoordenados(user.id);
      if (tratIds.length === 0) { setItems([]); return; }

      const { data: meusTrat } = await supabase
        .from("tipos_tratamento")
        .select("id, nome, tipo")
        .in("id", tratIds);

      if (!meusTrat || meusTrat.length === 0) { setItems([]); return; }
      const tratMap = Object.fromEntries(
        meusTrat.map((t: any) => [t.id, { nome: t.nome, tipo: t.tipo }]),
      );

      const today = format(new Date(), "yyyy-MM-dd");
      const limit30 = format(addDays(new Date(), 30), "yyyy-MM-dd");

      const { data: agendas } = await supabase
        .from("agenda_tratamentos_assistido")
        .select("id, assistido_id, tratamento_id, data_sessao, horario, status")
        .in("tratamento_id", tratIds)
        .gte("data_sessao", today)
        .lte("data_sessao", limit30)
        .order("data_sessao", { ascending: true })
        .order("horario", { ascending: true, nullsFirst: false });

      if (!agendas || agendas.length === 0) { setItems([]); return; }

      const assistidoIds = [...new Set(agendas.map((a: any) => a.assistido_id))];
      const { data: assistidos } = await supabase.from("assistidos").select("id, nome").in("id", assistidoIds);
      const assistMap = Object.fromEntries((assistidos || []).map((a: any) => [a.id, a.nome]));

      setItems(
        agendas
          .map((a: any) => ({
            id: a.id,
            assistido_nome: assistMap[a.assistido_id] || "—",
            tratamento_nome: tratMap[a.tratamento_id]?.nome || "—",
            tratamento_tipo: tratMap[a.tratamento_id]?.tipo ?? null,
            data_sessao: a.data_sessao,
            horario: a.horario,
            status: a.status,
          }))
          .sort(ordenarPorDataHorario),
      );
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
          <Calendar className="h-6 w-6 text-primary" />
          Agenda do Tratamento
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Próximas sessões dos tratamentos sob sua coordenação (30 dias)</p>
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
              <Calendar className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma sessão agendada</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Dia</TableHead>
                    <TableHead className="hidden md:table-cell">Horário</TableHead>
                    <TableHead>Assistido</TableHead>
                    <TableHead>Tratamento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const d = new Date(item.data_sessao + "T12:00:00");
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{format(d, "dd/MM/yyyy")}</TableCell>
                        <TableCell>{DIAS_SEMANA[d.getDay()]}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          {item.horario ? (
                            item.horario
                          ) : isTratamentoHolistico(item.tratamento_tipo) ? (
                            <Badge variant="destructive" className="text-xs">Horário pendente</Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{item.assistido_nome}</TableCell>
                        <TableCell>{item.tratamento_nome}</TableCell>
                        <TableCell>
                          <Badge variant={item.status === "agendado" ? "outline" : "default"} className="text-xs">
                            {item.status === "agendado" ? "Agendado" : item.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
