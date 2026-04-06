import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Calendar, ClipboardCheck, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addDays, addWeeks, addMonths, getDay, startOfDay, format } from "date-fns";
import { CartaAgendamento } from "@/components/CartaAgendamento";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface WaitItem {
  id: string; // assistido_tratamento id
  assistido_id: string;
  assistido_nome: string;
  tratamento_id: string;
  tratamento_nome: string;
  quantidade_total: number;
  entrevista_data: string | null;
  status: string;
  dia_semana: number | null;
  horario: string | null;
  frequencia_valor: number | null;
  frequencia_unidade: string | null;
}

export default function CoordenadorListaEspera() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<WaitItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterTrat, setFilterTrat] = useState("todos");
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WaitItem | null>(null);
  const [dataInicial, setDataInicial] = useState("");
  const [saving, setSaving] = useState(false);
  const [tratNomes, setTratNomes] = useState<string[]>([]);
  const [cartaOpen, setCartaOpen] = useState(false);
  const [cartaAssistidoId, setCartaAssistidoId] = useState("");
  const [cartaVinculoIds, setCartaVinculoIds] = useState<string[]>([]);

  const fetchData = async () => {
    if (!user) return;

    // Get my treatments
    const { data: meusTrat } = await supabase
      .from("tipos_tratamento")
      .select("id, nome, dia_semana, horario, frequencia_valor, frequencia_unidade")
      .eq("coordenador_responsavel_id", user.id);

    if (!meusTrat || meusTrat.length === 0) { setItems([]); return; }

    const tratMap = Object.fromEntries(meusTrat.map((t: any) => [t.id, t]));
    const tratIds = meusTrat.map((t: any) => t.id);
    setTratNomes(meusTrat.map((t: any) => t.nome));

    // Get wait list items
    const { data: vinculos } = await supabase
      .from("assistido_tratamentos")
      .select("id, assistido_id, tratamento_id, quantidade_total, status, entrevista_id")
      .in("tratamento_id", tratIds)
      .eq("status", "aguardando_agendamento");

    if (!vinculos || vinculos.length === 0) { setItems([]); return; }

    // Get assistido names
    const assistidoIds = [...new Set(vinculos.map((v: any) => v.assistido_id))];
    const { data: assistidos } = await supabase
      .from("assistidos")
      .select("id, nome")
      .in("id", assistidoIds);

    const assistMap = Object.fromEntries((assistidos || []).map((a: any) => [a.id, a.nome]));

    // Get entrevista dates
    const entrevistaIds = vinculos.map((v: any) => v.entrevista_id).filter(Boolean);
    const { data: entrevistas } = entrevistaIds.length > 0
      ? await supabase.from("entrevistas_fraternas").select("id, data").in("id", entrevistaIds)
      : { data: [] };

    const entMap = Object.fromEntries((entrevistas || []).map((e: any) => [e.id, e.data]));

    const result: WaitItem[] = vinculos.map((v: any) => {
      const trat = tratMap[v.tratamento_id];
      return {
        id: v.id,
        assistido_id: v.assistido_id,
        assistido_nome: assistMap[v.assistido_id] || "—",
        tratamento_id: v.tratamento_id,
        tratamento_nome: trat?.nome || "—",
        quantidade_total: v.quantidade_total,
        entrevista_data: v.entrevista_id ? entMap[v.entrevista_id] || null : null,
        status: v.status,
        dia_semana: trat?.dia_semana ?? null,
        horario: trat?.horario ?? null,
        frequencia_valor: trat?.frequencia_valor ?? 1,
        frequencia_unidade: trat?.frequencia_unidade ?? "semanas",
      };
    });

    // Sort by entrevista date (oldest first)
    result.sort((a, b) => {
      const da = a.entrevista_data || "9999";
      const db = b.entrevista_data || "9999";
      return da.localeCompare(db);
    });

    setItems(result);
  };

  useEffect(() => { fetchData(); }, [user]);

  const filtered = items.filter((i) => {
    const matchSearch = i.assistido_nome.toLowerCase().includes(search.toLowerCase());
    const matchTrat = filterTrat === "todos" || i.tratamento_nome === filterTrat;
    return matchSearch && matchTrat;
  });

  const openAgendar = (item: WaitItem) => {
    setSelectedItem(item);
    setDataInicial("");
    setAgendarOpen(true);
  };

  const handleAgendar = async () => {
    if (!selectedItem || !dataInicial) {
      toast({ title: "Informe a data da 1ª sessão", variant: "destructive" });
      return;
    }

    // Validate weekday
    if (selectedItem.dia_semana !== null) {
      const selectedDate = new Date(dataInicial + "T12:00:00");
      if (getDay(selectedDate) !== selectedItem.dia_semana) {
        toast({
          title: "Data incompatível",
          description: `A data deve ser ${DIAS_SEMANA[selectedItem.dia_semana]}`,
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);

    // Generate sessions
    const startDate = new Date(dataInicial + "T12:00:00");
    const sessions: { data_sessao: string; horario: string | null }[] = [];
    let cursor = startOfDay(startDate);

    for (let i = 0; i < selectedItem.quantidade_total; i++) {
      sessions.push({
        data_sessao: format(cursor, "yyyy-MM-dd"),
        horario: selectedItem.horario || null,
      });
      const fv = selectedItem.frequencia_valor || 1;
      const fu = selectedItem.frequencia_unidade || "semanas";
      if (fu === "semanas") cursor = addWeeks(cursor, fv);
      else if (fu === "meses") cursor = addMonths(cursor, fv);
      else cursor = addDays(cursor, fv);
    }

    // Insert agenda
    if (sessions.length > 0) {
      const { error: agendaErr } = await supabase.from("agenda_tratamentos_assistido").insert(
        sessions.map((s) => ({
          assistido_id: selectedItem.assistido_id,
          assistido_tratamento_id: selectedItem.id,
          tratamento_id: selectedItem.tratamento_id,
          data_sessao: s.data_sessao,
          horario: s.horario,
          status: "agendado",
          registrado_por: user!.id,
        })) as any
      );

      if (agendaErr) {
        toast({ title: "Erro ao gerar agenda", description: agendaErr.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    // Update status
    await supabase.from("assistido_tratamentos").update({
      status: "aguardando_inicio",
      data_inicio: dataInicial,
      agendado_por: user!.id,
    } as any).eq("id", selectedItem.id);

    toast({ title: "Tratamento agendado com sucesso!", description: `${sessions.length} sessão(ões) gerada(s)` });
    setAgendarOpen(false);
    setSaving(false);
    
    // Show scheduling letter
    setCartaAssistidoId(selectedItem.assistido_id);
    setCartaVinculoIds([selectedItem.id]);
    setCartaOpen(true);
    
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          Lista de Espera
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Assistidos aguardando agendamento nos seus tratamentos</p>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar assistido..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {tratNomes.length > 1 && (
              <Select value={filterTrat} onValueChange={setFilterTrat}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos tratamentos</SelectItem>
                  {tratNomes.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ClipboardCheck className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum assistido na lista de espera</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assistido</TableHead>
                    <TableHead>Tratamento</TableHead>
                    <TableHead className="hidden md:table-cell">Data Entrevista</TableHead>
                    <TableHead className="hidden md:table-cell">Sessões</TableHead>
                    <TableHead className="hidden md:table-cell">Status</TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.assistido_nome}</TableCell>
                      <TableCell>{item.tratamento_nome}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {item.entrevista_data ? format(new Date(item.entrevista_data), "dd/MM/yyyy") : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{item.quantidade_total}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-xs">Aguardando</Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => openAgendar(item)} className="gap-1">
                          <Calendar className="h-3 w-3" /> Agendar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Agendar */}
      <Dialog open={agendarOpen} onOpenChange={setAgendarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar 1ª Sessão</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-sm font-medium">{selectedItem.assistido_nome}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedItem.tratamento_nome} · {selectedItem.quantidade_total} sessão(ões)
                </p>
                {selectedItem.dia_semana !== null && (
                  <p className="text-xs text-muted-foreground">
                    Dia: {DIAS_SEMANA[selectedItem.dia_semana]} · Horário: {selectedItem.horario || "—"}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Data da 1ª Sessão {selectedItem.dia_semana !== null ? `(${DIAS_SEMANA[selectedItem.dia_semana]})` : ""}</Label>
                <Input
                  type="date"
                  value={dataInicial}
                  onChange={(e) => setDataInicial(e.target.value)}
                />
                {dataInicial && selectedItem.dia_semana !== null && getDay(new Date(dataInicial + "T12:00:00")) !== selectedItem.dia_semana && (
                  <p className="text-xs text-destructive">A data deve ser {DIAS_SEMANA[selectedItem.dia_semana]}</p>
                )}
              </div>
              <Button onClick={handleAgendar} disabled={saving || !dataInicial} className="w-full">
                {saving ? "Agendando..." : "Confirmar Agendamento"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Carta de Agendamento */}
      <CartaAgendamento
        open={cartaOpen}
        onOpenChange={setCartaOpen}
        assistidoId={cartaAssistidoId}
        assistidoTratamentoIds={cartaVinculoIds}
      />
    </div>
  );
}
