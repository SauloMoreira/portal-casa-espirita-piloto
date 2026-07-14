import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Progress } from "@/components/ui/progress";
import { Megaphone, Plus, Pencil, Trash2, Users, ShieldCheck, Send, Eye, ListChecks, Rocket, ShieldAlert } from "lucide-react";
import {
  validarComunicacao, normalizarTipo, normalizarStatus,
  TIPOS, STATUS_LABEL, MENSAGEM_MAX,
  type ComunicacaoInstitucional, type ComunicacaoTipo, type ComunicacaoStatus,
} from "@/lib/comunicacaoInstitucional";
import {
  normalizarEnvioStatus, podePreparar, podeDisparar, pendentes, progressoPercentual,
  ENVIO_STATUS_LABEL, JANELA_ANTISPAM_DIAS, LOTE_PADRAO,
} from "@/lib/comunicacaoEnvio";
import {
  listComunicacoes, createComunicacao, updateComunicacao, deleteComunicacao,
  setStatusComunicacao, contarPublicoElegivel,
  prepararEnvio, dispararLote,
} from "@/services/comunicacaoInstitucional";

type FormState = {
  titulo: string;
  tipo: ComunicacaoTipo;
  mensagem: string;
};

const emptyForm: FormState = { titulo: "", tipo: "comunicado", mensagem: "" };

const statusVariant: Record<ComunicacaoStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  em_revisao: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  aprovada: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  arquivada: "bg-secondary text-muted-foreground",
};

export default function ComunicacaoInstitucional() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [itens, setItens] = useState<ComunicacaoInstitucional[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ComunicacaoInstitucional | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [elegiveis, setElegiveis] = useState<number | null>(null);
  const [revisar, setRevisar] = useState<ComunicacaoInstitucional | null>(null);
  const [enviando, setEnviando] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItens(await listComunicacoes());
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    contarPublicoElegivel().then(setElegiveis).catch(() => setElegiveis(null));
  }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (c: ComunicacaoInstitucional) => {
    setEditing(c);
    setForm({ titulo: c.titulo, tipo: normalizarTipo(c.tipo), mensagem: c.mensagem });
    setOpen(true);
  };

  const handleSave = async () => {
    const err = validarComunicacao(form);
    if (err) { toast({ title: "Atenção", description: err, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = { titulo: form.titulo.trim(), tipo: form.tipo, mensagem: form.mensagem.trim() };
      if (editing) await updateComunicacao(editing.id, payload);
      else await createComunicacao({ ...payload, status: "rascunho" });
      toast({ title: editing ? "Comunicação atualizada" : "Rascunho criado" });
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (c: ComunicacaoInstitucional, status: ComunicacaoStatus) => {
    try {
      await setStatusComunicacao(c.id, status, user?.id);
      toast({ title: `Status: ${STATUS_LABEL[status]}` });
      setRevisar(null);
      load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const refreshRevisar = async (id: string) => {
    const lista = await listComunicacoes();
    setItens(lista);
    const atual = lista.find((x) => x.id === id) ?? null;
    setRevisar(atual);
  };

  const handlePreparar = async (c: ComunicacaoInstitucional) => {
    setEnviando(true);
    try {
      const r = await prepararEnvio(c.id, JANELA_ANTISPAM_DIAS);
      toast({
        title: "Fila preparada",
        description: `${r.total} destinatário(s) na fila — ${r.bloqueados} bloqueado(s) por frequência.`,
      });
      await refreshRevisar(c.id);
    } catch (e: any) {
      toast({ title: "Erro ao preparar", description: e.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const handleDisparar = async (c: ComunicacaoInstitucional) => {
    setEnviando(true);
    try {
      const r = (await dispararLote(c.id, LOTE_PADRAO)) as {
        enviados?: number;
        falhas?: number;
        bloqueados?: number;
      };
      toast({
        title: "Lote processado",
        description: `Enviados: ${r?.enviados ?? 0} · Falhas: ${r?.falhas ?? 0} · Bloqueados: ${r?.bloqueados ?? 0}.`,
      });
      await refreshRevisar(c.id);
    } catch (e: any) {
      toast({ title: "Erro ao disparar", description: e.message, variant: "destructive" });
    } finally {
      setEnviando(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteComunicacao(id);
      toast({ title: "Comunicação excluída" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-screen-lg mx-auto w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" /> Comunicação Institucional
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Redija e revise comunicações institucionais (campanhas, eventos e comunicados).
            O envio em massa será habilitado na próxima etapa — aqui o foco é preparar e aprovar com segurança.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="rounded-xl">
              <Plus className="h-4 w-4 mr-1" /> Nova comunicação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar comunicação" : "Nova comunicação"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Convite para a Festa Junina" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as ComunicacaoTipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Mensagem *</Label>
                <Textarea
                  value={form.mensagem}
                  onChange={(e) => setForm({ ...form, mensagem: e.target.value })}
                  rows={5}
                  maxLength={MENSAGEM_MAX}
                  placeholder="Texto que será enviado aos assistidos com consentimento ativo."
                />
                <p className="text-[11px] text-muted-foreground text-right">{form.mensagem.length}/{MENSAGEM_MAX}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar rascunho"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="flex items-center gap-3 py-4">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">
              {elegiveis === null ? "—" : elegiveis} assistido(s) elegível(is)
            </p>
            <p className="text-xs text-muted-foreground">
              Com consentimento de WhatsApp ativo (versão vigente do termo) e telefone cadastrado.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Histórico de comunicações</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma comunicação criada ainda.</p>
          ) : (
            <div className="space-y-2">
              {itens.map((c) => {
                const status = normalizarStatus(c.status);
                return (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold truncate">{c.titulo}</p>
                        <Badge variant="outline" className="text-[10px] capitalize">{normalizarTipo(c.tipo)}</Badge>
                        <Badge variant="secondary" className={`text-[10px] ${statusVariant[status]}`}>{STATUS_LABEL[status]}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.mensagem}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setRevisar(c)} title="Revisar"><Eye className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir "{c.titulo}"?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(c.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Painel de revisão */}
      <Dialog open={!!revisar} onOpenChange={(o) => !o && setRevisar(null)}>
        <DialogContent className="max-w-lg">
          {revisar && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5 text-primary" /> Revisão antes do envio</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="capitalize">{normalizarTipo(revisar.tipo)}</Badge>
                  <Badge variant="secondary" className={statusVariant[normalizarStatus(revisar.status)]}>
                    {STATUS_LABEL[normalizarStatus(revisar.status)]}
                  </Badge>
                </div>
                <h3 className="text-base font-display font-bold">{revisar.titulo}</h3>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3 whitespace-pre-wrap text-sm">
                  {revisar.mensagem}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Users className="h-4 w-4" />
                  Público estimado no momento: {elegiveis ?? "—"} assistido(s) elegível(is).
                </div>
                {normalizarStatus(revisar.status) === "aprovada" && (
                  <div className="space-y-3 rounded-xl border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Send className="h-4 w-4 text-primary" /> Envio institucional (controlado)
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {ENVIO_STATUS_LABEL[normalizarEnvioStatus(revisar.envio_status)]}
                      </Badge>
                    </div>

                    <Progress value={progressoPercentual(revisar)} className="h-2" />

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      {[
                        { label: "Destinatários", value: revisar.total_destinatarios ?? 0 },
                        { label: "Enviados", value: revisar.total_enviados ?? 0 },
                        { label: "Pendentes", value: pendentes(revisar) },
                        { label: "Bloqueados", value: revisar.total_bloqueados ?? 0 },
                      ].map((m) => (
                        <div key={m.label} className="rounded-lg bg-muted/40 p-2">
                          <p className="text-sm font-bold">{m.value}</p>
                          <p className="text-[10px] text-muted-foreground">{m.label}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                      <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>
                        Envio em lotes de até {LOTE_PADRAO}, somente para quem consentiu (reconfirmado no disparo),
                        com proteção anti-spam por frequência ({JANELA_ANTISPAM_DIAS} dias) e janela 08h–20h.
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {podePreparar(revisar) && (
                        <Button size="sm" variant="outline" className="gap-1" disabled={enviando}
                          onClick={() => handlePreparar(revisar)}>
                          <ListChecks className="h-4 w-4" /> Preparar fila
                        </Button>
                      )}
                      {podeDisparar(revisar) && (
                        <Button size="sm" className="gap-1" disabled={enviando}
                          onClick={() => handleDisparar(revisar)}>
                          <Rocket className="h-4 w-4" /> {enviando ? "Processando..." : "Disparar lote"}
                        </Button>
                      )}
                      {normalizarEnvioStatus(revisar.envio_status) === "concluido" && (
                        <span className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1">
                          <ShieldCheck className="h-4 w-4" /> Envio concluído.
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
                {normalizarStatus(revisar.status) === "rascunho" && (
                  <Button onClick={() => handleStatus(revisar, "em_revisao")}>Enviar para revisão</Button>
                )}
                {normalizarStatus(revisar.status) === "em_revisao" && (
                  <>
                    <Button variant="outline" onClick={() => handleStatus(revisar, "rascunho")}>Voltar a rascunho</Button>
                    <Button className="gap-1" onClick={() => handleStatus(revisar, "aprovada")}>
                      <ShieldCheck className="h-4 w-4" /> Aprovar
                    </Button>
                  </>
                )}
                {normalizarStatus(revisar.status) === "aprovada" && (
                  <Button variant="outline" onClick={() => handleStatus(revisar, "em_revisao")}>Reabrir revisão</Button>
                )}
                {normalizarStatus(revisar.status) !== "arquivada" && (
                  <Button variant="ghost" onClick={() => handleStatus(revisar, "arquivada")}>Arquivar</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
