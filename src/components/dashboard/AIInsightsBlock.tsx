import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RefreshCw, Lightbulb, AlertCircle, ArrowRight, Megaphone, Settings2, HeartHandshake, BarChart3 } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Insight {
  titulo: string;
  categoria: "Comunicação" | "Operação" | "Acolhimento" | "Monitoramento";
  diagnostico: string;
  impacto: string;
  recomendacao: string;
  prioridade: "alta" | "media" | "baixa";
}

interface InsightsData {
  resumo: string;
  insights: Insight[];
}

interface DashboardData {
  totalAssistidos: number;
  tratAtivos: number;
  tratConcluidos: number;
  entAgendadas: number;
  presencasHoje: number;
  listaEspera: number;
  faltasMes: number;
  aguardandoAgend: number;
  publicoPalestras: number;
  periodo: string;
  faixaEtaria: { name: string; value: number }[];
  tratPorTipo: { nome: string; count: number }[];
  cargaTarefeiros: { nome: string; total: number }[];
  entrevistasPorTipo: { regulares: number; livres: number; realizadas: number; total: number };
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Megaphone; color: string }> = {
  "Comunicação": { icon: Megaphone, color: "text-info" },
  "Operação": { icon: Settings2, color: "text-primary" },
  "Acolhimento": { icon: HeartHandshake, color: "text-success" },
  "Monitoramento": { icon: BarChart3, color: "text-accent" },
};

const PRIORITY_VARIANT: Record<string, "destructive" | "default" | "secondary"> = {
  alta: "destructive",
  media: "default",
  baixa: "secondary",
};

export default function AIInsightsBlock({ dashboardData }: { dashboardData: DashboardData }) {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("insights-dashboard", {
        body: { dashboardData },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      setInsights(data as InsightsData);
    } catch (e: any) {
      setError(e.message || "Erro ao gerar insights");
    } finally {
      setLoading(false);
    }
  }, [dashboardData]);

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/[0.03]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Insights e Recomendações da IA
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            className="gap-2 text-xs h-8"
            onClick={fetchInsights}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Analisando..." : insights ? "Atualizar" : "Gerar Insights"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!insights && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Sparkles className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">Análise inteligente dos dados operacionais</p>
            <p className="text-xs mt-1 max-w-md text-center">
              Clique em "Gerar Insights" para que a IA analise os dados do dashboard e sugira ações práticas para ampliar alcance e adesão.
            </p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <RefreshCw className="h-8 w-8 mb-3 animate-spin opacity-40" />
            <p className="text-sm">Analisando dados e gerando recomendações...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Erro ao gerar insights</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {insights && !loading && (
          <div className="space-y-5">
            {/* Summary */}
            {insights.resumo && (
              <div className="rounded-lg bg-secondary/50 p-4 border border-border/40">
                <p className="text-sm text-foreground leading-relaxed">{insights.resumo}</p>
              </div>
            )}

            {/* Insights */}
            <div className="space-y-3">
              {insights.insights.map((insight, i) => {
                const catConfig = CATEGORY_CONFIG[insight.categoria] || CATEGORY_CONFIG["Monitoramento"];
                const CatIcon = catConfig.icon;
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-border/60 bg-card p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <CatIcon className={`h-4 w-4 shrink-0 ${catConfig.color}`} />
                        <h4 className="text-sm font-semibold text-foreground truncate">{insight.titulo}</h4>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px]">{insight.categoria}</Badge>
                        <Badge variant={PRIORITY_VARIANT[insight.prioridade] || "secondary"} className="text-[10px]">
                          {insight.prioridade === "alta" ? "Alta" : insight.prioridade === "media" ? "Média" : "Baixa"}
                        </Badge>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground/80">Diagnóstico: </span>
                        {insight.diagnostico}
                      </div>
                      <div>
                        <span className="font-medium text-foreground/80">Impacto: </span>
                        {insight.impacto}
                      </div>
                      <div className="flex items-start gap-1.5 rounded-md bg-primary/5 p-2.5 border border-primary/10">
                        <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="text-foreground/90 font-medium">{insight.recomendacao}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {insights.insights.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum insight gerado para o período selecionado.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
