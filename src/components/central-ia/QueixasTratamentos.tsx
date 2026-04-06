import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Link2, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIAS = [
  "emocional", "familiar", "espiritual", "comportamental", "saúde relatada",
  "social", "luto/perda", "relacionamento", "ansiedade/medo", "sofrimento persistente",
];

const NIVEIS = ["baixa", "media", "alta", "critica"];

interface Queixa {
  id: string;
  nome_queixa: string;
  categoria: string;
  descricao: string | null;
  palavras_chave: string[] | null;
  sinonimos: string[] | null;
  nivel_relevancia: string;
  observacoes: string | null;
  status: string;
  created_at: string;
}

interface QueixaTratamento {
  id: string;
  queixa_id: string;
  tratamento_id: string;
  prioridade: string;
  peso: number;
  tipo_relacao: string;
  observacao_operacional: string | null;
  observacao_doutrinaria: string | null;
  status: string;
}

interface Tratamento {
  id: string;
  nome: string;
}

export default function QueixasTratamentos() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin";

  const [queixas, setQueixas] = useState<Queixa[]>([]);
  const [tratamentos, setTratamentos] = useState<Tratamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Queixa form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("emocional");
  const [descricao, setDescricao] = useState("");
  const [palavrasChave, setPalavrasChave] = useState("");
  const [sinonimos, setSinonimos] = useState("");
  const [nivelRelevancia, setNivelRelevancia] = useState("media");
  const [observacoes, setObservacoes] = useState("");

  // Vinculos
  const [showVinculos, setShowVinculos] = useState<string | null>(null);
  const [vinculos, setVinculos] = useState<QueixaTratamento[]>([]);
  const [showVinculoForm, setShowVinculoForm] = useState(false);
  const [vinculoTratId, setVinculoTratId] = useState("");
  const [vinculoPrioridade, setVinculoPrioridade] = useState("media");
  const [vinculoPeso, setVinculoPeso] = useState(5);
  const [vinculoTipo, setVinculoTipo] = useState("principal");
  const [vinculoObsOp, setVinculoObsOp] = useState("");
  const [vinculoObsDout, setVinculoObsDout] = useState("");

  const fetchQueixas = async () => {
    const { data } = await supabase.from("ia_queixas").select("*").order("nome_queixa");
    setQueixas(data || []);
    setLoading(false);
  };

  const fetchTratamentos = async () => {
    const { data } = await supabase.from("tipos_tratamento").select("id, nome").eq("status", "ativo").order("nome");
    setTratamentos(data || []);
  };

  useEffect(() => {
    fetchQueixas();
    fetchTratamentos();
  }, []);

  const resetForm = () => {
    setEditId(null);
    setNome("");
    setCategoria("emocional");
    setDescricao("");
    setPalavrasChave("");
    setSinonimos("");
    setNivelRelevancia("media");
    setObservacoes("");
  };

  const openEdit = (q: Queixa) => {
    setEditId(q.id);
    setNome(q.nome_queixa);
    setCategoria(q.categoria);
    setDescricao(q.descricao || "");
    setPalavrasChave((q.palavras_chave || []).join(", "));
    setSinonimos((q.sinonimos || []).join(", "));
    setNivelRelevancia(q.nivel_relevancia);
    setObservacoes(q.observacoes || "");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    const payload = {
      nome_queixa: nome.trim(),
      categoria,
      descricao: descricao || null,
      palavras_chave: palavrasChave.split(",").map(s => s.trim()).filter(Boolean),
      sinonimos: sinonimos.split(",").map(s => s.trim()).filter(Boolean),
      nivel_relevancia: nivelRelevancia,
      observacoes: observacoes || null,
      created_by: user!.id,
    };

    if (editId) {
      const { error } = await supabase.from("ia_queixas").update(payload).eq("id", editId);
      if (error) { toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Queixa atualizada" });
    } else {
      const { error } = await supabase.from("ia_queixas").insert(payload);
      if (error) { toast({ title: "Erro ao criar", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Queixa criada" });
    }
    setShowForm(false);
    resetForm();
    fetchQueixas();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja excluir esta queixa?")) return;
    await supabase.from("ia_queixas").delete().eq("id", id);
    toast({ title: "Queixa excluída" });
    fetchQueixas();
  };

  // Vinculos
  const openVinculos = async (queixaId: string) => {
    setShowVinculos(queixaId);
    const { data } = await supabase.from("ia_queixa_tratamento").select("*").eq("queixa_id", queixaId);
    setVinculos(data || []);
  };

  const handleSaveVinculo = async () => {
    if (!vinculoTratId || !showVinculos) return;
    const { error } = await supabase.from("ia_queixa_tratamento").insert({
      queixa_id: showVinculos,
      tratamento_id: vinculoTratId,
      prioridade: vinculoPrioridade,
      peso: vinculoPeso,
      tipo_relacao: vinculoTipo,
      observacao_operacional: vinculoObsOp || null,
      observacao_doutrinaria: vinculoObsDout || null,
      created_by: user!.id,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Vínculo criado" });
    setShowVinculoForm(false);
    setVinculoTratId("");
    setVinculoObsOp("");
    setVinculoObsDout("");
    openVinculos(showVinculos);
  };

  const handleDeleteVinculo = async (id: string) => {
    await supabase.from("ia_queixa_tratamento").delete().eq("id", id);
    toast({ title: "Vínculo removido" });
    if (showVinculos) openVinculos(showVinculos);
  };

  const filtered = queixas.filter(q =>
    q.nome_queixa.toLowerCase().includes(search.toLowerCase()) ||
    q.categoria.toLowerCase().includes(search.toLowerCase())
  );

  const nivelColor = (n: string) => {
    switch (n) {
      case "critica": return "destructive";
      case "alta": return "default";
      case "media": return "secondary";
      default: return "outline";
    }
  };

  const getNomeTratamento = (id: string) => tratamentos.find(t => t.id === id)?.nome || "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar queixa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {isAdmin && (
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nova Queixa
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queixa</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Relevância</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma queixa cadastrada</TableCell></TableRow>
              ) : filtered.map(q => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">{q.nome_queixa}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{q.categoria}</Badge></TableCell>
                  <TableCell><Badge variant={nivelColor(q.nivel_relevancia) as any} className="capitalize">{q.nivel_relevancia}</Badge></TableCell>
                  <TableCell><Badge variant={q.status === "ativo" ? "default" : "secondary"}>{q.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openVinculos(q.id)} title="Tratamentos vinculados">
                        <Link2 className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(q)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Form dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar Queixa" : "Nova Queixa"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome da queixa *</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
            <div><Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Descrição</Label><Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} /></div>
            <div><Label>Palavras-chave (separadas por vírgula)</Label><Input value={palavrasChave} onChange={e => setPalavrasChave(e.target.value)} placeholder="insônia, dormir, noite" /></div>
            <div><Label>Sinônimos (separados por vírgula)</Label><Input value={sinonimos} onChange={e => setSinonimos(e.target.value)} /></div>
            <div><Label>Nível de relevância</Label>
              <Select value={nivelRelevancia} onValueChange={setNivelRelevancia}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NIVEIS.map(n => <SelectItem key={n} value={n} className="capitalize">{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Observações internas</Label><Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter><Button onClick={handleSave}>{editId ? "Salvar" : "Criar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vinculos dialog */}
      <Dialog open={!!showVinculos} onOpenChange={v => { if (!v) { setShowVinculos(null); setShowVinculoForm(false); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tratamentos vinculados</DialogTitle>
          </DialogHeader>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setShowVinculoForm(true)}><Plus className="h-4 w-4 mr-1" /> Vincular tratamento</Button>
          )}
          {showVinculoForm && (
            <Card className="mt-2">
              <CardContent className="pt-4 space-y-3">
                <div><Label>Tratamento</Label>
                  <Select value={vinculoTratId} onValueChange={setVinculoTratId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{tratamentos.map(t => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Prioridade</Label>
                    <Select value={vinculoPrioridade} onValueChange={setVinculoPrioridade}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alta">Alta</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="baixa">Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Peso (1-10)</Label><Input type="number" min={1} max={10} value={vinculoPeso} onChange={e => setVinculoPeso(Number(e.target.value))} /></div>
                  <div><Label>Tipo</Label>
                    <Select value={vinculoTipo} onValueChange={setVinculoTipo}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="principal">Principal</SelectItem>
                        <SelectItem value="complementar">Complementar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Obs. operacional</Label><Input value={vinculoObsOp} onChange={e => setVinculoObsOp(e.target.value)} /></div>
                <div><Label>Obs. doutrinária</Label><Input value={vinculoObsDout} onChange={e => setVinculoObsDout(e.target.value)} /></div>
                <Button size="sm" onClick={handleSaveVinculo}>Salvar vínculo</Button>
              </CardContent>
            </Card>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tratamento</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Peso</TableHead>
                <TableHead>Tipo</TableHead>
                {isAdmin && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {vinculos.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Nenhum vínculo</TableCell></TableRow>
              ) : vinculos.map(v => (
                <TableRow key={v.id}>
                  <TableCell>{getNomeTratamento(v.tratamento_id)}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{v.prioridade}</Badge></TableCell>
                  <TableCell>{v.peso}</TableCell>
                  <TableCell className="capitalize">{v.tipo_relacao}</TableCell>
                  {isAdmin && (
                    <TableCell><Button variant="ghost" size="icon" onClick={() => handleDeleteVinculo(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
