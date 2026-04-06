import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TIPOS_VOLUNTARIO = ["Médium", "Tarefeiro"];

interface FuncaoVoluntariado {
  id: string;
  nome_funcao: string;
  tipo_voluntario: string;
  descricao: string | null;
  status: string;
  created_by: string;
  created_at: string;
}

export default function FuncoesVoluntariado() {
  const [funcoes, setFuncoes] = useState<FuncaoVoluntariado[]>([]);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ nome_funcao: "", tipo_voluntario: "", descricao: "", status: "ativo" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchFuncoes = async () => {
    const { data } = await supabase
      .from("funcoes_voluntariado")
      .select("*")
      .order("tipo_voluntario")
      .order("nome_funcao");
    if (data) setFuncoes(data as any);
  };

  useEffect(() => { fetchFuncoes(); }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.nome_funcao.trim()) e.nome_funcao = "Obrigatório";
    if (!form.tipo_voluntario) e.tipo_voluntario = "Obrigatório";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !user) return;
    setLoading(true);

    const payload = {
      nome_funcao: form.nome_funcao.trim(),
      tipo_voluntario: form.tipo_voluntario,
      descricao: form.descricao.trim() || null,
      status: form.status,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from("funcoes_voluntariado").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("funcoes_voluntariado").insert({ ...payload, created_by: user.id }));
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editId ? "Função atualizada" : "Função cadastrada" });
      setOpen(false);
      resetForm();
      fetchFuncoes();
    }
    setLoading(false);
  };

  const resetForm = () => {
    setForm({ nome_funcao: "", tipo_voluntario: "", descricao: "", status: "ativo" });
    setEditId(null);
    setErrors({});
  };

  const openEdit = (f: FuncaoVoluntariado) => {
    setEditId(f.id);
    setForm({
      nome_funcao: f.nome_funcao,
      tipo_voluntario: f.tipo_voluntario,
      descricao: f.descricao || "",
      status: f.status,
    });
    setErrors({});
    setOpen(true);
  };

  const openNew = () => { resetForm(); setOpen(true); };

  const filtered = funcoes.filter((f) => {
    const matchSearch = !search || f.nome_funcao.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filterTipo === "todos" || f.tipo_voluntario === filterTipo;
    const matchStatus = filterStatus === "todos" || f.status === filterStatus;
    return matchSearch && matchTipo && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Funções de Voluntariado</h1>
          <p className="text-sm text-muted-foreground">Cadastro de funções e atuações por tipo de voluntário</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Nova Função
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar função..." className="pl-10" />
            </div>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Tipos</SelectItem>
                {TIPOS_VOLUNTARIO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Função</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma função encontrada</TableCell>
                </TableRow>
              ) : filtered.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.nome_funcao}</TableCell>
                  <TableCell><Badge variant="outline">{f.tipo_voluntario}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-sm">{f.descricao || "—"}</TableCell>
                  <TableCell>
                    <Badge className={f.status === "ativo" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                      {f.status === "ativo" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(f)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Função" : "Nova Função"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nome da Função *</Label>
              <Input value={form.nome_funcao} onChange={(e) => setForm({ ...form, nome_funcao: e.target.value })} placeholder="Ex: Passista, Cantina..." className={errors.nome_funcao ? "border-destructive" : ""} />
              {errors.nome_funcao && <p className="text-xs text-destructive">{errors.nome_funcao}</p>}
            </div>
            <div className="space-y-1">
              <Label>Tipo de Voluntário *</Label>
              <Select value={form.tipo_voluntario} onValueChange={(v) => setForm({ ...form, tipo_voluntario: v })}>
                <SelectTrigger className={errors.tipo_voluntario ? "border-destructive" : ""}>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_VOLUNTARIO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.tipo_voluntario && <p className="text-xs text-destructive">{errors.tipo_voluntario}</p>}
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} placeholder="Descrição opcional da função..." />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
