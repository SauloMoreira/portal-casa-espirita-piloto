import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, HandHeart, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AddressFields } from "@/components/AddressFields";
import { isValidCPF, isValidEmail, isValidPhone, maskCPF, maskPhone } from "@/lib/validators";

interface Assistido {
  id: string;
  nome: string;
  cpf: string | null;
  celular: string | null;
  telefone: string | null;
  email: string | null;
  data_nascimento: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  foto_url: string | null;
  observacoes: string | null;
  status: string;
  quantidade_palestras: number;
}

const STATUS_OPTIONS = [
  { value: "aguardando_palestras", label: "Aguardando Palestras" },
  { value: "apto_para_entrevista", label: "Apto para Entrevista" },
  { value: "entrevista_agendada", label: "Entrevista Agendada" },
  { value: "entrevistado", label: "Entrevistado" },
  { value: "em_tratamento", label: "Em Tratamento" },
  { value: "concluido", label: "Concluído" },
  { value: "inativo", label: "Inativo" },
];

const statusLabel = (s: string) => STATUS_OPTIONS.find((o) => o.value === s)?.label || s;

const emptyForm = {
  nome: "", cpf: "", celular: "", email: "", data_nascimento: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  foto_url: null as string | null,
  observacoes: "", status: "aguardando_palestras", quantidade_palestras: "0",
};

type FormErrors = Partial<Record<string, string>>;

export default function Assistidos() {
  const [assistidos, setAssistidos] = useState<Assistido[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchAssistidos = async () => {
    const { data } = await supabase.from("assistidos").select("*").is("deleted_at", null).order("nome");
    if (data) setAssistidos(data as any);
  };

  useEffect(() => { fetchAssistidos(); }, []);

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!form.nome.trim()) e.nome = "Nome obrigatório";
    if (!form.cpf.trim()) e.cpf = "CPF obrigatório";
    else if (!isValidCPF(form.cpf)) e.cpf = "CPF inválido";
    if (!form.celular.trim()) e.celular = "Celular obrigatório";
    else if (!isValidPhone(form.celular)) e.celular = "Celular inválido";
    if (!form.email.trim()) e.email = "E-mail obrigatório";
    else if (!isValidEmail(form.email)) e.email = "E-mail inválido";
    if (!form.cep.trim()) e.cep = "CEP obrigatório";
    if (!form.logradouro.trim()) e.logradouro = "Logradouro obrigatório";
    if (!form.numero.trim()) e.numero = "Número obrigatório";
    if (!form.bairro.trim()) e.bairro = "Bairro obrigatório";
    if (!form.cidade.trim()) e.cidade = "Cidade obrigatória";
    if (!form.estado.trim()) e.estado = "Estado obrigatório";
    return e;
  };

  const handleSave = async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) { toast({ title: "Corrija os campos destacados", variant: "destructive" }); return; }

    setLoading(true);
    const cpfClean = form.cpf.replace(/\D/g, "");
    const payload = {
      nome: form.nome.trim(),
      cpf: cpfClean,
      celular: form.celular.replace(/\D/g, ""),
      telefone: form.celular.replace(/\D/g, ""),
      email: form.email.trim() || null,
      data_nascimento: form.data_nascimento || null,
      cep: form.cep.replace(/\D/g, ""),
      logradouro: form.logradouro.trim(),
      numero: form.numero.trim(),
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
      estado: form.estado.trim().toUpperCase(),
      foto_url: form.foto_url || null,
      observacoes: form.observacoes || null,
      status: form.status,
      quantidade_palestras: parseInt(form.quantidade_palestras) || 0,
    };

    // Check CPF uniqueness
    const cpfQuery = supabase.from("assistidos").select("id").eq("cpf", cpfClean).is("deleted_at", null);
    if (editId) cpfQuery.neq("id", editId);
    const { data: cpfExists } = await cpfQuery;
    if (cpfExists && cpfExists.length > 0) {
      setErrors({ cpf: "CPF já cadastrado" });
      toast({ title: "CPF já cadastrado para outro assistido", variant: "destructive" });
      setLoading(false);
      return;
    }

    let error;
    if (editId) {
      ({ error } = await supabase.from("assistidos").update(payload as any).eq("id", editId));
    } else {
      ({ error } = await supabase.from("assistidos").insert({ ...payload, created_by: user!.id } as any));
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editId ? "Assistido atualizado" : "Assistido cadastrado" });
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      setErrors({});
      fetchAssistidos();
    }
    setLoading(false);
  };

  const openEdit = (a: Assistido) => {
    setEditId(a.id);
    setForm({
      nome: a.nome,
      cpf: maskCPF(a.cpf || ""),
      celular: maskPhone(a.celular || a.telefone || ""),
      email: a.email || "",
      data_nascimento: a.data_nascimento || "",
      cep: a.cep || "",
      logradouro: a.logradouro || "",
      numero: a.numero || "",
      complemento: a.complemento || "",
      bairro: a.bairro || "",
      cidade: a.cidade || "",
      estado: a.estado || "",
      foto_url: a.foto_url || null,
      observacoes: a.observacoes || "",
      status: a.status,
      quantidade_palestras: a.quantidade_palestras?.toString() || "0",
    });
    setErrors({});
    setOpen(true);
  };

  const openNew = () => { setEditId(null); setForm(emptyForm); setErrors({}); setOpen(true); };

  const filtered = assistidos.filter((a) => {
    const s = search.toLowerCase();
    const matchSearch = a.nome.toLowerCase().includes(s) ||
      (a.cpf && a.cpf.includes(search.replace(/\D/g, ""))) ||
      (a.celular && a.celular.includes(search.replace(/\D/g, ""))) ||
      (a.telefone && a.telefone.includes(search));
    const matchStatus = statusFilter === "todos" || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Assistidos</h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro e acompanhamento</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={openNew}><Plus className="h-4 w-4" />Novo Assistido</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Assistido" : "Novo Assistido"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <PhotoUpload currentUrl={form.foto_url} onUrlChange={(url) => setForm({ ...form, foto_url: url })} folder="assistidos" />

              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={errors.nome ? "border-destructive" : ""} />
                {errors.nome && <p className="text-xs text-destructive">{errors.nome}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CPF *</Label>
                  <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" maxLength={14} className={errors.cpf ? "border-destructive" : ""} />
                  {errors.cpf && <p className="text-xs text-destructive">{errors.cpf}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Celular *</Label>
                  <Input value={form.celular} onChange={(e) => setForm({ ...form, celular: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} className={errors.celular ? "border-destructive" : ""} />
                  {errors.celular && <p className="text-xs text-destructive">{errors.celular}</p>}
                </div>
                <div className="space-y-2">
                  <Label>E-mail *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={errors.email ? "border-destructive" : ""} />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data de Nascimento</Label>
                  <Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Palestras Assistidas</Label>
                  <Input type="number" min={0} value={form.quantidade_palestras} onChange={(e) => setForm({ ...form, quantidade_palestras: e.target.value })} />
                </div>
              </div>

              <AddressFields
                data={{ cep: form.cep, logradouro: form.logradouro, numero: form.numero, complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, estado: form.estado }}
                onChange={(addr) => setForm({ ...form, ...addr })}
                errors={errors as any}
              />

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>

              <Button onClick={handleSave} disabled={loading} className="w-full">
                {loading ? "Salvando..." : editId ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, CPF ou celular..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Todos os status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Status</SelectItem>
                {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <HandHeart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum assistido encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">CPF</TableHead>
                    <TableHead className="hidden md:table-cell">Celular</TableHead>
                    <TableHead>Palestras</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.nome}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs">{a.cpf ? maskCPF(a.cpf) : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{a.celular ? maskPhone(a.celular) : a.telefone || "—"}</TableCell>
                      <TableCell>{a.quantidade_palestras}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === "em_tratamento" ? "default" : "secondary"} className="text-xs">
                          {statusLabel(a.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                          <Pencil className="h-4 w-4" />
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
    </div>
  );
}
