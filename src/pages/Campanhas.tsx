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
import { Megaphone, Plus, Pencil, Trash2, Star, ImageOff } from "lucide-react";
import { validarCampanha, type Campanha } from "@/lib/campanhas";
import {
  listCampanhas, createCampanha, updateCampanha, deleteCampanha, toggleCampanhaAtivo,
} from "@/services/campanhas";

type FormState = {
  titulo: string;
  subtitulo: string;
  descricao_curta: string;
  descricao_completa: string;
  imagem_url: string;
  ordem: string;
  destaque: boolean;
  data_inicio: string;
  data_fim: string;
  ativo: boolean;
};

const emptyForm: FormState = {
  titulo: "", subtitulo: "", descricao_curta: "", descricao_completa: "",
  imagem_url: "", ordem: "0", destaque: false, data_inicio: "", data_fim: "", ativo: true,
};

export default function Campanhas() {
  const { toast } = useToast();
  const [itens, setItens] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Campanha | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItens(await listCampanhas());
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (c: Campanha) => {
    setEditing(c);
    setForm({
      titulo: c.titulo,
      subtitulo: c.subtitulo ?? "",
      descricao_curta: c.descricao_curta ?? "",
      descricao_completa: c.descricao_completa ?? "",
      imagem_url: c.imagem_url ?? "",
      ordem: c.ordem.toString(),
      destaque: c.destaque,
      data_inicio: c.data_inicio ?? "",
      data_fim: c.data_fim ?? "",
      ativo: c.ativo,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const err = validarCampanha({ titulo: form.titulo, data_inicio: form.data_inicio || null, data_fim: form.data_fim || null });
    if (err) { toast({ title: "Atenção", description: err, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        titulo: form.titulo.trim(),
        subtitulo: form.subtitulo.trim() || null,
        descricao_curta: form.descricao_curta.trim() || null,
        descricao_completa: form.descricao_completa.trim() || null,
        imagem_url: form.imagem_url.trim() || null,
        imagem_origem: "manual",
        ordem: Number(form.ordem) || 0,
        destaque: form.destaque,
        data_inicio: form.data_inicio || null,
        data_fim: form.data_fim || null,
        ativo: form.ativo,
      };
      if (editing) await updateCampanha(editing.id, payload);
      else await createCampanha(payload);
      toast({ title: editing ? "Campanha atualizada" : "Campanha criada" });
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
      await deleteCampanha(id);
      toast({ title: "Campanha excluída" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (c: Campanha) => {
    try {
      await toggleCampanhaAtivo(c.id, !c.ativo);
      setItens((prev) => prev.map((x) => (x.id === c.id ? { ...x, ativo: !x.ativo } : x)));
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-screen-lg mx-auto w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" /> Campanhas da Casa
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Divulgue campanhas institucionais (cesta básica, doações, sócio mantenedor, sazonais). Campanhas ativas e vigentes aparecem para os assistidos.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="rounded-xl">
              <Plus className="h-4 w-4 mr-1" /> Nova campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar campanha" : "Nova campanha"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Campanha da Cesta Básica" />
              </div>
              <div className="space-y-1.5">
                <Label>Subtítulo</Label>
                <Input value={form.subtitulo} onChange={(e) => setForm({ ...form, subtitulo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição curta</Label>
                <Textarea value={form.descricao_curta} onChange={(e) => setForm({ ...form, descricao_curta: e.target.value })} rows={2} placeholder="Frase de apresentação exibida no card" />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição completa</Label>
                <Textarea value={form.descricao_completa} onChange={(e) => setForm({ ...form, descricao_completa: e.target.value })} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Imagem principal (URL)</Label>
                <Input value={form.imagem_url} onChange={(e) => setForm({ ...form, imagem_url: e.target.value })} placeholder="https://..." />
                <p className="text-[11px] text-muted-foreground">A geração de imagem com IA será adicionada em um próximo módulo.</p>
              </div>
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
                <Label className="cursor-pointer">Campanha ativa (visível para assistidos)</Label>
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
          <CardTitle className="text-base font-semibold">Campanhas cadastradas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma campanha cadastrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {itens.map((c) => (
                <div key={c.id} className={`flex items-center gap-3 rounded-xl border p-3 ${c.ativo ? "border-border/60" : "border-border/40 opacity-60"}`}>
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-secondary/40 overflow-hidden flex items-center justify-center">
                    {c.imagem_url ? (
                      <img src={c.imagem_url} alt={c.titulo} className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-muted-foreground/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{c.titulo}</p>
                      {c.destaque && <Badge variant="outline" className="text-[10px] gap-1"><Star className="h-3 w-3" />Destaque</Badge>}
                      {!c.ativo && <Badge variant="secondary" className="text-[10px]">Inativa</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {c.subtitulo || c.descricao_curta || "—"}
                    </p>
                  </div>
                  <Switch checked={c.ativo} onCheckedChange={() => handleToggle(c)} />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir "{c.titulo}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Para apenas ocultar do assistido, prefira inativar a campanha.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(c.id)}>Excluir</AlertDialogAction>
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
