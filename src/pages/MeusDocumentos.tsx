import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Printer, Eye, Heart } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CartaAgendamento } from "@/components/CartaAgendamento";

interface DocItem {
  assistidoTratamentoIds: string[];
  entrevistaId: string | null;
  label: string;
  dataEntrevista: string | null;
  tratamentos: string[];
}

export default function MeusDocumentos() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [assistidoId, setAssistidoId] = useState<string>("");
  const [cartaOpen, setCartaOpen] = useState(false);
  const [cartaEntrevistaId, setCartaEntrevistaId] = useState<string | undefined>();
  const [cartaVinculoIds, setCartaVinculoIds] = useState<string[]>([]);

  useEffect(() => {
    const fetch = async () => {
      if (!user) return;
      const { data: assistido } = await supabase
        .from("assistidos")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!assistido) { setLoading(false); return; }
      setAssistidoId(assistido.id);

      // Get all vinculos with their entrevista_id
      const { data: vinculos } = await supabase
        .from("assistido_tratamentos")
        .select("id, tratamento_id, entrevista_id")
        .eq("assistido_id", assistido.id);

      if (!vinculos || vinculos.length === 0) { setLoading(false); return; }

      // Get tratamento names
      const tratIds = [...new Set(vinculos.map((v) => v.tratamento_id))];
      const { data: tipos } = await supabase
        .from("tipos_tratamento")
        .select("id, nome")
        .in("id", tratIds);
      const tipoMap = Object.fromEntries((tipos || []).map((t) => [t.id, t.nome]));

      // Get entrevista dates
      const entrevistaIds = [...new Set(vinculos.map((v) => v.entrevista_id).filter(Boolean))] as string[];
      let entMap: Record<string, string> = {};
      if (entrevistaIds.length > 0) {
        const { data: entrevistas } = await supabase
          .from("entrevistas_fraternas")
          .select("id, data")
          .in("id", entrevistaIds);
        entMap = Object.fromEntries((entrevistas || []).map((e: any) => [e.id, e.data]));
      }

      // Group by entrevista_id (or "sem_entrevista" for those without)
      const grouped = new Map<string, { vinculoIds: string[]; entrevistaId: string | null; tratamentos: string[]; data: string | null }>();

      vinculos.forEach((v) => {
        const key = v.entrevista_id || "agendamento_manual";
        if (!grouped.has(key)) {
          grouped.set(key, {
            vinculoIds: [],
            entrevistaId: v.entrevista_id || null,
            tratamentos: [],
            data: v.entrevista_id ? entMap[v.entrevista_id] || null : null,
          });
        }
        const g = grouped.get(key)!;
        g.vinculoIds.push(v.id);
        g.tratamentos.push(tipoMap[v.tratamento_id] || "—");
      });

      const result: DocItem[] = [];
      grouped.forEach((g, key) => {
        result.push({
          assistidoTratamentoIds: g.vinculoIds,
          entrevistaId: g.entrevistaId,
          label: g.entrevistaId
            ? `Carta de Agendamento — Entrevista ${g.data ? format(new Date(g.data), "dd/MM/yyyy") : ""}`
            : "Carta de Agendamento — Agendamento Manual",
          dataEntrevista: g.data,
          tratamentos: g.tratamentos,
        });
      });

      // Sort by date (most recent first)
      result.sort((a, b) => (b.dataEntrevista || "").localeCompare(a.dataEntrevista || ""));
      setDocs(result);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const openCarta = (doc: DocItem) => {
    setCartaEntrevistaId(doc.entrevistaId || undefined);
    setCartaVinculoIds(doc.assistidoTratamentoIds);
    setCartaOpen(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Documentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Comprovantes e cartas de agendamento</p>
      </div>

      {docs.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <FileText className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum documento disponível</p>
              <p className="text-xs mt-1">Após o agendamento dos seus tratamentos, os comprovantes aparecerão aqui</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((doc, idx) => (
            <Card key={idx} className="glass-card hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{doc.label}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {doc.tratamentos.map((t, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openCarta(doc)}
                    className="gap-1 shrink-0"
                  >
                    <Eye className="h-3.5 w-3.5" /> Ver
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CartaAgendamento
        open={cartaOpen}
        onOpenChange={setCartaOpen}
        assistidoId={assistidoId}
        entrevistaId={cartaEntrevistaId}
        assistidoTratamentoIds={cartaVinculoIds}
      />
    </div>
  );
}
