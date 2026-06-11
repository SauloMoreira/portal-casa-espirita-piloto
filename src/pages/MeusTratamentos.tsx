import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Heart, Calendar, CheckCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { progressoPct, diaSemanaDe, horarioCurto } from "@/lib/assistido";



const STATUS_TRAT_LABELS: Record<string, string> = {
  aguardando_inicio: "Aguardando Início",
  aguardando_liberacao: "Aguardando Liberação",
  aguardando_agendamento: "Aguardando Agendamento",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
};

const STATUS_SESSAO_LABELS: Record<string, string> = {
  agendado: "Agendada",
  realizado: "Realizada",
  ausente: "Ausente",
  cancelado: "Cancelada",
  remarcado: "Remarcada",
};

const STATUS_SESSAO_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  agendado: "outline",
  realizado: "default",
  ausente: "destructive",
  cancelado: "destructive",
  remarcado: "secondary",
};

interface Sessao {
  id: string;
  data_sessao: string;
  horario: string | null;
  status: string;
}

interface MeuTratamento {
  id: string;
  tratamento_nome: string;
  tratamento_tipo: string;
  quantidade_total: number;
  quantidade_realizada: number;
  quantidade_faltante: number | null;
  status: string;
  sessoes: Sessao[];
}

export default function MeusTratamentos() {
  const [tratamentos, setTratamentos] = useState<MeuTratamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      const { data: assistido } = await supabase.from("assistidos").select("id").eq("user_id", user!.id).maybeSingle();
      if (!assistido) { setLoading(false); return; }

      const { data: vinculos } = await supabase
        .from("assistido_tratamentos")
        .select("id, tratamento_id, quantidade_total, quantidade_realizada, quantidade_faltante, status")
        .eq("assistido_id", assistido.id)
        .in("status", ["aguardando_inicio", "aguardando_liberacao", "aguardando_agendamento", "em_andamento", "concluido"]);

      if (!vinculos || vinculos.length === 0) { setLoading(false); return; }

      const tratIds = [...new Set(vinculos.map((v) => v.tratamento_id))];
      const vinculoIds = vinculos.map((v) => v.id);

      const [{ data: tipos }, { data: sessoes }] = await Promise.all([
        supabase.from("tipos_tratamento").select("id, nome, tipo").in("id", tratIds),
        supabase.from("agenda_tratamentos_assistido")
          .select("id, assistido_tratamento_id, data_sessao, horario, status")
          .in("assistido_tratamento_id", vinculoIds)
          .order("data_sessao", { ascending: true }),
      ]);

      const tipoMap = Object.fromEntries((tipos || []).map((t) => [t.id, t]));
      const sessoesByVinculo = (sessoes || []).reduce<Record<string, Sessao[]>>((acc, s) => {
        if (!acc[s.assistido_tratamento_id]) acc[s.assistido_tratamento_id] = [];
        acc[s.assistido_tratamento_id].push(s);
        return acc;
      }, {});

      setTratamentos(vinculos.map((v) => ({
        id: v.id,
        tratamento_nome: tipoMap[v.tratamento_id]?.nome || "—",
        tratamento_tipo: tipoMap[v.tratamento_id]?.tipo || "—",
        quantidade_total: v.quantidade_total,
        quantidade_realizada: v.quantidade_realizada,
        quantidade_faltante: v.quantidade_faltante,
        status: v.status,
        sessoes: sessoesByVinculo[v.id] || [],
      })));
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-6 max-w-screen-xl mx-auto w-full">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Meus Tratamentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Acompanhe seus tratamentos e sessões agendadas</p>
      </div>

      {tratamentos.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <Heart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum tratamento designado</p>
              <p className="text-xs mt-1">Após sua entrevista fraterna, seus tratamentos aparecerão aqui</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tratamentos.map((t) => {
            const pct = progressoPct(t.quantidade_realizada, t.quantidade_total);
            const hoje = new Date().toISOString().split("T")[0];
            const proximasSessoes = t.sessoes.filter((s) => s.data_sessao >= hoje && s.status === "agendado");
            const expanded = expandedIds.has(t.id);
            const sessoesVisiveis = expanded ? t.sessoes : proximasSessoes.slice(0, 3);
            const temMaisSessoes = expanded ? false : (proximasSessoes.length > 3 || t.sessoes.length > proximasSessoes.length);

            return (
              <Card key={t.id} className="glass-card">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base font-semibold">{t.tratamento_nome}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.tratamento_tipo === "espiritual" ? "Espiritual" : "Holístico"}
                      </p>
                    </div>
                    <Badge variant={t.status === "concluido" ? "default" : t.status === "em_andamento" ? "secondary" : "outline"}>
                      {STATUS_TRAT_LABELS[t.status] || t.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Progresso */}
                  <div>
                    <Progress value={pct} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1.5">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {t.quantidade_realizada} realizadas
                      </span>
                      <span>{t.quantidade_faltante ?? 0} faltantes</span>
                      <span>Total: {t.quantidade_total}</span>
                    </div>
                  </div>

                  {/* Sessões agendadas */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {expanded ? "Todas as sessões" : "Próximas sessões"}
                    </h4>

                    {t.sessoes.length === 0 ? (
                      <div className="rounded-lg border border-dashed p-4 text-center">
                        <Clock className="h-5 w-5 mx-auto text-muted-foreground/40 mb-1" />
                        <p className="text-xs text-muted-foreground">
                          {t.status === "aguardando_agendamento"
                            ? "Aguardando definição pelo coordenador"
                            : t.status === "aguardando_liberacao"
                            ? "Aguardando liberação do tratamento anterior"
                            : "Ainda não há sessões confirmadas"}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {sessoesVisiveis.map((s) => {
                          const dataObj = new Date(s.data_sessao + "T12:00:00");
                          const diaSemana = diaSemanaDe(s.data_sessao);
                          const hora = horarioCurto(s.horario);
                          return (
                            <div key={s.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {format(dataObj, "dd/MM/yyyy")}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {diaSemana}
                                </span>
                                {hora && (
                                  <span className="text-xs text-muted-foreground">
                                    às {hora}
                                  </span>
                                )}
                              </div>
                              <Badge variant={STATUS_SESSAO_VARIANT[s.status] || "outline"} className="text-[10px]">
                                {STATUS_SESSAO_LABELS[s.status] || s.status}
                              </Badge>
                            </div>
                          );
                        })}

                        {(temMaisSessoes || expanded) && t.sessoes.length > 3 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-xs mt-1"
                            onClick={() => toggleExpand(t.id)}
                          >
                            {expanded ? (
                              <><ChevronUp className="h-3 w-3 mr-1" /> Mostrar menos</>
                            ) : (
                              <><ChevronDown className="h-3 w-3 mr-1" /> Ver agenda completa ({t.sessoes.length} sessões)</>
                            )}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
