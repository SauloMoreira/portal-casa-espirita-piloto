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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Apple, Plus, Pencil, Trash2 } from "lucide-react";
import { UNIDADES_ALIMENTO, validarAlimento, type AlimentoAcaoSocial } from "@/lib/acaoSocial";
import {
  listAlimentos, createAlimento, updateAlimento, deleteAlimento, toggleAlimentoAtivo,
} from "@/services/acaoSocial";

type FormState = {
  nome: string;
  unidade: string;
  quantidade_necessaria: string;
  quantidade_faltante: string;
  observacao: string;
  ordem: string;
  ativo: boolean;
};

const emptyForm: FormState = {
  nome: "", unidade: "", quantidade_necessaria: "", quantidade_faltante: "",
  observacao: "", ordem: "0", ativo: true,
};

export default function AcaoSocial() {
  const { toast } = useToast();
  const [itens, setItens] = useState<AlimentoAcaoSocial[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AlimentoAcaoSocial | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItens(await listAlimentos());
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (it: AlimentoAcaoSocial) => {
    setEditing(it);
    setForm({
      nome: it.nome,
      unidade: it.unidade ?? "",
      quantidade_necessaria: it.quantidade_necessaria?.toString() ?? "",
      quantidade_faltante: it.quantidade_faltante?.toString() ?? "",
      observacao: it.observacao ?? "",
      ordem: it.ordem.toString(),
      ativo: it.ativo,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const err = validarAlimento({ nome: form.nome });
    if (err) { toast({ title: "Atenção", description: err, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        unidade: form.unidade || null,
        quantidade_necessaria: form.quantidade_necessaria ? Number(form.quantidade_necessaria) : null,
        quantidade_faltante: form.quantidade_faltante ? Number(form.quantidade_faltante) : null,
        observacao: form.observacao.trim() || null,
        ordem: Number(form.ordem) || 0,
        ativo: form.ativo,
      };
      if (editing) await updateAlimento(editing.id, payload);
      else await createAlimento(payload);
      toast({ title: editing ? "Item atualizado" : "Item criado" });
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
      await deleteAlimento(id);
      toast({ title: "Item excluído" });
      load();
    } catch (e: any) {
      toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" });
    }
  };

  const handleToggle = async (it: AlimentoAcaoSocial) => {
    try {
      await toggleAlimentoAtivo(it.id, !it.ativo);
      setItens((prev) => prev.map((x) => (x.id === it.id ? { ...x, ativo: !x.ativo } : x)));
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 max-w-screen-lg mx-auto w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Apple className="h-6 w-6 text-primary" /> Ação Social — Lista de Alimentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Defina os alimentos que mais precisamos no momento. Itens ativos aparecem para os assistidos.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="rounded-xl">
              <Plus className="h-4 w-4 mr-1" /> Novo item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar item" : "Novo item"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nome do alimento *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Arroz" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Unidade</Label>
                  <Select value={form.unidade || "none"} onValueChange={(v) => setForm({ ...form, unidade: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— sem unidade —</SelectItem>
                      {UNIDADES_ALIMENTO.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ordem / prioridade</Label>
                  <Input type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Qtd. necessária</Label>
                  <Input type="number" value={form.quantidade_necessaria} onChange={(e) => setForm({ ...form, quantidade_necessaria: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Qtd. faltante</Label>
                  <Input type="number" value={form.quantidade_faltante} onChange={(e) => setForm({ ...form, quantidade_faltante: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Observação (opcional)</Label>
                <Textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} rows={2} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <Label className="cursor-pointer">Item ativo (visível para assistidos)</Label>
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
          <CardTitle className="text-base font-semibold">Itens cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum item cadastrado ainda.</p>
          ) : (
            <div className="space-y-2">
              {itens.map((it) => (
                <div key={it.id} className={`flex items-center gap-3 rounded-xl border p-3 ${it.ativo ? "border-border/60" : "border-border/40 opacity-60"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold truncate">{it.nome}</p>
                      {!it.ativo && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                      <Badge variant="outline" className="text-[10px]">ordem {it.ordem}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {it.quantidade_faltante != null ? `Faltam ${it.quantidade_faltante}${it.unidade ? " " + it.unidade : ""}` : "Sem quantidade definida"}
                      {it.observacao ? ` · ${it.observacao}` : ""}
                    </p>
                  </div>
                  <Switch checked={it.ativo} onCheckedChange={() => handleToggle(it)} />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(it)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir "{it.nome}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Para apenas ocultar do assistido, prefira inativar o item.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(it.id)}>Excluir</AlertDialogAction>
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
