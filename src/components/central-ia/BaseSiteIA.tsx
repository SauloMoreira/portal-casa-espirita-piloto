import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { edgeBodyError } from "@/lib/edgeFunctionResponse";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Globe, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIAS = [
  "tratamento", "institucional", "contato", "doacao",
  "campanha", "evento", "comunicado", "outros",
] as const;
const PRIORIDADES = ["alta", "media", "baixa", "condicionada"] as const;
const STATUS = ["rascunho", "ativo", "inativo"] as const;

const CAT_LABEL: Record<string, string> = {
  tratamento: "Tratamento", institucional: "Institucional", contato: "Contato",
  doacao: "Doação", campanha: "Campanha", evento: "Evento", comunicado: "Comunicado", outros: "Outros",
};

interface Documento {
  id: string;
  url: string;
  titulo: string;
  resumo: string;
  corpo: string;
  categoria: string;
  prioridade: string;
  temporal: boolean;
  data_conteudo: string | null;
  usar_na_ia: boolean;
  status: string;
  hash: string | null;
  created_at: string;
}

const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
  ativo: "default", rascunho: "secondary", inativo: "outline",
};

export default function BaseSiteIA() {
  const { toast } = useToast();

  const [docs, setDocs] = useState<Documento[]>([]);
  const [loading, setLoading] = useState(true);

  // filtros
  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroUsar, setFiltroUsar] = useState("todos");

  // captura
  const [captureUrl, setCaptureUrl] = useState("");
  const [capturing, setCapturing] = useState(false);

  // formulário
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const [resumo, setResumo] = useState("");
  const [corpo, setCorpo] = useState("");
  const [categoria, setCategoria] = useState<string>("tratamento");
  const [prioridade, setPrioridade] = useState<string>("alta");
  const [temporal, setTemporal] = useState(false);
  const [dataConteudo, setDataConteudo] = useState("");
  const [usarNaIa, setUsarNaIa] = useState(false);
  const [status, setStatus] = useState<string>("rascunho");
  const [hash, setHash] = useState<string | null>(null);

  const fetchDocs = async () => {
    const { data } = await supabase
      .from("ia_site_documentos")
      .select("*")
      .order("updated_at", { ascending: false });
    setDocs((data as Documento[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchDocs(); }, []);

  const resetForm = () => {
    setEditId(null); setUrl(""); setTitulo(""); setResumo(""); setCorpo("");
    setCategoria("tratamento"); setPrioridade("alta"); setTemporal(false);
    setDataConteudo(""); setUsarNaIa(false); setStatus("rascunho"); setHash(null);
  };

  const openEdit = (d: Documento) => {
    setEditId(d.id); setUrl(d.url); setTitulo(d.titulo); setResumo(d.resumo); setCorpo(d.corpo);
    setCategoria(d.categoria); setPrioridade(d.prioridade); setTemporal(d.temporal);
    setDataConteudo(d.data_conteudo || ""); setUsarNaIa(d.usar_na_ia); setStatus(d.status);
    setHash(d.hash);
    setShowForm(true);
  };

  const handleCapture = async () => {
    if (!captureUrl.trim()) {
      toast({ title: "Informe a URL da página", variant: "destructive" });
      return;
    }
    setCapturing(true);
    const { data, error } = await supabase.functions.invoke("ia-site-ingestao", {
      body: { url: captureUrl.trim() },
    });
    setCapturing(false);
    if (error || !data?.preview) {
      const msg = (data as any)?.error || error?.message || "Falha ao capturar a página.";
      toast({ title: "Erro na captura", description: msg, variant: "destructive" });
      return;
    }
    const p = data.preview;
    if (data.situacao === "sem_mudanca") {
      toast({ title: "Conteúdo sem alteração", description: "O conteúdo capturado é igual ao já registrado." });
    } else if (data.situacao === "atualizado") {
      toast({ title: "Conteúdo alterado", description: "A página mudou desde a última captura. Revise antes de salvar." });
    }
    resetForm();
    setEditId(data.existente?.id ?? null);
    setUrl(p.url); setTitulo(p.titulo || ""); setResumo(p.resumo || ""); setCorpo(p.corpo || "");
    setCategoria(p.categoria || "outros"); setPrioridade(p.prioridade || "media");
    setTemporal(!!p.temporal); setDataConteudo(p.data_conteudo || ""); setHash(p.hash || null);
    // Sempre nasce como rascunho fora da IA — só entra após revisão/ativação.
    setUsarNaIa(false); setStatus("rascunho");
    setShowForm(true);
    setCaptureUrl("");
  };

  const handleSave = async () => {
    if (!url.trim()) { toast({ title: "URL é obrigatória", variant: "destructive" }); return; }
    if (!titulo.trim()) { toast({ title: "Título é obrigatório", variant: "destructive" }); return; }
    const payload = {
      url: url.trim(),
      titulo: titulo.trim(),
      resumo: resumo.trim(),
      corpo: corpo.trim(),
      categoria,
      prioridade,
      temporal,
      data_conteudo: dataConteudo || null,
      usar_na_ia: usarNaIa,
      status,
      hash,
      captured_at: new Date().toISOString(),
    };
    if (editId) {
      const { error } = await supabase.from("ia_site_documentos").update(payload).eq("id", editId);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Documento atualizado" });
    } else {
      const { error } = await supabase.from("ia_site_documentos").insert(payload);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Documento salvo como rascunho" });
    }
    setShowForm(false);
    resetForm();
    fetchDocs();
  };

  const toggleUsar = async (d: Documento) => {
    const { error } = await supabase
      .from("ia_site_documentos")
      .update({ usar_na_ia: !d.usar_na_ia })
      .eq("id", d.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    fetchDocs();
  };

  const setStatusDoc = async (d: Documento, novo: string) => {
    const { error } = await supabase
      .from("ia_site_documentos")
      .update({ status: novo })
      .eq("id", d.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Documento ${novo}` });
    fetchDocs();
  };

  const handleDelete = async (d: Documento) => {
    if (!confirm(`Excluir o documento "${d.titulo}"?`)) return;
    const { error } = await supabase.from("ia_site_documentos").delete().eq("id", d.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Documento excluído" });
    fetchDocs();
  };

  const filtrados = docs.filter((d) => {
    if (filtroCategoria !== "todas" && d.categoria !== filtroCategoria) return false;
    if (filtroStatus !== "todos" && d.status !== filtroStatus) return false;
    if (filtroUsar === "sim" && !d.usar_na_ia) return false;
    if (filtroUsar === "nao" && d.usar_na_ia) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!d.titulo.toLowerCase().includes(q) && !d.url.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" /> Base de Conhecimento do Site
            </h2>
            <p className="text-sm text-muted-foreground">
              Capture páginas de <strong>www.fermarica.com.br</strong> como apoio à IA. Toda captura entra
              como rascunho e só passa a influenciar a IA após revisão e ativação.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="https://www.fermarica.com.br/..."
              value={captureUrl}
              onChange={(e) => setCaptureUrl(e.target.value)}
            />
            <Button onClick={handleCapture} disabled={capturing}>
              {capturing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Capturar página
            </Button>
            <Button variant="outline" onClick={() => { resetForm(); setShowForm(true); }}>
              Adicionar manual
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar por título/URL" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas categorias</SelectItem>
                {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                {STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtroUsar} onValueChange={setFiltroUsar}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Uso na IA</SelectItem>
                <SelectItem value="sim">Usados na IA</SelectItem>
                <SelectItem value="nao">Fora da IA</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Carregando…</p>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum documento encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título / URL</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Prioridade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Temporal</TableHead>
                    <TableHead>Usar na IA</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-[260px]">
                        <div className="font-medium truncate">{d.titulo}</div>
                        <div className="text-xs text-muted-foreground truncate">{d.url}</div>
                      </TableCell>
                      <TableCell>{CAT_LABEL[d.categoria] || d.categoria}</TableCell>
                      <TableCell className="capitalize">{d.prioridade}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[d.status] || "outline"}>{d.status}</Badge>
                      </TableCell>
                      <TableCell>{d.temporal ? "Sim" : "Não"}</TableCell>
                      <TableCell>
                        <Switch checked={d.usar_na_ia} onCheckedChange={() => toggleUsar(d)} />
                      </TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        {d.status !== "ativo" && (
                          <Button size="sm" variant="outline" onClick={() => setStatusDoc(d, "ativo")}>Ativar</Button>
                        )}
                        {d.status === "ativo" && (
                          <Button size="sm" variant="outline" onClick={() => setStatusDoc(d, "inativo")}>Inativar</Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(d)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar documento" : "Novo documento"}</DialogTitle>
            <DialogDescription>
              Revise o conteúdo extraído. Documentos só influenciam a IA quando estiverem ativos e marcados para uso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.fermarica.com.br/..." />
            </div>
            <div>
              <Label>Título</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div>
              <Label>Resumo</Label>
              <Textarea value={resumo} onChange={(e) => setResumo(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>Corpo (texto limpo)</Label>
              <Textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={6} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select value={prioridade} onValueChange={setPrioridade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data do conteúdo (opcional)</Label>
                <Input type="date" value={dataConteudo} onChange={(e) => setDataConteudo(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="cursor-pointer">Conteúdo temporal</Label>
                <p className="text-xs text-muted-foreground">Eventos/avisos com validade. Nunca vira fonte de agenda.</p>
              </div>
              <Switch checked={temporal} onCheckedChange={setTemporal} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="cursor-pointer">Usar na IA</Label>
                <p className="text-xs text-muted-foreground">Só ative após revisar o conteúdo.</p>
              </div>
              <Switch checked={usarNaIa} onCheckedChange={setUsarNaIa} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
