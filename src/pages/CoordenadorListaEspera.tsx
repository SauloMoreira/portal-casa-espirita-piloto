import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Search, Calendar, ClipboardCheck, Printer, AlertTriangle, ArrowUpDown, Flag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addDays, addWeeks, addMonths, getDay, startOfDay, format } from "date-fns";
import { CartaAgendamento } from "@/components/CartaAgendamento";
import { carregarListaEspera, type ListaEsperaItem } from "@/services/coordenacao/listaEspera";
import { isTratamentoHolistico, normalizarHorario, type MotivoListaEspera } from "@/lib/agendaRules";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const MOTIVO_LABEL: Record<MotivoListaEspera, string> = {
  AGUARDANDO_AGENDAMENTO: "Aguardando agendamento",
  AGUARDANDO_INICIO_SEM_PROXIMA_SESSAO: "Aguardando início sem próxima sessão",
  LEGADO_SEM_AGENDA: "Legado sem agenda gerada",
  PLANO_SEM_ETAPA_ATIVA: "Plano sem etapa ativa",
};

const PRIORIDADE_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; order: number }> = {
  urgente: { label: "Urgente", variant: "destructive", order: 0 },
  alta: { label: "Alta", variant: "default", order: 1 },
  normal: { label: "Normal", variant: "secondary", order: 2 },
};

type SortMode = "prioridade" | "cronologico" | "tempo_espera";

type WaitItem = ListaEsperaItem;


export default function CoordenadorListaEspera() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<WaitItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterTrat, setFilterTrat] = useState("todos");
  const [filterPrioridade, setFilterPrioridade] = useState("todos");
  const [sortMode, setSortMode] = useState<SortMode>("prioridade");
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<WaitItem | null>(null);
  const [dataInicial, setDataInicial] = useState("");
  const [horario, setHorario] = useState("");
  const [saving, setSaving] = useState(false);
  const [tratNomes, setTratNomes] = useState<string[]>([]);
  const [cartaOpen, setCartaOpen] = useState(false);
  const [cartaAssistidoId, setCartaAssistidoId] = useState("");
  const [cartaVinculoIds, setCartaVinculoIds] = useState<string[]>([]);
  const [prioridadeOpen, setPrioridadeOpen] = useState(false);
  const [prioridadeItem, setPrioridadeItem] = useState<WaitItem | null>(null);
  const [novaPrioridade, setNovaPrioridade] = useState("normal");
  const [novaUrgencia, setNovaUrgencia] = useState("");

  const fetchData = async () => {
    if (!user) return;
    const { itens, tratamentoNomes } = await carregarListaEspera(user.id);
    setTratNomes(tratamentoNomes);
    setItems(itens);
  };


  useEffect(() => { fetchData(); }, [user]);

  const sortItems = (list: WaitItem[]) => {
    return [...list].sort((a, b) => {
      if (sortMode === "prioridade") {
        const pa = PRIORIDADE_CONFIG[a.prioridade]?.order ?? 2;
        const pb = PRIORIDADE_CONFIG[b.prioridade]?.order ?? 2;
        if (pa !== pb) return pa - pb;
        return b.dias_espera - a.dias_espera;
      }
      if (sortMode === "tempo_espera") {
        return b.dias_espera - a.dias_espera;
      }
      // cronologico
      const da = a.entrevista_data || "9999";
      const db = b.entrevista_data || "9999";
      return da.localeCompare(db);
    });
  };

  const filtered = sortItems(
    items.filter((i) => {
      const matchSearch = i.assistido_nome.toLowerCase().includes(search.toLowerCase());
      const matchTrat = filterTrat === "todos" || i.tratamento_nome === filterTrat;
      const matchPrio = filterPrioridade === "todos" || i.prioridade === filterPrioridade;
      return matchSearch && matchTrat && matchPrio;
    })
  );

  const openAgendar = (item: WaitItem) => {
    setSelectedItem(item);
    setDataInicial("");
    setAgendarOpen(true);
  };

  const openPrioridade = (item: WaitItem) => {
    setPrioridadeItem(item);
    setNovaPrioridade(item.prioridade);
    setNovaUrgencia(item.urgencia || "");
    setPrioridadeOpen(true);
  };

  const handleSalvarPrioridade = async () => {
    if (!prioridadeItem) return;
    setSaving(true);
    await supabase.from("assistido_tratamentos").update({
      prioridade: novaPrioridade,
      urgencia: novaUrgencia.trim() || null,
    } as any).eq("id", prioridadeItem.id);
    toast({ title: "Prioridade atualizada" });
    setPrioridadeOpen(false);
    setSaving(false);
    fetchData();
  };

  const handleAgendar = async () => {
    if (!selectedItem || !dataInicial) {
      toast({ title: "Informe a data da 1ª sessão", variant: "destructive" });
      return;
    }

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

    await supabase.from("assistido_tratamentos").update({
      status: "aguardando_inicio",
      data_inicio: dataInicial,
      agendado_por: user!.id,
    } as any).eq("id", selectedItem.id);

    toast({ title: "Tratamento agendado com sucesso!", description: `${sessions.length} sessão(ões) gerada(s)` });
    setAgendarOpen(false);
    setSaving(false);

    setCartaAssistidoId(selectedItem.assistido_id);
    setCartaVinculoIds([selectedItem.id]);
    setCartaOpen(true);

    fetchData();
  };

  const urgentCount = items.filter((i) => i.prioridade === "urgente").length;
  const altaCount = items.filter((i) => i.prioridade === "alta").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          Lista de Espera
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Vínculos com pendência de agendamento nos seus tratamentos</p>
      </div>

      {/* Summary badges */}
      {(urgentCount > 0 || altaCount > 0) && (
        <div className="flex gap-2 flex-wrap">
          {urgentCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {urgentCount} urgente{urgentCount > 1 ? "s" : ""}
            </Badge>
          )}
          {altaCount > 0 && (
            <Badge variant="default" className="gap-1">
              <Flag className="h-3 w-3" /> {altaCount} alta prioridade
            </Badge>
          )}
        </div>
      )}

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
            <Select value={filterPrioridade} onValueChange={setFilterPrioridade}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas prioridades</SelectItem>
                <SelectItem value="urgente">Urgente</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prioridade">Ordenar: Prioridade</SelectItem>
                <SelectItem value="cronologico">Ordenar: Cronológico</SelectItem>
                <SelectItem value="tempo_espera">Ordenar: Tempo de espera</SelectItem>
              </SelectContent>
            </Select>
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
                    <TableHead className="w-20">Prioridade</TableHead>
                    <TableHead>Assistido</TableHead>
                    <TableHead>Tratamento</TableHead>
                    <TableHead className="hidden md:table-cell">Entrevista</TableHead>
                    <TableHead className="hidden md:table-cell">Espera</TableHead>
                    <TableHead className="hidden md:table-cell">Sessões</TableHead>
                    <TableHead className="w-32"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((item) => {
                    const pConfig = PRIORIDADE_CONFIG[item.prioridade] || PRIORIDADE_CONFIG.normal;
                    return (
                      <TableRow key={item.id} className={item.prioridade === "urgente" ? "bg-destructive/5" : item.prioridade === "alta" ? "bg-primary/5" : ""}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 p-1 h-auto"
                            onClick={() => openPrioridade(item)}
                            title="Alterar prioridade"
                          >
                            <Badge variant={pConfig.variant} className="text-xs cursor-pointer">
                              {pConfig.label}
                            </Badge>
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{item.assistido_nome}</span>
                            {item.urgencia && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]" title={item.urgencia}>
                                {item.urgencia}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span>{item.tratamento_nome}</span>
                            <Badge variant="outline" className="ml-2 text-[10px] align-middle">
                              {MOTIVO_LABEL[item.motivo]}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {item.entrevista_data ? format(new Date(item.entrevista_data), "dd/MM/yyyy") : "—"}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className={item.dias_espera > 30 ? "text-destructive font-medium" : item.dias_espera > 14 ? "text-amber-600 font-medium" : ""}>
                            {item.dias_espera}d
                          </span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{item.quantidade_total}</TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => openAgendar(item)} className="gap-1">
                            <Calendar className="h-3 w-3" /> Agendar
                          </Button>
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

      {/* Dialog Alterar Prioridade */}
      <Dialog open={prioridadeOpen} onOpenChange={setPrioridadeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-5 w-5" /> Definir Prioridade
            </DialogTitle>
          </DialogHeader>
          {prioridadeItem && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="font-medium text-sm">{prioridadeItem.assistido_nome}</p>
                <p className="text-xs text-muted-foreground">{prioridadeItem.tratamento_nome}</p>
              </div>
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Select value={novaPrioridade} onValueChange={setNovaPrioridade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Justificativa (opcional)</Label>
                <Textarea
                  value={novaUrgencia}
                  onChange={(e) => setNovaUrgencia(e.target.value)}
                  placeholder="Motivo da priorização..."
                  rows={3}
                />
              </div>
              <Button onClick={handleSalvarPrioridade} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar Prioridade"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Agendar */}
      <Dialog open={agendarOpen} onOpenChange={setAgendarOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agendar 1ª Sessão</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{selectedItem.assistido_nome}</p>
                  <Badge variant={PRIORIDADE_CONFIG[selectedItem.prioridade]?.variant || "secondary"} className="text-xs">
                    {PRIORIDADE_CONFIG[selectedItem.prioridade]?.label || "Normal"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedItem.tratamento_nome} · {selectedItem.quantidade_total} sessão(ões)
                </p>
                {selectedItem.dia_semana !== null && (
                  <p className="text-xs text-muted-foreground">
                    Dia: {DIAS_SEMANA[selectedItem.dia_semana]} · Horário: {selectedItem.horario || "—"}
                  </p>
                )}
                {selectedItem.urgencia && (
                  <p className="text-xs text-amber-600 mt-1">⚠ {selectedItem.urgencia}</p>
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

      <CartaAgendamento
        open={cartaOpen}
        onOpenChange={setCartaOpen}
        assistidoId={cartaAssistidoId}
        assistidoTratamentoIds={cartaVinculoIds}
      />
    </div>
  );
}
