import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Upload, FileText, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MaterialRelacoesDialog from "./MaterialRelacoesDialog";

const TIPOS = ["livro", "capítulo", "resumo", "manual interno", "orientação institucional", "trecho doutrinário"];
const TEMAS = [
  "oração", "vigilância", "influência espiritual", "obsessão e desobsessão", "passes",
  "evangelho no lar", "reforma íntima", "sofrimento e prova", "caridade", "equilíbrio espiritual",
  "acolhimento fraterno", "geral",
];

interface Material {
  id: string;
  titulo: string;
  autor: string | null;
  tipo_material: string;
  tema: string;
  subtitulos: string | null;
  resumo: string | null;
  arquivo_url: string | null;
  texto_indexavel: string | null;
  usar_na_ia: boolean;
  status: string;
  created_at: string;
}

export default function BibliotecaDoutrinaria() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === "admin";

  const [materiais, setMateriais] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [relacoesMaterial, setRelacoesMaterial] = useState<Material | null>(null);

  const [titulo, setTitulo] = useState("");
  const [autor, setAutor] = useState("");
  const [tipoMaterial, setTipoMaterial] = useState("livro");
  const [tema, setTema] = useState("geral");
  const [subtitulos, setSubtitulos] = useState("");
  const [resumo, setResumo] = useState("");
  const [textoIndexavel, setTextoIndexavel] = useState("");
  const [usarNaIa, setUsarNaIa] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [arquivoUrl, setArquivoUrl] = useState("");

  const fetch_ = async () => {
    const { data } = await supabase.from("ia_biblioteca").select("*").order("titulo");
    setMateriais(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const resetForm = () => {
    setEditId(null); setTitulo(""); setAutor(""); setTipoMaterial("livro");
    setTema("geral"); setSubtitulos(""); setResumo(""); setTextoIndexavel("");
    setUsarNaIa(true); setArquivoUrl("");
  };

  const openEdit = (m: Material) => {
    setEditId(m.id); setTitulo(m.titulo); setAutor(m.autor || ""); setTipoMaterial(m.tipo_material);
    setTema(m.tema); setSubtitulos(m.subtitulos || ""); setResumo(m.resumo || "");
    setTextoIndexavel(m.texto_indexavel || ""); setUsarNaIa(m.usar_na_ia); setArquivoUrl(m.arquivo_url || "");
    setShowForm(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("ia-biblioteca").upload(path, file);
    if (error) { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from("ia-biblioteca").getPublicUrl(path);
    setArquivoUrl(publicUrl);
    setUploading(false);
    toast({ title: "Arquivo enviado" });
  };

  const handleSave = async () => {
    if (!titulo.trim()) { toast({ title: "Título é obrigatório", variant: "destructive" }); return; }
    const payload = {
      titulo: titulo.trim(),
      autor: autor || null,
      tipo_material: tipoMaterial,
      tema,
      subtitulos: subtitulos || null,
      resumo: resumo || null,
      arquivo_url: arquivoUrl || null,
      texto_indexavel: textoIndexavel || null,
      usar_na_ia: usarNaIa,
      created_by: user!.id,
    };

    if (editId) {
      const { error } = await supabase.from("ia_biblioteca").update(payload).eq("id", editId);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Material atualizado" });
    } else {
      const { error } = await supabase.from("ia_biblioteca").insert(payload);
      if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Material criado" });
    }
    setShowForm(false); resetForm(); fetch_();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir material?")) return;
    await supabase.from("ia_biblioteca").delete().eq("id", id);
    toast({ title: "Material excluído" }); fetch_();
  };

  const filtered = materiais.filter(m =>
    m.titulo.toLowerCase().includes(search.toLowerCase()) ||
    m.tema.toLowerCase().includes(search.toLowerCase()) ||
    (m.autor || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar material..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {isAdmin && <Button onClick={() => { resetForm(); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" /> Novo Material</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Autor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tema</TableHead>
                <TableHead>IA</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum material cadastrado</TableCell></TableRow>
              ) : filtered.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {m.arquivo_url && <FileText className="h-4 w-4 text-primary" />}
                      {m.titulo}
                    </div>
                  </TableCell>
                  <TableCell>{m.autor || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{m.tipo_material}</Badge></TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{m.tema}</Badge></TableCell>
                  <TableCell><Badge variant={m.usar_na_ia ? "default" : "secondary"}>{m.usar_na_ia ? "Sim" : "Não"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setRelacoesMaterial(m)} title="Associações com queixas/tratamentos">
                        <Link2 className="h-4 w-4" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar Material" : "Novo Material"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Título *</Label><Input value={titulo} onChange={e => setTitulo(e.target.value)} /></div>
            <div><Label>Autor</Label><Input value={autor} onChange={e => setAutor(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo</Label>
                <Select value={tipoMaterial} onValueChange={setTipoMaterial}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tema</Label>
                <Select value={tema} onValueChange={setTema}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TEMAS.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Subtítulos</Label><Input value={subtitulos} onChange={e => setSubtitulos(e.target.value)} /></div>
            <div><Label>Resumo</Label><Textarea value={resumo} onChange={e => setResumo(e.target.value)} rows={3} /></div>
            <div><Label>Texto indexável (conteúdo para a IA consultar)</Label><Textarea value={textoIndexavel} onChange={e => setTextoIndexavel(e.target.value)} rows={4} /></div>
            <div>
              <Label>Arquivo</Label>
              <div className="flex items-center gap-2 mt-1">
                <label className="cursor-pointer">
                  <Input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.doc,.docx,.txt" />
                  <Button variant="outline" size="sm" asChild disabled={uploading}>
                    <span><Upload className="h-4 w-4 mr-1" />{uploading ? "Enviando..." : "Upload"}</span>
                  </Button>
                </label>
                {arquivoUrl && <span className="text-xs text-muted-foreground truncate max-w-[200px]">Arquivo enviado ✓</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={usarNaIa} onCheckedChange={setUsarNaIa} />
              <Label>Usar na IA</Label>
            </div>
          </div>
          <DialogFooter><Button onClick={handleSave}>{editId ? "Salvar" : "Criar"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <MaterialRelacoesDialog
        materialId={relacoesMaterial?.id ?? null}
        materialTitulo={relacoesMaterial?.titulo ?? ""}
        isAdmin={isAdmin}
        onOpenChange={(v) => { if (!v) setRelacoesMaterial(null); }}
      />
    </div>
  );
}
