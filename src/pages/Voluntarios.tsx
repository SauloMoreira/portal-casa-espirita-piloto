import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Pencil, FileText, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PhotoUpload } from "@/components/PhotoUpload";
import { AddressFields } from "@/components/AddressFields";
import { isValidCPF, isValidEmail, isValidPhone, maskCPF, maskPhone } from "@/lib/validators";
import { TermoAdesao } from "@/components/voluntarios/TermoAdesao";
import { FichaVoluntario } from "@/components/voluntarios/FichaVoluntario";

const STATUS_LABELS: Record<string, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  afastado: "Afastado",
  desligado: "Desligado",
};

const STATUS_COLORS: Record<string, string> = {
  ativo: "bg-green-100 text-green-800",
  inativo: "bg-gray-100 text-gray-800",
  afastado: "bg-yellow-100 text-yellow-800",
  desligado: "bg-red-100 text-red-800",
};

const TIPOS_VOLUNTARIO = ["Médium", "Tarefeiro"];

interface FuncaoVoluntariado {
  id: string;
  nome_funcao: string;
  tipo_voluntario: string;
  status: string;
}

interface Voluntario {
  id: string;
  nome_completo: string;
  celular: string;
  cpf: string;
  email: string;
  rg: string | null;
  data_nascimento: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  foto_url: string | null;
  data_ingresso_sistema: string;
  data_adesao_voluntariado: string | null;
  tipos_voluntario: string[];
  atuacao_detalhada: string | null;
  status: string;
  data_desligamento: string | null;
  observacoes: string | null;
  created_by: string;
  created_at: string;
  funcoes?: string[]; // loaded separately
}

const emptyForm = {
  nome_completo: "",
  celular: "",
  cpf: "",
  email: "",
  rg: "",
  data_nascimento: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  foto_url: null as string | null,
  data_ingresso_sistema: new Date().toISOString().split("T")[0],
  data_adesao_voluntariado: "",
  tipos_voluntario: [] as string[],
  funcoes_ids: [] as string[],
  atuacao_detalhada: "",
  status: "ativo",
  data_desligamento: "",
  observacoes: "",
};

type FormErrors = Partial<Record<string, string>>;

export default function Voluntarios() {
  const [voluntarios, setVoluntarios] = useState<Voluntario[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterTipo, setFilterTipo] = useState("todos");
  const [filterFuncao, setFilterFuncao] = useState("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [termoOpen, setTermoOpen] = useState(false);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [selectedVoluntario, setSelectedVoluntario] = useState<Voluntario | null>(null);
  const [instData, setInstData] = useState<any>(null);
  const [allFuncoes, setAllFuncoes] = useState<FuncaoVoluntariado[]>([]);
  const [voluntarioFuncoesMap, setVoluntarioFuncoesMap] = useState<Record<string, string[]>>({});
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchFuncoes = async () => {
    const { data } = await supabase.from("funcoes_voluntariado").select("*").eq("status", "ativo").order("tipo_voluntario").order("nome_funcao");
    if (data) setAllFuncoes(data as any);
  };

  const fetchVoluntarioFuncoes = async () => {
    const { data } = await supabase.from("voluntario_funcoes").select("voluntario_id, funcao_id");
    if (data) {
      const map: Record<string, string[]> = {};
      data.forEach((r: any) => {
        if (!map[r.voluntario_id]) map[r.voluntario_id] = [];
        map[r.voluntario_id].push(r.funcao_id);
      });
      setVoluntarioFuncoesMap(map);
    }
  };

  const fetchVoluntarios = async () => {
    const { data } = await supabase
      .from("voluntarios")
      .select("*")
      .order("nome_completo");
    if (data) setVoluntarios(data as any);
  };

  const fetchInst = async () => {
    const { data } = await supabase.from("instituicao_config").select("*").limit(1);
    if (data && data.length > 0) setInstData(data[0]);
  };

  useEffect(() => {
    fetchVoluntarios();
    fetchInst();
    fetchFuncoes();
    fetchVoluntarioFuncoes();
  }, []);

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.nome_completo.trim()) e.nome_completo = "Obrigatório";
    if (!form.celular.trim()) e.celular = "Obrigatório";
    else if (!isValidPhone(form.celular)) e.celular = "Celular inválido";
    if (!form.cpf.trim()) e.cpf = "Obrigatório";
    else if (!isValidCPF(form.cpf)) e.cpf = "CPF inválido";
    if (!form.email.trim()) e.email = "Obrigatório";
    else if (!isValidEmail(form.email)) e.email = "E-mail inválido";
    if (!form.data_nascimento) e.data_nascimento = "Obrigatório";
    if (!form.data_ingresso_sistema) e.data_ingresso_sistema = "Obrigatório";
    if (!form.cep.trim()) e.cep = "Obrigatório";
    if (!form.logradouro.trim()) e.logradouro = "Obrigatório";
    if (!form.numero.trim()) e.numero = "Obrigatório";
    if (!form.bairro.trim()) e.bairro = "Obrigatório";
    if (!form.cidade.trim()) e.cidade = "Obrigatório";
    if (!form.estado.trim()) e.estado = "Obrigatório";
    if (form.tipos_voluntario.length === 0) e.tipos_voluntario = "Selecione pelo menos um tipo";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate() || !user) return;
    setLoading(true);
    const cpfClean = form.cpf.replace(/\D/g, "");

    // Check CPF duplicate
    let query = supabase.from("voluntarios").select("id").eq("cpf", cpfClean);
    if (editId) query = query.neq("id", editId);
    const { data: existing } = await query;
    if (existing && existing.length > 0) {
      setErrors({ cpf: "CPF já cadastrado" });
      setLoading(false);
      return;
    }

    const payload = {
      nome_completo: form.nome_completo.trim(),
      celular: form.celular.replace(/\D/g, ""),
      cpf: cpfClean,
      email: form.email.trim().toLowerCase(),
      rg: form.rg.trim() || null,
      data_nascimento: form.data_nascimento,
      cep: form.cep.replace(/\D/g, ""),
      logradouro: form.logradouro.trim(),
      numero: form.numero.trim(),
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim(),
      cidade: form.cidade.trim(),
      estado: form.estado.trim().toUpperCase(),
      foto_url: form.foto_url,
      data_ingresso_sistema: form.data_ingresso_sistema,
      data_adesao_voluntariado: form.data_adesao_voluntariado || null,
      tipos_voluntario: form.tipos_voluntario,
      atuacao_detalhada: form.atuacao_detalhada.trim() || null,
      status: form.status,
      data_desligamento: form.data_desligamento || null,
      observacoes: form.observacoes.trim() || null,
    };

    let error;
    let savedId = editId;
    if (editId) {
      ({ error } = await supabase.from("voluntarios").update(payload).eq("id", editId));
    } else {
      const res = await supabase.from("voluntarios").insert({ ...payload, created_by: user.id }).select("id").single();
      error = res.error;
      if (res.data) savedId = res.data.id;
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else if (savedId) {
      // Save funcoes
      await supabase.from("voluntario_funcoes").delete().eq("voluntario_id", savedId);
      if (form.funcoes_ids.length > 0) {
        await supabase.from("voluntario_funcoes").insert(
          form.funcoes_ids.map((fid) => ({ voluntario_id: savedId!, funcao_id: fid }))
        );
      }
      toast({ title: editId ? "Voluntário atualizado" : "Voluntário cadastrado" });
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      fetchVoluntarios();
      fetchVoluntarioFuncoes();
    }
    setLoading(false);
  };

  const openEdit = async (v: Voluntario) => {
    setEditId(v.id);
    // Load this volunteer's funcoes
    const { data: vfData } = await supabase.from("voluntario_funcoes").select("funcao_id").eq("voluntario_id", v.id);
    const funcIds = vfData ? vfData.map((r: any) => r.funcao_id) : [];
    setForm({
      nome_completo: v.nome_completo,
      celular: maskPhone(v.celular),
      cpf: maskCPF(v.cpf),
      email: v.email,
      rg: v.rg || "",
      data_nascimento: v.data_nascimento,
      cep: v.cep,
      logradouro: v.logradouro,
      numero: v.numero,
      complemento: v.complemento || "",
      bairro: v.bairro,
      cidade: v.cidade,
      estado: v.estado,
      foto_url: v.foto_url,
      data_ingresso_sistema: v.data_ingresso_sistema,
      data_adesao_voluntariado: v.data_adesao_voluntariado || "",
      tipos_voluntario: v.tipos_voluntario || [],
      funcoes_ids: funcIds,
      atuacao_detalhada: v.atuacao_detalhada || "",
      status: v.status,
      data_desligamento: v.data_desligamento || "",
      observacoes: v.observacoes || "",
    });
    setErrors({});
    setOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setErrors({});
    setOpen(true);
  };

  // Helper: get funcao names for a voluntario
  const getFuncaoNames = (volId: string) => {
    const ids = voluntarioFuncoesMap[volId] || [];
    return allFuncoes.filter((f) => ids.includes(f.id)).map((f) => f.nome_funcao);
  };

  // Filtered funcoes for form (based on selected tipos_voluntario)
  const availableFuncoes = allFuncoes.filter((f) => form.tipos_voluntario.includes(f.tipo_voluntario));

  const filtered = voluntarios.filter((v) => {
    const searchLower = search.toLowerCase();
    const matchesSearch =
      !search ||
      v.nome_completo.toLowerCase().includes(searchLower) ||
      v.cpf.includes(search.replace(/\D/g, "")) ||
      v.celular.includes(search.replace(/\D/g, "")) ||
      v.email.toLowerCase().includes(searchLower);
    const matchesStatus = filterStatus === "todos" || v.status === filterStatus;
    const matchesTipo =
      filterTipo === "todos" || (v.tipos_voluntario && v.tipos_voluntario.includes(filterTipo));
    const matchesFuncao =
      filterFuncao === "todos" || (voluntarioFuncoesMap[v.id] || []).includes(filterFuncao);
    return matchesSearch && matchesStatus && matchesTipo && matchesFuncao;
  });

  const toggleTipo = (tipo: string) => {
    setForm((prev) => ({
      ...prev,
      tipos_voluntario: prev.tipos_voluntario.includes(tipo)
        ? prev.tipos_voluntario.filter((t) => t !== tipo)
        : [...prev.tipos_voluntario, tipo],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Voluntários</h1>
          <p className="text-sm text-muted-foreground">Cadastro e gestão de voluntários da instituição</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Voluntário
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, CPF, celular ou e-mail..."
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
                <SelectItem value="afastado">Afastado</SelectItem>
                <SelectItem value="desligado">Desligado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS_VOLUNTARIO.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterFuncao} onValueChange={setFilterFuncao}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as Funções</SelectItem>
                {allFuncoes.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome_funcao} ({f.tipo_voluntario})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="hidden md:table-cell">CPF</TableHead>
                <TableHead className="hidden md:table-cell">Celular</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Ingresso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Nenhum voluntário encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.nome_completo}</TableCell>
                    <TableCell className="hidden md:table-cell">{maskCPF(v.cpf)}</TableCell>
                    <TableCell className="hidden md:table-cell">{maskPhone(v.celular)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {(v.tipos_voluntario || []).map((t) => (
                          <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[v.status] || ""}>{STATUS_LABELS[v.status] || v.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {v.data_ingresso_sistema ? new Date(v.data_ingresso_sistema + "T12:00:00").toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(v)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setSelectedVoluntario(v); setFichaOpen(true); }} title="Ficha">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setSelectedVoluntario(v); setTermoOpen(true); }} title="Termo de Adesão">
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cadastro/Edição Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Voluntário" : "Novo Voluntário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Foto */}
            <div className="flex justify-center">
              <PhotoUpload
                currentUrl={form.foto_url}
                onUrlChange={(url) => setForm({ ...form, foto_url: url })}
                folder="voluntarios"
              />
            </div>

            {/* Dados pessoais */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Dados Pessoais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label>Nome Completo *</Label>
                  <Input value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} className={errors.nome_completo ? "border-destructive" : ""} />
                  {errors.nome_completo && <p className="text-xs text-destructive">{errors.nome_completo}</p>}
                </div>
                <div className="space-y-1">
                  <Label>CPF *</Label>
                  <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" maxLength={14} className={errors.cpf ? "border-destructive" : ""} />
                  {errors.cpf && <p className="text-xs text-destructive">{errors.cpf}</p>}
                </div>
                <div className="space-y-1">
                  <Label>RG</Label>
                  <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Celular *</Label>
                  <Input value={form.celular} onChange={(e) => setForm({ ...form, celular: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" maxLength={15} className={errors.celular ? "border-destructive" : ""} />
                  {errors.celular && <p className="text-xs text-destructive">{errors.celular}</p>}
                </div>
                <div className="space-y-1">
                  <Label>E-mail *</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={errors.email ? "border-destructive" : ""} />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Data de Nascimento *</Label>
                  <Input type="date" value={form.data_nascimento} onChange={(e) => setForm({ ...form, data_nascimento: e.target.value })} className={errors.data_nascimento ? "border-destructive" : ""} />
                  {errors.data_nascimento && <p className="text-xs text-destructive">{errors.data_nascimento}</p>}
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Endereço</h3>
              <AddressFields
                data={{ cep: form.cep, logradouro: form.logradouro, numero: form.numero, complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, estado: form.estado }}
                onChange={(addr) => setForm({ ...form, ...addr })}
                errors={errors as any}
              />
            </div>

            {/* Voluntariado */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Voluntariado</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Data de Ingresso no Sistema *</Label>
                  <Input type="date" value={form.data_ingresso_sistema} onChange={(e) => setForm({ ...form, data_ingresso_sistema: e.target.value })} className={errors.data_ingresso_sistema ? "border-destructive" : ""} />
                  {errors.data_ingresso_sistema && <p className="text-xs text-destructive">{errors.data_ingresso_sistema}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Data de Adesão ao Voluntariado</Label>
                  <Input type="date" value={form.data_adesao_voluntariado} onChange={(e) => setForm({ ...form, data_adesao_voluntariado: e.target.value })} />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Tipo de Voluntário *</Label>
                  <div className="flex gap-4">
                    {TIPOS_VOLUNTARIO.map((tipo) => (
                      <div key={tipo} className="flex items-center gap-2">
                        <Checkbox
                          checked={form.tipos_voluntario.includes(tipo)}
                          onCheckedChange={() => toggleTipo(tipo)}
                        />
                        <span className="text-sm">{tipo}</span>
                      </div>
                    ))}
                  </div>
                  {errors.tipos_voluntario && <p className="text-xs text-destructive">{errors.tipos_voluntario}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {form.status === "desligado" && (
                  <div className="space-y-1">
                    <Label>Data de Desligamento</Label>
                    <Input type="date" value={form.data_desligamento} onChange={(e) => setForm({ ...form, data_desligamento: e.target.value })} />
                  </div>
                )}
                <div className="sm:col-span-2 space-y-1">
                  <Label>Função / Atuação Detalhada</Label>
                  <Textarea value={form.atuacao_detalhada} onChange={(e) => setForm({ ...form, atuacao_detalhada: e.target.value })} placeholder="Descreva a atuação do voluntário..." rows={2} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label>Observações</Label>
                  <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Salvando..." : editId ? "Salvar Alterações" : "Cadastrar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Termo de Adesão */}
      {selectedVoluntario && (
        <TermoAdesao
          open={termoOpen}
          onClose={() => setTermoOpen(false)}
          voluntario={selectedVoluntario}
          instituicao={instData}
        />
      )}

      {/* Ficha do Voluntário */}
      {selectedVoluntario && (
        <FichaVoluntario
          open={fichaOpen}
          onClose={() => setFichaOpen(false)}
          voluntario={selectedVoluntario}
        />
      )}
    </div>
  );
}
