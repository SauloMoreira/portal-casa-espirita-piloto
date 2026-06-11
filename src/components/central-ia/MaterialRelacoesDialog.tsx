import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Brain, Stethoscope } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Relacao {
  id: string;
  queixa_id: string | null;
  tratamento_id: string | null;
  tipo_relacao: string;
  observacao: string | null;
}

interface Props {
  materialId: string | null;
  materialTitulo: string;
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Gerencia associações do material da biblioteca com queixas e tratamentos. */
export default function MaterialRelacoesDialog({ materialId, materialTitulo, isAdmin, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [relacoes, setRelacoes] = useState<Relacao[]>([]);
  const [queixas, setQueixas] = useState<{ id: string; nome_queixa: string }[]>([]);
  const [tratamentos, setTratamentos] = useState<{ id: string; nome: string }[]>([]);

  const [alvo, setAlvo] = useState<"queixa" | "tratamento">("queixa");
  const [alvoId, setAlvoId] = useState("");

  const load = useCallback(async () => {
    if (!materialId) return;
    const [{ data: rel }, { data: q }, { data: t }] = await Promise.all([
      supabase.from("ia_biblioteca_relacoes").select("*").eq("material_id", materialId),
      supabase.from("ia_queixas").select("id, nome_queixa").order("nome_queixa"),
      supabase.from("tipos_tratamento").select("id, nome").eq("status", "ativo").order("nome"),
    ]);
    setRelacoes(rel || []);
    setQueixas(q || []);
    setTratamentos(t || []);
  }, [materialId]);

  useEffect(() => { if (materialId) load(); }, [materialId, load]);

  const handleAdd = async () => {
    if (!materialId || !alvoId) return;
    const payload = {
      material_id: materialId,
      queixa_id: alvo === "queixa" ? alvoId : null,
      tratamento_id: alvo === "tratamento" ? alvoId : null,
      tipo_relacao: "apoio",
      created_by: user!.id,
    };
    const { error } = await supabase.from("ia_biblioteca_relacoes").insert(payload);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Associação criada" });
    setAlvoId("");
    load();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("ia_biblioteca_relacoes").delete().eq("id", id);
    toast({ title: "Associação removida" });
    load();
  };

  const nomeQueixa = (id: string) => queixas.find((q) => q.id === id)?.nome_queixa || "—";
  const nomeTratamento = (id: string) => tratamentos.find((t) => t.id === id)?.nome || "—";

  return (
    <Dialog open={!!materialId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Associações · {materialTitulo}</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          A biblioteca serve como apoio/contexto à IA, nunca como decisão automática.
        </p>

        {isAdmin && (
          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo</Label>
                  <Select value={alvo} onValueChange={(v) => { setAlvo(v as "queixa" | "tratamento"); setAlvoId(""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="queixa">Queixa</SelectItem>
                      <SelectItem value="tratamento">Tratamento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{alvo === "queixa" ? "Queixa" : "Tratamento"}</Label>
                  <Select value={alvoId} onValueChange={setAlvoId}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(alvo === "queixa" ? queixas : tratamentos).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {"nome_queixa" in o ? o.nome_queixa : o.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button size="sm" onClick={handleAdd} disabled={!alvoId}>
                <Plus className="h-4 w-4 mr-1" /> Associar
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="space-y-2">
          {relacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma associação cadastrada</p>
          ) : relacoes.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                {r.queixa_id ? (
                  <><Brain className="h-4 w-4 text-primary" /><Badge variant="secondary">Queixa</Badge> {nomeQueixa(r.queixa_id)}</>
                ) : (
                  <><Stethoscope className="h-4 w-4 text-primary" /><Badge variant="outline">Tratamento</Badge> {nomeTratamento(r.tratamento_id!)}</>
                )}
              </div>
              {isAdmin && (
                <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
