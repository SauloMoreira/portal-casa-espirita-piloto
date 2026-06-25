import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Calendar, BookOpen, Eye, Trash2, Printer } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { addDays, addWeeks, addMonths, getDay, startOfDay, format } from "date-fns";
import { CartaAgendamento } from "@/components/CartaAgendamento";

interface Entrevista {
  id: string;
  assistido_id: string;
  entrevistador_id: string;
  data: string;
  tipo_entrevista: string;
  status: string;
  observacoes: string | null;
  decisoes: string | null;
  assistido_nome?: string;
}

interface Assistido {
  id: string;
  nome: string;
  quantidade_palestras: number;
  status: string;
}

interface Tratamento {
  id: string;
  nome: string;
  tipo: string;
  status: string;
  dia_semana: number | null;
  horario: string | null;
  frequencia_valor: number | null;
  frequencia_unidade: string | null;
  ordem_tratamento: number | null;
  tratamento_livre: boolean;
  bloqueia_proximo_tratamento: boolean;
  modo_agendamento: string;
}

function generateSessionDates(
  startDate: Date,
  diaSemana: number | null,
  horario: string | null,
  freqValor: number,
  freqUnidade: string,
  quantidade: number
): { data_sessao: string; horario: string | null }[] {
  const sessions: { data_sessao: string; horario: string | null }[] = [];
  let cursor: Date;

  if (diaSemana !== null) {
    const entDay = getDay(startDate);
    if (entDay === diaSemana) {
      cursor = startOfDay(startDate);
      if (horario) {
        const [h, m] = horario.split(":").map(Number);
        const treatmentTime = new Date(startDate);
        treatmentTime.setHours(h, m, 0, 0);
        if (startDate > treatmentTime) {
          if (freqUnidade === "semanas") cursor = addWeeks(cursor, freqValor);
          else if (freqUnidade === "meses") cursor = addMonths(cursor, freqValor);
          else cursor = addDays(cursor, freqValor);
        }
      }
    } else {
      let diff = diaSemana - entDay;
      if (diff <= 0) diff += 7;
      cursor = addDays(startOfDay(startDate), diff);
    }
  } else {
    cursor = addDays(startOfDay(startDate), 1);
  }

  for (let i = 0; i < quantidade; i++) {
    sessions.push({ data_sessao: format(cursor, "yyyy-MM-dd"), horario: horario || null });
    if (freqUnidade === "semanas") cursor = addWeeks(cursor, freqValor);
    else if (freqUnidade === "meses") cursor = addMonths(cursor, freqValor);
    else cursor = addDays(cursor, freqValor);
  }
  return sessions;
}

interface DesignacaoItem {
  tratamento_id: string;
  quantidade_total: number;
}

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  faltou: "Faltou",
  remarcada: "Remarcada",
};

export default function Entrevistas() {
  const [entrevistas, setEntrevistas] = useState<Entrevista[]>([]);
  const [assistidos, setAssistidos] = useState<Assistido[]>([]);
  const [tratamentos, setTratamentos] = useState<Tratamento[]>([]);
  const [minPalestras, setMinPalestras] = useState(3);
  const [permitirLivre, setPermitirLivre] = useState(true);
  const [tab, setTab] = useState("agendadas");
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [realizarOpen, setRealizarOpen] = useState(false);
  const [selectedEntrevista, setSelectedEntrevista] = useState<Entrevista | null>(null);
  const [form, setForm] = useState({ assistido_id: "", data: "", tipo_entrevista: "regular", observacoes: "" });
  const [observacoes, setObservacoes] = useState("");
  const [decisoes, setDecisoes] = useState("");
  const [designacoes, setDesignacoes] = useState<DesignacaoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const { user, role, isMaster } = useAuth();
  const { toast } = useToast();
  // Tarefeiros may schedule interviews and read availability, but the actual
  // "realizar" (which designates treatments) stays with entrevistador/admin.
  const canRealizar = isMaster || role === "admin" || role === "entrevistador";
  const [cartaOpen, setCartaOpen] = useState(false);
  const [cartaAssistidoId, setCartaAssistidoId] = useState("");
  const [cartaEntrevistaId, setCartaEntrevistaId] = useState("");

  const fetchAll = async () => {
    // BUG-03: a listagem usa a RPC operacional, que NUNCA retorna observacoes/
    // decisoes. O conteúdo sigiloso só é carregado sob demanda (openRealizar),
    // e apenas para perfis autorizados (admin/entrevistador).
    const [{ data: ent }, { data: assist }, { data: trat }, { data: config }] = await Promise.all([
      supabase.rpc("fn_entrevistas_operacional"),
      supabase.from("assistidos").select("id, nome, quantidade_palestras, status").is("deleted_at", null).order("nome"),
      supabase.from("tipos_tratamento").select("id, nome, tipo, status, dia_semana, horario, frequencia_valor, frequencia_unidade, ordem_tratamento, tratamento_livre, bloqueia_proximo_tratamento, modo_agendamento").eq("status", "ativo"),
      supabase.from("configuracoes_gerais").select("chave, valor"),
    ]);
    if (assist) {
      const assistMap = Object.fromEntries(assist.map((a) => [a.id, a.nome]));
      const ordered = [...(ent || [])].sort((a: any, b: any) => (a.data < b.data ? 1 : -1));
      setEntrevistas(ordered.map((e: any) => ({ ...e, observacoes: null, decisoes: null, assistido_nome: assistMap[e.assistido_id] || "—" })));
      setAssistidos(assist as any);
    }
    if (trat) setTratamentos(trat as any);
    if (config) {
      const minP = config.find((c) => c.chave === "quantidade_minima_palestras");
      const livre = config.find((c) => c.chave === "permitir_entrevista_livre");
      if (minP) setMinPalestras(parseInt(minP.valor));
      if (livre) setPermitirLivre(livre.valor === "true");
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const assistidosAptos = assistidos.filter((a) => {
    if (form.tipo_entrevista === "livre" && permitirLivre) return true;
    return a.quantidade_palestras >= minPalestras;
  });

  const handleAgendar = async () => {
    if (!form.assistido_id || !form.data) {
      toast({ title: "Preencha assistido e data", variant: "destructive" });
      return;
    }
    setLoading(true);
    // Scheduling goes through a role-scoped security-definer RPC so that
    // tarefeiros can create the interview and flag the assistido as
    // "entrevista_agendada" without holding broad write access on assistidos.
    const { error } = await supabase.rpc("agendar_entrevista_fraterna", {
      _assistido_id: form.assistido_id,
      _data: form.data,
      _tipo: form.tipo_entrevista,
      _observacoes: form.observacoes || "",
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Entrevista agendada" });
      setAgendarOpen(false);
      setForm({ assistido_id: "", data: "", tipo_entrevista: "regular", observacoes: "" });
      fetchAll();
    }
    setLoading(false);
  };

  const openRealizar = (e: Entrevista) => {
    setSelectedEntrevista(e);
    setObservacoes(e.observacoes || "");
    setDecisoes(e.decisoes || "");
    setDesignacoes([]);
    setRealizarOpen(true);
  };

  const addDesignacao = () => {
    setDesignacoes([...designacoes, { tratamento_id: "", quantidade_total: 1 }]);
  };

  const removeDesignacao = (idx: number) => {
    setDesignacoes(designacoes.filter((_, i) => i !== idx));
  };

  const updateDesignacao = (idx: number, field: string, value: any) => {
    setDesignacoes(designacoes.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const handleRealizar = async () => {
    if (!selectedEntrevista) return;
    setLoading(true);

    const { error: entErr } = await supabase.from("entrevistas_fraternas").update({
      status: "realizada",
      observacoes,
      decisoes,
    }).eq("id", selectedEntrevista.id);

    if (entErr) {
      toast({ title: "Erro", description: entErr.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const today = format(new Date(), "yyyy-MM-dd");
    const tratamentoMap = Object.fromEntries(tratamentos.map((t) => [t.id, t]));

    // Reconcile: remove future pending agenda + unused vinculos for this interview
    const { data: existingVinculos } = await supabase
      .from("assistido_tratamentos")
      .select("id, tratamento_id, quantidade_realizada, status")
      .eq("assistido_id", selectedEntrevista.assistido_id)
      .eq("entrevista_id", selectedEntrevista.id);

    if (existingVinculos) {
      for (const v of existingVinculos) {
        await supabase.from("agenda_tratamentos_assistido")
          .delete().eq("assistido_tratamento_id", v.id).eq("status", "agendado").gte("data_sessao", today);
        if (v.quantidade_realizada === 0 && v.status === "aguardando_inicio") {
          await supabase.from("agenda_tratamentos_assistido").delete().eq("assistido_tratamento_id", v.id);
          await supabase.from("assistido_tratamentos").delete().eq("id", v.id);
        }
      }
    }

    // Create new vinculos + schedule
    const validDesignacoes = designacoes.filter((d) => d.tratamento_id && d.quantidade_total >= 1);
    const entrevistaDate = new Date(selectedEntrevista.data + "T12:00:00");

    const groupA: typeof validDesignacoes = [];
    const groupB: typeof validDesignacoes = [];
    const groupC: typeof validDesignacoes = [];

    for (const d of validDesignacoes) {
      const trat = tratamentoMap[d.tratamento_id];
      if (!trat) continue;
      const modo = trat.modo_agendamento || (trat.tratamento_livre ? "livre_concomitante" : "sequencial_bloqueante");
      if (modo === "agendado_por_data_inicial") {
        groupC.push(d);
      } else if (modo === "livre_concomitante") {
        groupB.push(d);
      } else {
        groupA.push(d);
      }
    }

    groupA.sort((a, b) => {
      const oa = tratamentoMap[a.tratamento_id]?.ordem_tratamento ?? 999;
      const ob = tratamentoMap[b.tratamento_id]?.ordem_tratamento ?? 999;
      return oa - ob;
    });

    const createSchedule = async (d: DesignacaoItem, startDate: Date): Promise<Date> => {
      const trat = tratamentoMap[d.tratamento_id];
      if (!trat) return startDate;

      const { data: vinculo, error: vErr } = await supabase.from("assistido_tratamentos").insert({
        assistido_id: selectedEntrevista!.assistido_id,
        tratamento_id: d.tratamento_id,
        quantidade_total: d.quantidade_total,
        quantidade_realizada: 0,
        status: "aguardando_inicio",
        entrevista_id: selectedEntrevista!.id,
        created_by: user!.id,
      }).select("id").single();

      if (vErr || !vinculo) return startDate;

      const sessions = generateSessionDates(
        startDate, trat.dia_semana, trat.horario,
        trat.frequencia_valor || 1, trat.frequencia_unidade || "semanas",
        d.quantidade_total
      );

      if (sessions.length > 0) {
        await supabase.from("agenda_tratamentos_assistido").insert(
          sessions.map((s) => ({
            assistido_id: selectedEntrevista!.assistido_id,
            assistido_tratamento_id: vinculo.id,
            tratamento_id: d.tratamento_id,
            data_sessao: s.data_sessao,
            horario: s.horario,
            status: "agendado",
            registrado_por: user!.id,
          })) as any
        );
        const last = sessions[sessions.length - 1];
        return addDays(new Date(last.data_sessao + "T12:00:00"), 1);
      }
      return startDate;
    };

    // Group B (libre): all start from interview date
    for (const d of groupB) await createSchedule(d, entrevistaDate);

    // Group C (agendado_por_data_inicial): start from interview date (in edit mode, no manual date available)
    for (const d of groupC) await createSchedule(d, entrevistaDate);

    // Group A (sequential): schedule ALL in chain, each starts after the previous
    if (groupA.length > 0) {
      let chainStartDate = entrevistaDate;
      for (const d of groupA) {
        chainStartDate = await createSchedule(d, chainStartDate);
      }
    }

    if (validDesignacoes.length > 0) {
      await supabase.from("assistidos").update({ status: "em_tratamento" }).eq("id", selectedEntrevista.assistido_id);
    } else {
      await supabase.from("assistidos").update({ status: "entrevistado" }).eq("id", selectedEntrevista.assistido_id);
    }

    toast({ title: "Entrevista realizada e tratamentos designados" });
    setRealizarOpen(false);
    fetchAll();
    setLoading(false);
  };

  const handleCancelar = async (id: string) => {
    await supabase.from("entrevistas_fraternas").update({ status: "cancelada" }).eq("id", id);
    toast({ title: "Entrevista cancelada" });
    fetchAll();
  };

  const filteredByTab = entrevistas.filter((e) => {
    if (tab === "agendadas") return e.status === "agendada";
    if (tab === "realizadas") return e.status === "realizada";
    if (tab === "todas") return true;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Agendamento de Entrevistas</h1>
          <p className="text-sm text-muted-foreground mt-1">Agende, remarque ou cancele entrevistas</p>
        </div>
        <Button className="gap-2" onClick={() => setAgendarOpen(true)}>
          <Plus className="h-4 w-4" />Agendar Entrevista
        </Button>
      </div>

      {/* Dialog Agendar */}
      <Dialog open={agendarOpen} onOpenChange={setAgendarOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Agendar Entrevista Fraterna</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Tipo da Entrevista</Label>
              <Select value={form.tipo_entrevista} onValueChange={(v) => setForm({ ...form, tipo_entrevista: v, assistido_id: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular (mín. {minPalestras} palestras)</SelectItem>
                  {permitirLivre && <SelectItem value="livre">Livre (sem pré-requisito)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assistido *</Label>
              <Select value={form.assistido_id} onValueChange={(v) => setForm({ ...form, assistido_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o assistido" /></SelectTrigger>
                <SelectContent>
                  {assistidosAptos.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nome} ({a.quantidade_palestras} palestras)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.tipo_entrevista === "regular" && (
                <p className="text-xs text-muted-foreground">Apenas assistidos com {minPalestras}+ palestras são exibidos</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Data e Hora *</Label>
              <Input type="datetime-local" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} />
            </div>
            <Button onClick={handleAgendar} disabled={loading} className="w-full">
              {loading ? "Agendando..." : "Agendar Entrevista"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Realizar Entrevista */}
      <Dialog open={realizarOpen} onOpenChange={setRealizarOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Realizar Entrevista Fraterna</DialogTitle></DialogHeader>
          {selectedEntrevista && (
            <div className="space-y-4 pt-2">
              <div className="rounded-lg border p-3 space-y-1">
                <p className="text-sm font-medium">{selectedEntrevista.assistido_nome}</p>
                <p className="text-xs text-muted-foreground">
                  Tipo: <Badge variant="secondary">{selectedEntrevista.tipo_entrevista === "livre" ? "Livre" : "Regular"}</Badge>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Observações da Entrevista</Label>
                <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
              </div>

              <div className="space-y-2">
                <Label>Decisões</Label>
                <Textarea value={decisoes} onChange={(e) => setDecisoes(e.target.value)} rows={2} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Designação de Tratamentos</Label>
                  <Button variant="outline" size="sm" onClick={addDesignacao} className="gap-1">
                    <Plus className="h-3 w-3" /> Adicionar
                  </Button>
                </div>

                {designacoes.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum tratamento designado. Clique em "Adicionar" para designar.</p>
                )}

                {designacoes.map((d, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Tratamento</Label>
                      <Select value={d.tratamento_id} onValueChange={(v) => updateDesignacao(idx, "tratamento_id", v)}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {tratamentos.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.nome} ({t.tipo === "espiritual" ? "Esp." : "Hol."})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-xs">Sessões</Label>
                      <Input type="number" min={1} value={d.quantidade_total} onChange={(e) => updateDesignacao(idx, "quantidade_total", parseInt(e.target.value) || 1)} />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeDesignacao(idx)} className="text-destructive shrink-0">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button onClick={handleRealizar} disabled={loading} className="w-full">
                {loading ? "Salvando..." : "Concluir Entrevista e Designar Tratamentos"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="agendadas">Agendadas</TabsTrigger>
          <TabsTrigger value="realizadas">Realizadas</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="glass-card">
        <CardContent className="pt-6">
          {filteredByTab.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Calendar className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma entrevista encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Assistido</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredByTab.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.assistido_nome}</TableCell>
                      <TableCell>{new Date(e.data).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                      <TableCell>
                        <Badge variant={e.tipo_entrevista === "livre" ? "outline" : "secondary"}>
                          {e.tipo_entrevista === "livre" ? "Livre" : "Regular"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.status === "realizada" ? "default" : e.status === "cancelada" ? "destructive" : "secondary"}>
                          {STATUS_LABELS[e.status] || e.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {e.status === "agendada" && canRealizar && (
                            <>
                              <Button variant="ghost" size="icon" title="Realizar" onClick={() => openRealizar(e)}>
                                <BookOpen className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Cancelar" onClick={() => handleCancelar(e.id)} className="text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {e.status === "agendada" && !canRealizar && (
                            <span className="text-xs text-muted-foreground">Agendada</span>
                          )}
                          {e.status === "realizada" && (
                            <>
                              <Button variant="ghost" size="icon" title="Ver" onClick={() => openRealizar(e)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Imprimir Carta" onClick={() => {
                                setCartaAssistidoId(e.assistido_id);
                                setCartaEntrevistaId(e.id);
                                setCartaOpen(true);
                              }}>
                                <Printer className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CartaAgendamento
        open={cartaOpen}
        onOpenChange={setCartaOpen}
        assistidoId={cartaAssistidoId}
        entrevistaId={cartaEntrevistaId}
      />
    </div>
  );
}
