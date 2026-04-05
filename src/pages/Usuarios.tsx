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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Users as UsersIcon, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AddressFields } from "@/components/AddressFields";
import { isValidCPF, isValidEmail, isValidPhone, maskCPF, maskPhone } from "@/lib/validators";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  entrevistador: "Entrevistador",
  tarefeiro: "Tarefeiro",
  assistido: "Assistido",
  coordenador_de_tratamento: "Coordenador de Tratamento",
};

interface UserRow {
  user_id: string;
  role: string;
}

interface Profile {
  user_id: string;
  nome_completo: string | null;
  celular: string | null;
  cpf: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  foto_url: string | null;
  status: string;
}

interface MergedUser {
  user_id: string;
  role: string;
  profile: Profile | null;
}

const emptyForm = {
  nome_completo: "", celular: "", cpf: "", email: "", password: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  foto_url: null as string | null,
  role: "assistido", status: "ativo",
};

type FormErrors = Partial<Record<string, string>>;

export default function Usuarios() {
  const [users, setUsers] = useState<MergedUser[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchUsers = async () => {
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const { data: profiles } = await supabase.from("profiles").select("*");
    if (roles) {
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      setUsers(roles.map((r: any) => ({ ...r, profile: profileMap.get(r.user_id) || null })));
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const validate = (isNew: boolean): FormErrors => {
    const e: FormErrors = {};
    if (!form.nome_completo.trim()) e.nome_completo = "Nome obrigatório";
    if (!form.cpf.trim()) e.cpf = "CPF obrigatório";
    else if (!isValidCPF(form.cpf)) e.cpf = "CPF inválido";
    if (!form.celular.trim()) e.celular = "Celular obrigatório";
    else if (!isValidPhone(form.celular)) e.celular = "Celular inválido";
    if (isNew) {
      if (!form.email.trim()) e.email = "E-mail obrigatório";
      else if (!isValidEmail(form.email)) e.email = "E-mail inválido";
      if (!form.password.trim()) e.password = "Senha obrigatória";
      else if (form.password.length < 6) e.password = "Mínimo 6 caracteres";
    }
    if (!form.cep.trim()) e.cep = "CEP obrigatório";
    if (!form.logradouro.trim()) e.logradouro = "Logradouro obrigatório";
    if (!form.numero.trim()) e.numero = "Número obrigatório";
    if (!form.bairro.trim()) e.bairro = "Bairro obrigatório";
    if (!form.cidade.trim()) e.cidade = "Cidade obrigatória";
    if (!form.estado.trim()) e.estado = "Estado obrigatório";
    return e;
  };

  const handleCreate = async () => {
    const errs = validate(true);
    setErrors(errs);
    if (Object.keys(errs).length > 0) { toast({ title: "Corrija os campos destacados", variant: "destructive" }); return; }

    setLoading(true);
    const cpfClean = form.cpf.replace(/\D/g, "");

    // Check CPF uniqueness in profiles
    const { data: cpfExists } = await supabase.from("profiles").select("id").eq("cpf", cpfClean);
    if (cpfExists && cpfExists.length > 0) {
      setErrors({ cpf: "CPF já cadastrado" });
      toast({ title: "CPF já cadastrado para outro usuário", variant: "destructive" });
      setLoading(false);
      return;
    }

    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke("create-user", {
        body: {
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          profile: {
            nome_completo: form.nome_completo.trim(),
            celular: form.celular.replace(/\D/g, ""),
            cpf: cpfClean,
            cep: form.cep.replace(/\D/g, ""),
            logradouro: form.logradouro.trim(),
            numero: form.numero.trim(),
            complemento: form.complemento.trim() || null,
            bairro: form.bairro.trim(),
            cidade: form.cidade.trim(),
            estado: form.estado.trim().toUpperCase(),
            foto_url: form.foto_url || null,
            status: form.status,
          },
        },
      });
      if (fnError) throw fnError;
      if (fnData?.error) throw new Error(fnData.error);
      toast({ title: "Usuário criado com sucesso" });
      setOpen(false);
      setForm(emptyForm);
      setErrors({});
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleUpdate = async () => {
    if (!editUserId) return;
    const errs = validate(false);
    setErrors(errs);
    if (Object.keys(errs).length > 0) { toast({ title: "Corrija os campos destacados", variant: "destructive" }); return; }

    setLoading(true);
    const cpfClean = form.cpf.replace(/\D/g, "");

    // Check CPF uniqueness (exclude current user)
    const { data: cpfExists } = await supabase.from("profiles").select("id, user_id").eq("cpf", cpfClean);
    if (cpfExists && cpfExists.some((p: any) => p.user_id !== editUserId)) {
      setErrors({ cpf: "CPF já cadastrado" });
      toast({ title: "CPF já cadastrado para outro usuário", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Update role
    await supabase.from("user_roles").update({ role: form.role as any }).eq("user_id", editUserId);

    // Upsert profile
    const profileData = {
      user_id: editUserId,
      nome_completo: form.nome_completo.trim(),
      celular: form.celular.replace(/\D/g, ""),
      cpf: cpfClean,
      cep: form.cep.replace(/\D/g, ""),
      logradouro: form.logradouro.trim(),
      numero: form.numero.trim(),
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
      estado: form.estado.trim().toUpperCase(),
      foto_url: form.foto_url || null,
      status: form.status,
    };

    const { data: existing } = await supabase.from("profiles").select("id").eq("user_id", editUserId);
    if (existing && existing.length > 0) {
      await supabase.from("profiles").update(profileData as any).eq("user_id", editUserId);
    } else {
      await supabase.from("profiles").insert({ ...profileData, created_by: user!.id } as any);
    }

    toast({ title: "Usuário atualizado" });
    setOpen(false);
    setErrors({});
    fetchUsers();
    setLoading(false);
  };

  const openEdit = (u: MergedUser) => {
    setEditUserId(u.user_id);
    const p = u.profile;
    setForm({
      nome_completo: p?.nome_completo || "",
      celular: maskPhone(p?.celular || ""),
      cpf: maskCPF(p?.cpf || ""),
      email: "", password: "",
      cep: p?.cep || "",
      logradouro: p?.logradouro || "",
      numero: p?.numero || "",
      complemento: p?.complemento || "",
      bairro: p?.bairro || "",
      cidade: p?.cidade || "",
      estado: p?.estado || "",
      foto_url: p?.foto_url || null,
      role: u.role,
      status: p?.status || "ativo",
    });
    setErrors({});
    setOpen(true);
  };

  const openNew = () => { setEditUserId(null); setForm(emptyForm); setErrors({}); setOpen(true); };

  const filtered = users.filter((u) => {
    const s = search.toLowerCase();
    const name = u.profile?.nome_completo?.toLowerCase() || "";
    const cpf = u.profile?.cpf || "";
    return name.includes(s) || cpf.includes(search.replace(/\D/g, "")) || u.user_id.includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Gestão de Usuários</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerenciar acesso ao sistema</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={openNew}><Plus className="h-4 w-4" />Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editUserId ? "Editar Usuário" : "Novo Usuário"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <PhotoUpload currentUrl={form.foto_url} onUrlChange={(url) => setForm({ ...form, foto_url: url })} folder="usuarios" />

              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} className={errors.nome_completo ? "border-destructive" : ""} />
                {errors.nome_completo && <p className="text-xs text-destructive">{errors.nome_completo}</p>}
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
                {!editUserId && (
                  <div className="space-y-2">
                    <Label>E-mail *</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={errors.email ? "border-destructive" : ""} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                  </div>
                )}
              </div>

              {!editUserId && (
                <div className="space-y-2">
                  <Label>Senha *</Label>
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={errors.password ? "border-destructive" : ""} />
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>
              )}

              <AddressFields
                data={{ cep: form.cep, logradouro: form.logradouro, numero: form.numero, complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, estado: form.estado }}
                onChange={(addr) => setForm({ ...form, ...addr })}
                errors={errors as any}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Perfil *</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button onClick={editUserId ? handleUpdate : handleCreate} disabled={loading} className="w-full">
                {loading ? "Salvando..." : editUserId ? "Atualizar" : "Criar Usuário"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <UsersIcon className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum usuário cadastrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">CPF</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.profile?.nome_completo || u.user_id.substring(0, 8) + "..."}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs">{u.profile?.cpf ? maskCPF(u.profile.cpf) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="default">{ROLE_LABELS[u.role] || u.role}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={u.profile?.status === "ativo" ? "default" : "secondary"}>
                          {u.profile?.status === "ativo" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
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
