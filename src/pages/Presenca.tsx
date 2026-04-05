import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck, Calendar, Check, X, Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface TratamentoDoDia {
  tratamento_id: string;
  tratamento_nome: string;
  horario: string | null;
  assistido_tratamento_id: string;
  assistido_nome: string;
  quantidade_total: number;
  quantidade_realizada: number;
  quantidade_faltante: number | null;
  status: string;
  presenca_registrada: boolean;
}

export default function Presenca() {
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [items, setItems] = useState<TratamentoDoDia[]>([]);
  const [tratamentoFilter, setTratamentoFilter] = useState("todos");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { user, role } = useAuth();
  const { toast } = useToast();

  const fetchData = async () => {
    const selectedDate = new Date(data + "T12:00:00");
    const diaSemana = selectedDate.getDay();

    // Get treatments for this day of week
    let tratQuery = supabase.from("tipos_tratamento").select("id, nome, horario, tarefeiro_id").eq("status", "ativo").eq("dia_semana", diaSemana);
    if (role === "tarefeiro") {
      tratQuery = tratQuery.eq("tarefeiro_id", user!.id);
    }
    const { data: tratamentos } = await tratQuery;
    if (!tratamentos || tratamentos.length === 0) { setItems([]); return; }

    const tratIds = tratamentos.map((t) => t.id);
    const tratMap = Object.fromEntries(tratamentos.map((t) => [t.id, t]));

    // Get active assistido_tratamentos for these treatments
    const { data: vinculos } = await supabase
      .from("assistido_tratamentos")
      .select("id, assistido_id, tratamento_id, quantidade_total, quantidade_realizada, quantidade_faltante, status")
      .in("tratamento_id", tratIds)
      .in("status", ["aguardando_inicio", "em_andamento", "liberado"]);

    if (!vinculos || vinculos.length === 0) { setItems([]); return; }

    const assistidoIds = [...new Set(vinculos.map((v) => v.assistido_id))];
    const { data: assistidos } = await supabase.from("assistidos").select("id, nome").in("id", assistidoIds);
    const assistMap = Object.fromEntries((assistidos || []).map((a) => [a.id, a.nome]));

    // Check existing presences for the selected date
    const vinculoIds = vinculos.map((v) => v.id);
    const { data: presencas } = await supabase
      .from("presencas_tratamentos")
      .select("assistido_tratamento_id")
      .in("assistido_tratamento_id", vinculoIds)
      .eq("data", data);

    const presencaSet = new Set((presencas || []).map((p) => p.assistido_tratamento_id));

    const result: TratamentoDoDia[] = vinculos.map((v) => ({
      tratamento_id: v.tratamento_id,
      tratamento_nome: tratMap[v.tratamento_id]?.nome || "—",
      horario: tratMap[v.tratamento_id]?.horario || null,
      assistido_tratamento_id: v.id,
      assistido_nome: assistMap[v.assistido_id] || "—",
      quantidade_total: v.quantidade_total,
      quantidade_realizada: v.quantidade_realizada,
      quantidade_faltante: v.quantidade_faltante,
      status: v.status,
      presenca_registrada: presencaSet.has(v.id),
    }));

    setItems(result.sort((a, b) => a.tratamento_nome.localeCompare(b.tratamento_nome)));
  };

  useEffect(() => { fetchData(); }, [data]);

  const registrarPresenca = async (atId: string, statusPresenca: "presente" | "ausente") => {
    setLoadingId(atId);
    const { data: result, error } = await supabase.rpc("registrar_presenca", {
      p_assistido_tratamento_id: atId,
      p_data: data,
      p_status_presenca: statusPresenca,
      p_registrado_por: user!.id,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: statusPresenca === "presente" ? "Presença registrada" : "Ausência registrada" });
      fetchData();
    }
    setLoadingId(null);
  };

  const tratamentosUnicos = [...new Set(items.map((i) => i.tratamento_nome))];
  const filtered = tratamentoFilter === "todos" ? items : items.filter((i) => i.tratamento_nome === tratamentoFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Controle de Presença</h1>
          <p className="text-sm text-muted-foreground mt-1">Registrar presença nos tratamentos</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-auto" />
        </div>
      </div>

      {tratamentosUnicos.length > 1 && (
        <Select value={tratamentoFilter} onValueChange={setTratamentoFilter}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Filtrar por tratamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Tratamentos</SelectItem>
            {tratamentosUnicos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Tratamentos do Dia — {new Date(data + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Heart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum tratamento agendado para este dia</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tratamento</TableHead>
                    <TableHead>Assistido</TableHead>
                    <TableHead className="hidden md:table-cell">Horário</TableHead>
                    <TableHead className="text-center">Progresso</TableHead>
                    <TableHead className="text-center">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.assistido_tratamento_id}>
                      <TableCell className="font-medium">{item.tratamento_nome}</TableCell>
                      <TableCell>{item.assistido_nome}</TableCell>
                      <TableCell className="hidden md:table-cell">{item.horario || "—"}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs">
                          {item.quantidade_realizada}/{item.quantidade_total}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.presenca_registrada ? (
                          <Badge variant="secondary" className="text-xs">Registrada</Badge>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1 h-8"
                              disabled={loadingId === item.assistido_tratamento_id}
                              onClick={() => registrarPresenca(item.assistido_tratamento_id, "presente")}
                            >
                              <Check className="h-3 w-3" /> Presente
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-8"
                              disabled={loadingId === item.assistido_tratamento_id}
                              onClick={() => registrarPresenca(item.assistido_tratamento_id, "ausente")}
                            >
                              <X className="h-3 w-3" /> Ausente
                            </Button>
                          </div>
                        )}
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
