import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Heart, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface Tratamento {
  id: string;
  nome: string;
  tipo: string;
  descricao: string | null;
  dia_semana: number | null;
  horario: string | null;
  frequencia_valor: number | null;
  frequencia_unidade: string | null;
  status: string;
  observacoes: string | null;
  tarefeiro_id: string | null;
  ordem_tratamento: number | null;
  tratamento_livre: boolean;
  bloqueia_proximo_tratamento: boolean;
  trabalho_publico: boolean;
  permite_entrada_sem_agendamento: boolean;
  exige_controle_presenca: boolean;
  modo_checkin: string;
  permite_cadastro_rapido: boolean;
  permite_registro_manual: boolean;
}

const emptyForm = {
  nome: "", tipo: "espiritual", descricao: "", dia_semana: "", horario: "",
  frequencia_valor: "1", frequencia_unidade: "semanas", status: "ativo", observacoes: "", tarefeiro_id: "",
  ordem_tratamento: "", tratamento_livre: false, bloqueia_proximo_tratamento: false,
  modo_agendamento: "sequencial_bloqueante",
  quantidade_padrao_sessoes: "1",
  trabalho_publico: false, permite_entrada_sem_agendamento: false,
  exige_controle_presenca: true, modo_checkin: "qr_do_dia",
  permite_cadastro_rapido: false, permite_registro_manual: false,
};

export default function Tratamentos() {
  const [tratamentos, setTratamentos] = useState<Tratamento[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("todos");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tarefeiros, setTarefeiros] = useState<{ id: string; email: string }[]>([]);
  
  const { user } = useAuth();
  const { toast } = useToast();

  const fetchTratamentos = async () => {
    const { data } = await supabase.from("tipos_tratamento").select("*").order("nome");
    if (data) setTratamentos(data as any);
  };

  const fetchTarefeiros = async () => {
    const { data } = await supabase.from("user_roles").select("user_id").eq("role", "tarefeiro");
    if (data && data.length > 0) {
      setTarefeiros(data.map((r) => ({ id: r.user_id, email: r.user_id })));
    }
  };

  useEffect(() => { fetchTratamentos(); fetchTarefeiros(); }, []);


  const handleSave = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const qtdPadrao = parseInt(form.quantidade_padrao_sessoes);
    if (!qtdPadrao || qtdPadrao <= 0) { toast({ title: "Quantidade padrão de sessões deve ser maior que zero", variant: "destructive" }); return; }
    setLoading(true);
    const payload = {
      nome: form.nome.trim(),
      tipo: form.tipo,
      descricao: form.descricao || null,
      dia_semana: form.dia_semana ? parseInt(form.dia_semana) : null,
      horario: form.horario || null,
      frequencia_valor: parseInt(form.frequencia_valor) || 1,
      frequencia_unidade: form.frequencia_unidade,
      status: form.status,
      observacoes: form.observacoes || null,
      tarefeiro_id: form.tarefeiro_id || null,
      ordem_tratamento: form.ordem_tratamento ? parseInt(form.ordem_tratamento as string) : null,
      tratamento_livre: form.modo_agendamento === "livre_concomitante",
      bloqueia_proximo_tratamento: form.modo_agendamento === "sequencial_bloqueante",
      modo_agendamento: form.modo_agendamento,
      
      quantidade_padrao_sessoes: qtdPadrao,
      trabalho_publico: form.trabalho_publico,
      permite_entrada_sem_agendamento: form.permite_entrada_sem_agendamento,
      exige_controle_presenca: form.exige_controle_presenca,
      modo_checkin: form.modo_checkin,
      permite_cadastro_rapido: form.permite_cadastro_rapido,
      permite_registro_manual: form.permite_registro_manual,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from("tipos_tratamento").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("tipos_tratamento").insert({ ...payload, created_by: user?.id }));
    }

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editId ? "Tratamento atualizado" : "Tratamento cadastrado" });
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      fetchTratamentos();
    }
    setLoading(false);
  };

  const openEdit = (t: Tratamento) => {
    setEditId(t.id);
    setForm({
      nome: t.nome, tipo: t.tipo, descricao: t.descricao || "", dia_semana: t.dia_semana?.toString() || "",
      horario: t.horario || "", frequencia_valor: t.frequencia_valor?.toString() || "1",
      frequencia_unidade: t.frequencia_unidade || "semanas", status: t.status,
      observacoes: t.observacoes || "", tarefeiro_id: (t as any).tarefeiro_id || "",
      ordem_tratamento: t.ordem_tratamento?.toString() || "",
      tratamento_livre: t.tratamento_livre,
      bloqueia_proximo_tratamento: t.bloqueia_proximo_tratamento,
      modo_agendamento: (t as any).modo_agendamento || "sequencial_bloqueante",
      
      quantidade_padrao_sessoes: (t as any).quantidade_padrao_sessoes?.toString() || "1",
      trabalho_publico: t.trabalho_publico ?? false,
      permite_entrada_sem_agendamento: t.permite_entrada_sem_agendamento ?? false,
      exige_controle_presenca: t.exige_controle_presenca ?? true,
      modo_checkin: (t as any).modo_checkin || "qr_do_dia",
      permite_cadastro_rapido: t.permite_cadastro_rapido ?? false,
      permite_registro_manual: t.permite_registro_manual ?? false,
    });
    setOpen(true);
  };

  const openNew = () => { setEditId(null); setForm(emptyForm); setOpen(true); };

  const filtered = tratamentos.filter((t) => {
    const matchSearch = t.nome.toLowerCase().includes(search.toLowerCase());
    const matchTab = tab === "todos" || t.tipo === tab;
    return matchSearch && matchTab;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Gestão de Tratamentos</h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro e configuração dos tratamentos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={openNew}><Plus className="h-4 w-4" />Novo Tratamento</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editId ? "Editar Tratamento" : "Novo Tratamento"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="espiritual">Espiritual</SelectItem>
                      <SelectItem value="holistico">Holístico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dia da Semana</Label>
                  <Select value={form.dia_semana} onValueChange={(v) => setForm({ ...form, dia_semana: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {DIAS_SEMANA.map((d, i) => <SelectItem key={i} value={i.toString()}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input type="time" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Frequência</Label>
                  <Input type="number" min={1} value={form.frequencia_valor} onChange={(e) => setForm({ ...form, frequencia_valor: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Select value={form.frequencia_unidade} onValueChange={(v) => setForm({ ...form, frequencia_unidade: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dias">Dias</SelectItem>
                      <SelectItem value="semanas">Semanas</SelectItem>
                      <SelectItem value="meses">Meses</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={2} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Modo de Agendamento *</Label>
                  <Select value={form.modo_agendamento} onValueChange={(v) => setForm({ ...form, modo_agendamento: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="livre_concomitante">Livre / Concomitante</SelectItem>
                      <SelectItem value="sequencial_bloqueante">Sequencial Bloqueante</SelectItem>
                      <SelectItem value="agendado_por_data_inicial">Agendado por Data Inicial</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {form.modo_agendamento === "livre_concomitante" && "Ocorre em paralelo, sem depender de outros tratamentos"}
                    {form.modo_agendamento === "sequencial_bloqueante" && "Segue ordem sequencial, bloqueia o próximo até conclusão"}
                    {form.modo_agendamento === "agendado_por_data_inicial" && "Concomitante, mas agenda inicia a partir de data informada na entrevista"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Ordem do Tratamento</Label>
                  <Input type="number" min={1} value={form.ordem_tratamento} onChange={(e) => setForm({ ...form, ordem_tratamento: e.target.value })} placeholder="Ex: 1, 2, 3..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Quantidade Padrão de Sessões *</Label>
                <Input type="number" min={1} value={form.quantidade_padrao_sessoes} onChange={(e) => setForm({ ...form, quantidade_padrao_sessoes: e.target.value })} placeholder="Ex: 7" />
                <p className="text-xs text-muted-foreground">Número de sessões usado quando o entrevistador não informar a quantidade na entrevista</p>
              </div>
              <div className="space-y-2">
                <Label>Coordenação (Escopo Operacional)</Label>
                <p className="text-sm text-muted-foreground border rounded-md px-3 py-2">
                  A designação de coordenadores agora é feita na área <strong>Escopo Operacional</strong>,
                  permitindo múltiplos coordenadores por tratamento. A coordenação não concede acesso automaticamente.
                </p>
              </div>


              {/* Seção Trabalho Público */}
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-semibold">Trabalho Público</Label>
                    <p className="text-xs text-muted-foreground">Ativa o fluxo de acesso público (QR Code, cadastro rápido, etc.)</p>
                  </div>
                  <Switch checked={form.trabalho_publico} onCheckedChange={(v) => setForm({ ...form, trabalho_publico: v, ...(v ? { permite_entrada_sem_agendamento: true, permite_cadastro_rapido: true, permite_registro_manual: true } : {}) })} />
                </div>
                {form.trabalho_publico && (
                  <div className="space-y-3 pl-2 border-l-2 border-primary/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Permite entrada sem agendamento</Label>
                      <Switch checked={form.permite_entrada_sem_agendamento} onCheckedChange={(v) => setForm({ ...form, permite_entrada_sem_agendamento: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Exige controle de presença</Label>
                      <Switch checked={form.exige_controle_presenca} onCheckedChange={(v) => setForm({ ...form, exige_controle_presenca: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Permite cadastro rápido</Label>
                      <Switch checked={form.permite_cadastro_rapido} onCheckedChange={(v) => setForm({ ...form, permite_cadastro_rapido: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Permite registro manual (tarefeiro)</Label>
                      <Switch checked={form.permite_registro_manual} onCheckedChange={(v) => setForm({ ...form, permite_registro_manual: v })} />
                    </div>
                  </div>
                )}
              </div>

              <Button onClick={handleSave} disabled={loading} className="w-full">
                {loading ? "Salvando..." : editId ? "Atualizar" : "Cadastrar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList>
          <TabsTrigger value="todos">Todos ({tratamentos.length})</TabsTrigger>
          <TabsTrigger value="espiritual">Espiritual ({tratamentos.filter(t => t.tipo === "espiritual").length})</TabsTrigger>
          <TabsTrigger value="holistico">Holístico ({tratamentos.filter(t => t.tipo === "holistico").length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tratamento..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Heart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum tratamento encontrado</p>
              <p className="text-xs mt-1">Cadastre tratamentos espirituais e holísticos</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="hidden md:table-cell">Dia</TableHead>
                    <TableHead className="hidden md:table-cell">Horário</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.nome}</TableCell>
                      <TableCell>
                        <Badge variant={t.tipo === "espiritual" ? "default" : "secondary"}>
                          {t.tipo === "espiritual" ? "Espiritual" : "Holístico"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {t.dia_semana !== null ? DIAS_SEMANA[t.dia_semana] : "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{t.horario || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "ativo" ? "default" : "outline"}>
                          {t.status === "ativo" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)}>
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
