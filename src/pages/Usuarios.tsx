import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Search, Users as UsersIcon, Pencil, KeyRound, MoreVertical, UserX, UserCheck, Trash2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AddressFields } from "@/components/AddressFields";
import { isValidCPF, isValidEmail, isValidPhone, maskCPF, maskPhone } from "@/lib/validators";
import { ResetPasswordDialog } from "@/components/ResetPasswordDialog";
import { DeleteUserDialog } from "@/components/DeleteUserDialog";
import { UserRolesBadges } from "@/components/UserRolesBadges";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { fetchVoluntariosOrfaosDoTenant, type VoluntarioOrfao } from "@/lib/voluntarioAcessoProvisioning";
import { useNavigate } from "react-router-dom";



// Roles are no longer editable here. Every person is born "assistido" (base role),
// and all elevated roles (operational + administrative) are managed exclusively in
// Gestão de Acesso. The order below is only used for display.
const ROLE_ORDER: Record<string, number> = {
  administrador_master: 0,
  admin: 1,
  coordenador_de_tratamento: 2,
  entrevistador: 3,
  tarefeiro: 4,
  assistido: 5,
};

const sortRoles = (rs: string[]) =>
  [...rs].sort((a, b) => (ROLE_ORDER[a] ?? 99) - (ROLE_ORDER[b] ?? 99));

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
  roles: string[];
  profile: Profile | null;
  email: string | null;
}

const emptyForm = {
  nome_completo: "", celular: "", cpf: "", email: "", password: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
  foto_url: null as string | null,
  status: "ativo",
};

type FormErrors = Partial<Record<string, string>>;

export default function Usuarios() {
  const [users, setUsers] = useState<MergedUser[]>([]);
  const [orfaos, setOrfaos] = useState<VoluntarioOrfao[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState<MergedUser | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MergedUser | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<{ user: MergedUser; toStatus: "ativo" | "inativo" } | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const { user, role } = useAuth();
  const { toast } = useToast();
  const { selecionada } = useInstituicaoAtiva();
  const navigate = useNavigate();

  const changeStatus = async (targetUserId: string, toStatus: "ativo" | "inativo", motivo?: string) => {
    setStatusBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-user", {
        body: {
          action: toStatus === "inativo" ? "inactivate" : "reactivate",
          target_user_id: targetUserId,
          motivo: motivo || null,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: data?.message || (toStatus === "inativo" ? "Usuário inativado" : "Usuário reativado") });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setStatusBusy(false);
      setStatusTarget(null);
    }
  };

  const fetchUsers = async () => {
    const [{ data: roles }, { data: profiles }, { data: emails }] = await Promise.all([
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("profiles").select("*"),
      supabase.rpc("lista_usuarios_email"),
    ]);
    if (roles) {
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const emailMap = new Map((emails || []).map((e: any) => [e.user_id, e.email]));
      // Roles are cumulative (one row per role) — group them per user so each
      // person appears once with all their roles.
      const rolesByUser = new Map<string, string[]>();
      for (const r of roles as any[]) {
        const arr = rolesByUser.get(r.user_id) || [];
        arr.push(r.role);
        rolesByUser.set(r.user_id, arr);
      }
      setUsers(Array.from(rolesByUser.entries()).map(([user_id, rs]) => ({
        user_id,
        roles: sortRoles(rs),
        profile: profileMap.get(user_id) || null,
        email: emailMap.get(user_id) || null,
      })));
    }

  };

  const fetchOrfaos = async () => {
    if (!selecionada?.id) { setOrfaos([]); return; }
    setOrfaos(await fetchVoluntariosOrfaosDoTenant(selecionada.id));
  };

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { fetchOrfaos(); }, [selecionada?.id]);

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
          role: "assistido",
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

    // Roles are NOT edited here — elevated access is managed only in Gestão de Acesso.


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
      email: u.email || "", password: "",
      cep: p?.cep || "",
      logradouro: p?.logradouro || "",
      numero: p?.numero || "",
      complemento: p?.complemento || "",
      bairro: p?.bairro || "",
      cidade: p?.cidade || "",
      estado: p?.estado || "",
      foto_url: p?.foto_url || null,
      
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
    const email = u.email?.toLowerCase() || "";
    return name.includes(s) || cpf.includes(search.replace(/\D/g, "")) || email.includes(s) || u.user_id.includes(s);
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </div>

              <div className="space-y-2">
                <Label>E-mail {editUserId ? "" : "*"}</Label>
                <Input
                  type="email"
                  value={form.email}
                  readOnly={!!editUserId}
                  onChange={editUserId ? undefined : (e) => setForm({ ...form, email: e.target.value })}
                  className={errors.email ? "border-destructive" : (editUserId ? "bg-muted/40" : "")}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
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
                  <Label>Perfis de acesso</Label>
                  {(() => {
                    const currentRoles = editUserId
                      ? (users.find((u) => u.user_id === editUserId)?.roles ?? ["assistido"])
                      : ["assistido"];
                    return <UserRolesBadges roles={currentRoles} showGroupLabels className="pt-1" />;
                  })()}
                  <p className="text-xs text-muted-foreground">
                    Acessos elevados (operacionais e administrativos) são geridos
                    exclusivamente em Gestão de Acesso.
                  </p>
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

      <Alert className="bg-primary/5 border-primary/20">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle className="text-primary">Governança de Acessos Administrativos</AlertTitle>
        <AlertDescription className="text-primary/80">
          Concessão e aprovação de privilégios administrativos são geridos em ambiente separado.{" "}
          <Link to="/governanca-acessos" className="font-semibold underline hover:text-primary">
            Ir para Governança de Acessos →
          </Link>
        </AlertDescription>
      </Alert>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome, CPF ou e-mail..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                    <TableHead className="hidden md:table-cell">E-mail</TableHead>
                    <TableHead>Acessos</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((u) => (
                    <TableRow key={u.user_id}>
                      <TableCell className="font-medium">{u.profile?.nome_completo || u.user_id.substring(0, 8) + "..."}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs">{u.profile?.cpf ? maskCPF(u.profile.cpf) : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">{u.email || "—"}</TableCell>
                      <TableCell>
                        <UserRolesBadges roles={u.roles} />
                      </TableCell>

                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={u.profile?.status === "ativo" ? "default" : "secondary"}>
                          {u.profile?.status === "ativo" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(u)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {role === "admin" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" title="Mais ações">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => { setResetTarget(u); setResetOpen(true); }}>
                                <KeyRound className="h-4 w-4 mr-2" /> Redefinir senha
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {u.profile?.status === "inativo" ? (
                                <DropdownMenuItem onClick={() => setStatusTarget({ user: u, toStatus: "ativo" })}>
                                  <UserCheck className="h-4 w-4 mr-2" /> Reativar usuário
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  disabled={u.user_id === user?.id}
                                  onClick={() => setStatusTarget({ user: u, toStatus: "inativo" })}
                                >
                                  <UserX className="h-4 w-4 mr-2" /> Inativar usuário
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                disabled={u.user_id === user?.id}
                                onClick={() => { setDeleteTarget(u); setDeleteOpen(true); }}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Excluir usuário
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {orfaos.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">Sem login / e-mail pendente</h2>
              <Badge variant="secondary">{orfaos.length}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Voluntários desta instituição sem conta de acesso. Para gerar acesso,
              informe um e-mail real na Gestão de Acesso.
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">CPF</TableHead>
                    <TableHead className="hidden md:table-cell">Celular</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="w-40 text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orfaos.map((o) => (
                    <TableRow key={o.voluntario_id}>
                      <TableCell className="font-medium">{o.nome_completo}</TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-xs">{o.cpf ? maskCPF(o.cpf) : "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{o.celular ? maskPhone(o.celular) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">
                          Sem login / e-mail pendente
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => navigate("/governanca-acessos")}>
                          <ShieldCheck className="h-4 w-4 mr-2" /> Gerar acesso
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {resetTarget && (
        <ResetPasswordDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          targetUserId={resetTarget.user_id}
          targetUserName={resetTarget.profile?.nome_completo || resetTarget.user_id.substring(0, 8)}
        />
      )}

      {deleteTarget && (
        <DeleteUserDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          targetUserId={deleteTarget.user_id}
          targetUserName={deleteTarget.profile?.nome_completo || deleteTarget.user_id.substring(0, 8)}
          onDeleted={fetchUsers}
          onInactivate={(motivo) => changeStatus(deleteTarget.user_id, "inativo", motivo)}
        />
      )}

      <AlertDialog open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.toStatus === "inativo" ? "Inativar usuário?" : "Reativar usuário?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.toStatus === "inativo" ? (
                <>
                  O usuário <span className="font-medium text-foreground">{statusTarget?.user.profile?.nome_completo || ""}</span> perderá
                  o acesso ao sistema, mas todo o histórico e os vínculos serão preservados. Esta é a ação recomendada e reversível.
                </>
              ) : (
                <>
                  O usuário <span className="font-medium text-foreground">{statusTarget?.user.profile?.nome_completo || ""}</span> voltará
                  a ter acesso ao sistema.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusBusy}
              onClick={(e) => {
                e.preventDefault();
                if (statusTarget) changeStatus(statusTarget.user.user_id, statusTarget.toStatus);
              }}
            >
              {statusBusy ? "Processando..." : statusTarget?.toStatus === "inativo" ? "Inativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
