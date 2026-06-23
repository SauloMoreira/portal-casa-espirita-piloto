import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CalendarX, Plus, Search, Pencil, Trash2, RefreshCw } from "lucide-react";
import {
  TIPO_PROGRAMACAO_OPTIONS, STATUS_EXCECAO_OPTIONS, labelTipo, labelStatusExcecao,
} from "@/constants/programacao";
import {
  listarExcecoes, salvarExcecao, alternarAtivoExcecao, excluirExcecao,
  obterRolloutAtivo, definirRolloutAtivo, obterRolloutMonitor,
  type ExcecaoOperacional, type ExcecaoInput, type RolloutMonitor,
} from "@/services/programacao/excecoesService";
import { ShieldCheck, ShieldAlert } from "lucide-react";

const emptyForm: ExcecaoInput = {
  tipo: "publico", atividade: "", data_excecao: "", status: "cancelado",
  horario_afetado: null, nova_data: null, novo_horario: null,
  motivo: "", observacao_interna: "", mensagem_ia: "", prioridade: 0, ativo: true,
};

const statusVariant: Record<string, string> = {
  cancelado: "bg-destructive/10 text-destructive",
  remarcado: "bg-amber-500/10 text-amber-600",
  excepcional: "bg-primary/10 text-primary",
  mantido: "bg-emerald-500/10 text-emerald-600",
};

export default function ExcecoesOperacionais() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ExcecaoOperacional[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [fTipo, setFTipo] = useState<string>("all");
  const [fStatus, setFStatus] = useState<string>("all");
  const [fAtivo, setFAtivo] = useState<string>("all");
  const [fInicio, setFInicio] = useState("");
  const [fFim, setFFim] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ExcecaoInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [rolloutAtivo, setRolloutAtivo] = useState<boolean | null>(null);
  const [rolloutBusy, setRolloutBusy] = useState(false);
  const [monitor, setMonitor] = useState<RolloutMonitor | null>(null);

  const loadRollout = async () => {
    try {
      const [ativo, mon] = await Promise.all([obterRolloutAtivo(), obterRolloutMonitor(14)]);
      setRolloutAtivo(ativo);
      setMonitor(mon);
    } catch (e: any) {
      toast.error("Erro ao carregar status do rollout", { description: e.message });
    }
  };

  useEffect(() => { loadRollout(); }, []);

  const handleRolloutToggle = async (ativo: boolean) => {
    setRolloutBusy(true);
    try {
      await definirRolloutAtivo(ativo);
      setRolloutAtivo(ativo);
      toast.success(
        ativo
          ? "Notificação automática por exceção LIBERADA."
          : "Notificação automática por exceção CONTIDA (pausada).",
      );
    } catch (e: any) {
      toast.error("Erro ao alterar liberação", { description: e.message });
    } finally {
      setRolloutBusy(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await listarExcecoes({
        busca,
        tipo: fTipo === "all" ? undefined : fTipo,
        status: fStatus === "all" ? undefined : fStatus,
        ativo: fAtivo === "all" ? null : fAtivo === "ativos",
        inicio: fInicio || null,
        fim: fFim || null,
      });
      setRows(data);
    } catch (e: any) {
      toast.error("Erro ao carregar exceções", { description: e.message });
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [fTipo, fStatus, fAtivo, fInicio, fFim]);

  const set = (patch: Partial<ExcecaoInput>) => setForm((f) => ({ ...f, ...patch }));

  const openNew = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (r: ExcecaoOperacional) => {
    setEditId(r.id);
    setForm({
      tipo: r.tipo, atividade: r.atividade, data_excecao: r.data_excecao, status: r.status,
      horario_afetado: r.horario_afetado, nova_data: r.nova_data, novo_horario: r.novo_horario,
      motivo: r.motivo ?? "", observacao_interna: r.observacao_interna ?? "",
      mensagem_ia: r.mensagem_ia ?? "", prioridade: r.prioridade, ativo: r.ativo,
      tratamento_id: r.tratamento_id,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.atividade?.trim() || !form.data_excecao) {
      toast.error("Informe a atividade e a data da exceção.");
      return;
    }
    setSaving(true);
    try {
      const payload: ExcecaoInput = {
        ...form,
        horario_afetado: form.horario_afetado || null,
        nova_data: form.nova_data || null,
        novo_horario: form.novo_horario || null,
        atualizado_por: user?.id ?? null,
        ...(editId ? {} : { criado_por: user?.id ?? null }),
      };
      await salvarExcecao(payload, editId ?? undefined);
      toast.success(editId ? "Exceção atualizada." : "Exceção cadastrada.");
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error("Erro ao salvar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (r: ExcecaoOperacional) => {
    try {
      await alternarAtivoExcecao(r.id, !r.ativo);
      setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, ativo: !r.ativo } : x)));
    } catch (e: any) {
      toast.error("Erro ao atualizar status", { description: e.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await excluirExcecao(deleteId);
      toast.success("Exceção removida.");
      setRows((rs) => rs.filter((x) => x.id !== deleteId));
    } catch (e: any) {
      toast.error("Erro ao remover", { description: e.message });
    } finally {
      setDeleteId(null);
    }
  };

  const fmtData = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

  const ativas = useMemo(() => rows.filter((r) => r.ativo).length, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <CalendarX className="h-6 w-6 text-primary" /> Exceções Operacionais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alterações pontuais na programação — fonte oficial usada pela IA do WhatsApp. {ativas} ativa(s).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
          <Button size="sm" className="gap-1" onClick={openNew}>
            <Plus className="h-4 w-4" /> Nova exceção
          </Button>
        </div>
      </div>

      <Card className={`glass-card border-2 ${rolloutAtivo === false ? "border-destructive/50" : "border-primary/30"}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {rolloutAtivo === false
              ? <ShieldAlert className="h-5 w-5 text-destructive" />
              : <ShieldCheck className="h-5 w-5 text-primary" />}
            Notificação automática por exceção — liberação monitorada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {rolloutAtivo === false ? "Contida (pausada)" : "Liberada para operação real"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ao desligar, novas exceções não geram efeito na agenda nem comunicação
                (fluxo imediato e reconciliação automática pausados). Use para contenção rápida.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={rolloutAtivo === false ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"}>
                {rolloutAtivo === false ? "CONTIDO" : "LIBERADO"}
              </Badge>
              <Switch
                checked={rolloutAtivo === true}
                disabled={rolloutAtivo === null || rolloutBusy}
                onCheckedChange={handleRolloutToggle}
              />
              <Button variant="outline" size="sm" className="gap-1" onClick={loadRollout}>
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar
              </Button>
            </div>
          </div>

          {monitor && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { l: "Processadas (14d)", v: monitor.excecoes_processadas },
                { l: "Cancelamentos", v: monitor.cancelamentos },
                { l: "Remarcações", v: monitor.remarcacoes },
                { l: "Público c/ alvo", v: monitor.publico_com_alvo },
                { l: "Fallback p/ nome", v: monitor.fallback_por_nome },
                { l: "Duplicados (dedupe)", v: monitor.dedupe_duplicados, alerta: monitor.dedupe_duplicados > 0 },
                {
                  l: "Itens na fila",
                  v: Object.values(monitor.fila_por_status ?? {}).reduce((a, b) => a + Number(b), 0),
                },
              ].map((m) => (
                <div key={m.l} className={`rounded-xl border p-3 ${m.alerta ? "border-destructive/50 bg-destructive/5" : "bg-muted/30"}`}>
                  <p className={`text-xl font-bold ${m.alerta ? "text-destructive" : "text-foreground"}`}>{m.v}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{m.l}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>



      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <Label className="text-xs">Busca</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8" placeholder="Atividade ou motivo" value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {TIPO_PROGRAMACAO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {STATUS_EXCECAO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Situação</Label>
            <Select value={fAtivo} onValueChange={setFAtivo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="ativos">Ativas</SelectItem>
                <SelectItem value="inativos">Inativas</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2 lg:col-span-1">
            <div>
              <Label className="text-xs">De</Label>
              <Input type="date" value={fInicio} onChange={(e) => setFInicio(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Até</Label>
              <Input type="date" value={fFim} onChange={(e) => setFFim(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card">
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma exceção encontrada.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Atividade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Mensagem IA</TableHead>
                    <TableHead>Ativa</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{fmtData(r.data_excecao)}</TableCell>
                      <TableCell><Badge variant="secondary">{labelTipo(r.tipo)}</Badge></TableCell>
                      <TableCell className="font-medium">{r.atividade}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded ${statusVariant[r.status] || ""}`}>
                          {labelStatusExcecao(r.status)}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">
                        {r.mensagem_ia || "—"}
                      </TableCell>
                      <TableCell><Switch checked={r.ativo} onCheckedChange={() => handleToggle(r)} /></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar exceção" : "Nova exceção operacional"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => set({ tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPO_PROGRAMACAO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={(v) => set({ status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_EXCECAO_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Atividade / item afetado *</Label>
              <Input value={form.atividade ?? ""} onChange={(e) => set({ atividade: e.target.value })}
                placeholder="Ex.: Evangelhoterapia" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Data da exceção *</Label>
                <Input type="date" value={form.data_excecao ?? ""} onChange={(e) => set({ data_excecao: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Horário afetado</Label>
                <Input type="time" value={form.horario_afetado ?? ""} onChange={(e) => set({ horario_afetado: e.target.value })} />
              </div>
            </div>
            {(form.status === "remarcado") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nova data</Label>
                  <Input type="date" value={form.nova_data ?? ""} onChange={(e) => set({ nova_data: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Novo horário</Label>
                  <Input type="time" value={form.novo_horario ?? ""} onChange={(e) => set({ novo_horario: e.target.value })} />
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">Motivo</Label>
              <Input value={form.motivo ?? ""} onChange={(e) => set({ motivo: e.target.value })}
                placeholder="Ex.: jogo do Brasil na Copa" />
            </div>
            <div>
              <Label className="text-xs">Mensagem sugerida para a IA</Label>
              <Textarea value={form.mensagem_ia ?? ""} onChange={(e) => set({ mensagem_ia: e.target.value })}
                placeholder="Texto que a IA usará como base preferencial de resposta." rows={3} />
            </div>
            <div>
              <Label className="text-xs">Observação interna</Label>
              <Textarea value={form.observacao_interna ?? ""} onChange={(e) => set({ observacao_interna: e.target.value })} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label className="text-xs">Prioridade</Label>
                <Input type="number" value={String(form.prioridade ?? 0)}
                  onChange={(e) => set({ prioridade: parseInt(e.target.value || "0", 10) })} />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Switch checked={!!form.ativo} onCheckedChange={(v) => set({ ativo: v })} />
                <Label className="text-xs">Ativa</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover exceção?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
