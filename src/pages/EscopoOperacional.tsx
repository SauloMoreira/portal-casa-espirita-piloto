import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Info, UserPlus, X } from "lucide-react";
import {
  listarCoordenacaoTratamentos,
  designarCoordenador,
  removerCoordenador,
  type CoordenacaoTratamentoItem,
} from "@/services/coordenacao/escopo";

interface Candidato {
  user_id: string;
  nome: string;
}

export default function EscopoOperacional() {
  const { toast } = useToast();
  const [itens, setItens] = useState<CoordenacaoTratamentoItem[]>([]);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionado, setSelecionado] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    try {
      const [lista, { data: profiles }] = await Promise.all([
        listarCoordenacaoTratamentos(),
        supabase.from("profiles").select("user_id, nome_completo").order("nome_completo"),
      ]);
      setItens(lista);
      setCandidatos(
        (profiles || []).map((p: any) => ({
          user_id: p.user_id,
          nome: p.nome_completo || p.user_id,
        }))
      );
    } catch (e: any) {
      toast({ title: "Erro ao carregar escopo", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const handleDesignar = async (tratamentoId: string) => {
    const coordenadorId = selecionado[tratamentoId];
    if (!coordenadorId) return;
    setSaving(tratamentoId);
    try {
      await designarCoordenador(tratamentoId, coordenadorId);
      toast({ title: "Coordenador designado" });
      setSelecionado((s) => ({ ...s, [tratamentoId]: "" }));
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro ao designar", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleRemover = async (tratamentoId: string, coordenadorId: string) => {
    setSaving(tratamentoId);
    try {
      await removerCoordenador(tratamentoId, coordenadorId);
      toast({ title: "Coordenador removido" });
      await carregar();
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const totalAlertas = itens.reduce(
    (acc, it) => acc + it.coordenadores.filter((c) => !c.tem_acesso).length,
    0
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Escopo Operacional</h1>
        <p className="text-muted-foreground">
          Designação de coordenadores por tratamento (relação N:N). O escopo operacional
          <strong> não concede acesso</strong> — acesso e escopo são gerenciados separadamente.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Acesso e escopo são independentes</AlertTitle>
        <AlertDescription>
          Designar um coordenador aqui define apenas o <em>escopo de atuação</em> sobre o tratamento.
          A permissão (papel <code>coordenador_de_tratamento</code>) continua sendo concedida na
          Gestão de Acessos. Os alertas abaixo são apenas consultivos.
        </AlertDescription>
      </Alert>

      {totalAlertas > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Coerência consultiva</AlertTitle>
          <AlertDescription>
            {totalAlertas} designação(ões) sem o acesso correspondente. Isso não bloqueia a operação,
            mas o coordenador só visualizará seus tratamentos após receber o acesso na Gestão de Acessos.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : (
        <div className="grid gap-4">
          {itens.map((it) => (
            <Card key={it.tratamento_id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {it.tratamento_nome}
                  <Badge variant="outline">{it.tratamento_tipo}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {it.coordenadores.length === 0 && (
                    <span className="text-sm text-muted-foreground">Nenhum coordenador designado.</span>
                  )}
                  {it.coordenadores.map((c) => (
                    <Badge
                      key={c.coordenador_id}
                      variant={c.tem_acesso ? "secondary" : "destructive"}
                      className="flex items-center gap-1"
                    >
                      {c.nome}
                      {!c.tem_acesso && (
                        <AlertTriangle className="h-3 w-3" aria-label="Sem acesso correspondente" />
                      )}
                      <button
                        onClick={() => handleRemover(it.tratamento_id, c.coordenador_id)}
                        disabled={saving === it.tratamento_id}
                        className="ml-1 rounded-full hover:bg-background/30"
                        aria-label={`Remover ${c.nome}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={selecionado[it.tratamento_id] || ""}
                    onValueChange={(v) =>
                      setSelecionado((s) => ({ ...s, [it.tratamento_id]: v }))
                    }
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="Selecionar pessoa para designar" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidatos
                        .filter(
                          (cand) =>
                            !it.coordenadores.some((c) => c.coordenador_id === cand.user_id)
                        )
                        .map((cand) => (
                          <SelectItem key={cand.user_id} value={cand.user_id}>
                            {cand.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => handleDesignar(it.tratamento_id)}
                    disabled={!selecionado[it.tratamento_id] || saving === it.tratamento_id}
                  >
                    <UserPlus className="mr-1 h-4 w-4" /> Designar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
