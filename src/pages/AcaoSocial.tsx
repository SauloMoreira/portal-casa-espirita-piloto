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
import { Apple, Plus, Pencil, Trash2, CalendarClock } from "lucide-react";
import {
  UNIDADES_ALIMENTO, validarAlimento, prazoEntregaInfo,
  type AlimentoAcaoSocial, type AcaoSocialConfig,
} from "@/lib/acaoSocial";
import {
  listAlimentos, createAlimento, updateAlimento, deleteAlimento, toggleAlimentoAtivo,
  getAcaoSocialConfig, saveAcaoSocialConfig,
} from "@/services/acaoSocial";
import { MarkdownEditorLeve } from "@/components/acaoSocial/MarkdownEditorLeve";
import { MensagemInstitucionalRenderer } from "@/components/acaoSocial/MensagemInstitucionalRenderer";
import { limparMensagemInstitucional } from "@/lib/markdownInstitucional";

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

  // Configuração do prazo de entrega do mês
  const [config, setConfig] = useState<AcaoSocialConfig | null>(null);
  const [prazoData, setPrazoData] = useState("");
  const [prazoObs, setPrazoObs] = useState("");
  const [exibirPrazo, setExibirPrazo] = useState(true);
  const [mensagem, setMensagem] = useState("");
  const [savingPrazo, setSavingPrazo] = useState(false);

  const aplicarConfig = (cfg: AcaoSocialConfig | null) => {
    setConfig(cfg);
    setPrazoData(cfg?.prazo_final_entrega?.slice(0, 10) ?? "");
    setPrazoObs(cfg?.observacao_prazo ?? "");
    setExibirPrazo(cfg?.exibir_prazo ?? true);
    setMensagem(cfg?.mensagem_institucional ?? "");
  };

  const load = async () => {
    setLoading(true);
    try {
      const [lista, cfg] = await Promise.all([listAlimentos(), getAcaoSocialConfig()]);
      setItens(lista);
      aplicarConfig(cfg);
    } catch (e: any) {
      toast({ title: "Erro ao carregar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrazo = async () => {
    setSavingPrazo(true);
    try {
      await saveAcaoSocialConfig({
        prazo_final_entrega: prazoData || null,
        observacao_prazo: prazoObs.trim() || null,
        exibir_prazo: exibirPrazo,
        mensagem_institucional: mensagem.trim() || null,
      });
      const cfg = await getAcaoSocialConfig();
      aplicarConfig(cfg);
      toast({ title: "Prazo atualizado" });
    } catch (e: any) {
      toast({ title: "Erro ao salvar prazo", description: e.message, variant: "destructive" });
    } finally {
      setSavingPrazo(false);
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

      {/* Configuração do prazo de entrega do mês */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Prazo de entrega das doações
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Defina até quando as doações podem ser entregues neste período. O prazo vale para toda
            a lista e aparece em destaque no card dos assistidos.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Prazo final de entrega</Label>
              <Input type="date" value={prazoData} onChange={(e) => setPrazoData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Observação (opcional)</Label>
              <Input
                value={prazoObs}
                onChange={(e) => setPrazoObs(e.target.value)}
                placeholder="Ex.: entregar na secretaria"
                maxLength={140}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
            <Label className="cursor-pointer">Exibir prazo no card dos assistidos</Label>
            <Switch checked={exibirPrazo} onCheckedChange={setExibirPrazo} />
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem institucional (opcional)</Label>
            <Textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={4}
              placeholder="Ex.: orientação geral sobre os alimentos doados (prazo de validade, cuidados etc.)"
            />
            <p className="text-xs text-muted-foreground">
              Aparece uma única vez no card dos assistidos. Use para orientações gerais — não
              repita o texto em cada alimento.
            </p>
          </div>
          {(() => {
            const preview = prazoEntregaInfo({
              ...(config ?? ({} as AcaoSocialConfig)),
              prazo_final_entrega: prazoData || null,
              observacao_prazo: prazoObs.trim() || null,
              exibir_prazo: exibirPrazo,
            });
            return preview ? (
              <div className="rounded-xl border border-border/50 bg-acao-social/5 px-4 py-3">
                <p className="text-xs text-muted-foreground">Prévia para o assistido:</p>
                <p className="mt-1 text-sm font-semibold text-acao-social">{preview.texto}</p>
                {preview.observacao && (
                  <p className="text-xs text-muted-foreground mt-0.5">{preview.observacao}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {exibirPrazo
                  ? "Sem prazo cadastrado — o bloco não aparece para os assistidos."
                  : "Exibição desativada — o bloco não aparece para os assistidos."}
              </p>
            );
          })()}
          <div className="flex justify-end">
            <Button onClick={handleSavePrazo} disabled={savingPrazo} className="rounded-xl">
              {savingPrazo ? "Salvando..." : "Salvar prazo"}
            </Button>
          </div>
        </CardContent>
      </Card>



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
