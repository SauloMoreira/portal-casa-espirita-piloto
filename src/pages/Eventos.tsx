import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Plus, Pencil, Trash2, Star, ImageOff, MapPin } from "lucide-react";
import { validarEvento, type Evento } from "@/lib/eventos";
import {
  listEventos, createEvento, updateEvento, deleteEvento, toggleEventoAtivo,
} from "@/services/eventos";
import { supabase } from "@/integrations/supabase/client";
import { ImagemConteudoManager } from "@/components/conteudo/ImagemConteudoManager";
import type { ImagemOrigem } from "@/lib/conteudoImagem";

type FormState = {
  titulo: string;
  subtitulo: string;
  descricao_curta: string;
  descricao_completa: string;
  imagem_url: string;
  imagem_origem: ImagemOrigem;
  imagem_otimizada: boolean;
  local: string;
  data_evento: string;
  data_evento_fim: string;
  ordem: string;
  destaque: boolean;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
};

const emptyForm: FormState = {
  titulo: "", subtitulo: "", descricao_curta: "", descricao_completa: "",
  imagem_url: "", imagem_origem: "url", imagem_otimizada: false,
  local: "", data_evento: "", data_evento_fim: "",
  ordem: "0", destaque: false, data_inicio: "", data_fim: "", ativo: true,
};

/** Converte timestamptz vindo do banco para o formato de <input type="datetime-local">. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatEventoData(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Eventos() {
  const { toast } = useToast();
  const [itens, setItens] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Evento | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItens(await listEventos());
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (e: Evento) => {
    setEditing(e);
    setForm({
      titulo: e.titulo,
      subtitulo: e.subtitulo ?? "",
      descricao_curta: e.descricao_curta ?? "",
      descricao_completa: e.descricao_completa ?? "",
      imagem_url: e.imagem_url ?? "",
      imagem_origem: (e.imagem_origem as ImagemOrigem) ?? "url",
      imagem_otimizada: e.imagem_otimizada ?? false,
      local: e.local ?? "",
      data_evento: toLocalInput(e.data_evento),
      data_evento_fim: toLocalInput(e.data_evento_fim),
      ordem: e.ordem.toString(),
      destaque: e.destaque,
      data_inicio: e.data_inicio ?? "",
      data_fim: e.data_fim ?? "",
      ativo: e.ativo,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const dataEvento = form.data_evento ? new Date(form.data_evento).toISOString() : null;
    const dataEventoFim = form.data_evento_fim ? new Date(form.data_evento_fim).toISOString() : null;
    const err = validarEvento({
      titulo: form.titulo,
      data_inicio: form.data_inicio || null,
      data_fim: form.data_fim || null,
      data_evento: dataEvento,
      data_evento_fim: dataEventoFim,
    });
    if (err) { toast({ title: "Atenção", description: err, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const imagemUrl = form.imagem_url.trim() || null;
      const imagemMudou = (editing?.imagem_url ?? "") !== (imagemUrl ?? "");
      const { data: authData } = await supabase.auth.getUser();
      const payload = {
        titulo: form.titulo.trim(),
        subtitulo: form.subtitulo.trim() || null,
        descricao_curta: form.descricao_curta.trim() || null,
        descricao_completa: form.descricao_completa.trim() || null,
        imagem_url: imagemUrl,
        imagem_origem: imagemUrl ? form.imagem_origem : "url",
        imagem_otimizada: imagemUrl ? form.imagem_otimizada : false,
        imagem_atualizada_em: imagemMudou ? new Date().toISOString() : (editing?.imagem_atualizada_em ?? null),
        imagem_atualizada_por: imagemMudou ? (authData.user?.id ?? null) : (editing?.imagem_atualizada_por ?? null),
        local: form.local.trim() || null,
        data_evento: dataEvento,
        data_evento_fim: dataEventoFim,
        ordem: Number(form.ordem) || 0,
        destaque: form.destaque,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        ativo: form.ativo,
      };
      if (editing) await updateEvento(editing.id, payload);
      else await createEvento(payload);
      toast({ title: editing ? "Evento atualizado" : "Evento criado" });
      setOpen(false);
      load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEvento(id);
      toast({ title: "Evento excluído" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (e: Evento) => {
    try {
      await toggleEventoAtivo(e.id, !e.ativo);
      setItens((prev) => prev.map((x) => (x.id === e.id ? { ...x, ativo: !x.ativo } : x)));
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-screen-lg mx-auto w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" /> Eventos da Casa
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Divulgue eventos institucionais (palestras especiais, festas, encontros, mutirões). Eventos ativos e vigentes aparecem para os assistidos.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="rounded-xl">
              <Plus className="h-4 w-4 mr-1" /> Novo evento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar evento" : "Novo evento"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Festa Junina Beneficente" />
              </div>
              <div className="space-y-1.5">
                <Label>Subtítulo</Label>
                <Input value={form.subtitulo} onChange={(e) => setForm({ ...form, subtitulo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Local</Label>
                <Input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} placeholder="Ex.: Sede da casa, salão principal" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Início do evento</Label>
                  <Input type="datetime-local" value={form.data_evento} onChange={(e) => setForm({ ...form, data_evento: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Término do evento</Label>
                  <Input type="datetime-local" value={form.data_evento_fim} onChange={(e) => setForm({ ...form, data_evento_fim: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Descrição curta</Label>
                <Textarea value={form.descricao_curta} onChange={(e) => setForm({ ...form, descricao_curta: e.target.value })} rows={2} placeholder="Frase de apresentação exibida no card" />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição completa</Label>
                <Textarea value={form.descricao_completa} onChange={(e) => setForm({ ...form, descricao_completa: e.target.value })} rows={3} />
              </div>
              <ImagemConteudoManager
                tipo="evento"
                dados={{
                  titulo: form.titulo,
                  subtitulo: form.subtitulo,
                  descricao_curta: form.descricao_curta,
                  descricao_completa: form.descricao_completa,
                  local: form.local,
                }}
                value={{ url: form.imagem_url, origem: form.imagem_origem, otimizada: form.imagem_otimizada }}
                atualizadaEm={editing?.imagem_atualizada_em}
                onChange={(next) => setForm({ ...form, imagem_url: next.url, imagem_origem: next.origem, imagem_otimizada: next.otimizada })}
              />
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Início da exibição</Label>
                  <Input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fim da exibição</Label>
                  <Input type="date" value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label>Ordem de exibição</Label>
                  <Input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                  <Label className="cursor-pointer">Destaque na home</Label>
                  <Switch checked={form.destaque} onCheckedChange={(v) => setForm({ ...form, destaque: v })} />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <Label className="cursor-pointer">Evento ativo (visível para assistidos)</Label>
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Eventos cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum evento cadastrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {itens.map((e) => (
                <div key={e.id} className={`flex items-center gap-3 rounded-xl border p-3 ${e.ativo ? "border-border/60" : "border-border/40 opacity-60"}`}>
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-secondary/40 overflow-hidden flex items-center justify-center">
                    {e.imagem_url ? (
                      <img src={e.imagem_url} alt={e.titulo} className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{e.titulo}</p>
                      {e.destaque && <Badge variant="outline" className="text-[10px] gap-1"><Star className="h-3 w-3" />Destaque</Badge>}
                      {!e.ativo && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate flex items-center gap-2">
                      {e.data_evento && <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatEventoData(e.data_evento)}</span>}
                      {e.local && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{e.local}</span>}
                      {!e.data_evento && !e.local && (e.subtitulo || e.descricao_curta || "—")}
                    </p>
                  </div>
                  <Switch checked={e.ativo} onCheckedChange={() => handleToggle(e)} />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir "{e.titulo}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Para apenas ocultar do assistido, prefira inativar o evento.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(e.id)}>Excluir</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
