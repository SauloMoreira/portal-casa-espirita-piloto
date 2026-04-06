import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Clock, CalendarX, UserX, Activity, ChevronRight, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

interface ExcecaoCard {
  titulo: string;
  valor: number;
  icon: React.ElementType;
  cor: string;
  link?: string;
  tab?: string;
}

interface DetailRow {
  id: string;
  label: string;
  sublabel?: string;
  date?: string;
  link?: string;
}

export default function Excecoes() {
  const [cards, setCards] = useState<ExcecaoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("resumo");
  const [detailRows, setDetailRows] = useState<DetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const { role } = useAuth();
  const navigate = useNavigate();

  const loadSummary = async () => {
    setLoading(true);
    const result: ExcecaoCard[] = [];

    const { data: aguardando } = await supabase
      .from("assistido_tratamentos")
      .select("id")
      .eq("status", "aguardando_agendamento");
    result.push({
      titulo: "Aguardando Agendamento",
      valor: aguardando?.length || 0,
      icon: Clock,
      cor: "text-amber-500",
      link: "/lista-espera",
      tab: "aguardando",
    });

    const today = new Date().toISOString().split("T")[0];
    const { data: sessoesPast } = await supabase
      .from("agenda_tratamentos_assistido")
      .select("id")
      .lt("data_sessao", today)
      .eq("status", "agendado");
    result.push({
      titulo: "Sessões Sem Presença",
      valor: sessoesPast?.length || 0,
      icon: CalendarX,
      cor: "text-destructive",
      tab: "sem_presenca",
    });

    const { data: entrevistas } = await supabase
      .from("entrevistas_fraternas")
      .select("id, assistido_id")
      .eq("status", "realizada");
    let semTratamento = 0;
    if (entrevistas) {
      const assistidoIds = [...new Set(entrevistas.map((e: any) => e.assistido_id))];
      if (assistidoIds.length > 0) {
        const { data: trats } = await supabase
          .from("assistido_tratamentos")
          .select("assistido_id")
          .in("assistido_id", assistidoIds);
        const comTrat = new Set((trats || []).map((t: any) => t.assistido_id));
        semTratamento = assistidoIds.filter((id) => !comTrat.has(id)).length;
      }
    }
    result.push({
      titulo: "Entrevistas Sem Tratamento",
      valor: semTratamento,
      icon: AlertTriangle,
      cor: "text-amber-600",
      tab: "sem_tratamento",
    });

    const { data: presencas } = await supabase
      .from("presencas_tratamentos")
      .select("assistido_tratamento_id")
      .eq("status_presenca", "ausente");
    let comMuitasFaltas = 0;
    if (presencas) {
      const faltaCount: Record<string, number> = {};
      presencas.forEach((p: any) => {
        faltaCount[p.assistido_tratamento_id] = (faltaCount[p.assistido_tratamento_id] || 0) + 1;
      });
      comMuitasFaltas = Object.values(faltaCount).filter((c) => c >= 3).length;
    }
    result.push({
      titulo: "Faltas Recorrentes",
      valor: comMuitasFaltas,
      icon: UserX,
      cor: "text-destructive",
      tab: "faltas",
    });

    const { data: emAndamento } = await supabase
      .from("assistido_tratamentos")
      .select("id")
      .eq("status", "em_andamento");
    result.push({
      titulo: "Em Andamento",
      valor: emAndamento?.length || 0,
      icon: Activity,
      cor: "text-primary",
    });

    setCards(result);
    setLoading(false);
  };

  useEffect(() => { loadSummary(); }, []);

  const loadDetail = async (tab: string) => {
    setDetailLoading(true);
    setActiveTab(tab);
    const rows: DetailRow[] = [];

    if (tab === "aguardando") {
      const { data } = await supabase
        .from("assistido_tratamentos")
        .select("id, assistido_id, created_at")
        .eq("status", "aguardando_agendamento")
        .order("created_at", { ascending: true })
        .limit(50);
      if (data) {
        const ids = [...new Set(data.map((d: any) => d.assistido_id))];
        const { data: nomes } = await supabase.from("assistidos").select("id, nome").in("id", ids);
        const map = Object.fromEntries((nomes || []).map((n: any) => [n.id, n.nome]));
        data.forEach((d: any) => {
          rows.push({
            id: d.id,
            label: map[d.assistido_id] || d.assistido_id.substring(0, 8),
            sublabel: "Aguardando agendamento",
            date: format(new Date(d.created_at), "dd/MM/yyyy"),
          });
        });
      }
    } else if (tab === "sem_presenca") {
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("agenda_tratamentos_assistido")
        .select("id, assistido_id, data_sessao")
        .lt("data_sessao", today)
        .eq("status", "agendado")
        .order("data_sessao", { ascending: true })
        .limit(50);
      if (data) {
        const ids = [...new Set(data.map((d: any) => d.assistido_id))];
        const { data: nomes } = await supabase.from("assistidos").select("id, nome").in("id", ids);
        const map = Object.fromEntries((nomes || []).map((n: any) => [n.id, n.nome]));
        data.forEach((d: any) => {
          rows.push({
            id: d.id,
            label: map[d.assistido_id] || "—",
            sublabel: "Sessão sem presença registrada",
            date: format(new Date(d.data_sessao), "dd/MM/yyyy"),
          });
        });
      }
    } else if (tab === "sem_tratamento") {
      const { data: entrevistas } = await supabase
        .from("entrevistas_fraternas")
        .select("id, assistido_id, data")
        .eq("status", "realizada")
        .order("data", { ascending: true });
      if (entrevistas) {
        const assistidoIds = [...new Set(entrevistas.map((e: any) => e.assistido_id))];
        const { data: trats } = await supabase
          .from("assistido_tratamentos")
          .select("assistido_id")
          .in("assistido_id", assistidoIds);
        const comTrat = new Set((trats || []).map((t: any) => t.assistido_id));
        const semIds = assistidoIds.filter((id) => !comTrat.has(id));
        const { data: nomes } = semIds.length > 0 ? await supabase.from("assistidos").select("id, nome").in("id", semIds) : { data: [] };
        const map = Object.fromEntries((nomes || []).map((n: any) => [n.id, n.nome]));
        const entMap = Object.fromEntries(entrevistas.map((e: any) => [e.assistido_id, e.data]));
        semIds.forEach((id) => {
          rows.push({
            id,
            label: map[id] || id.substring(0, 8),
            sublabel: "Entrevista realizada sem tratamento",
            date: entMap[id] ? format(new Date(entMap[id]), "dd/MM/yyyy") : "—",
          });
        });
      }
    }

    setDetailRows(rows);
    setDetailLoading(false);
  };

  const totalPendencias = cards.reduce((acc, c) => acc + (c.tab ? c.valor : 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Exceções e Pendências</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalPendencias > 0 ? `${totalPendencias} item(ns) requerem atenção` : "Itens que exigem atenção operacional"}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1" onClick={loadSummary}>
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {cards.map((card) => (
              <Card
                key={card.titulo}
                className={`glass-card transition-shadow ${card.tab || card.link ? "cursor-pointer hover:shadow-md" : ""}`}
                onClick={() => {
                  if (card.link) navigate(card.link);
                  else if (card.tab) loadDetail(card.tab);
                }}
              >
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">{card.titulo}</p>
                      <p className="text-2xl font-bold mt-1">{card.valor}</p>
                    </div>
                    <card.icon className={`h-7 w-7 ${card.cor} opacity-80`} />
                  </div>
                  {card.valor > 0 && card.tab && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      Ver detalhes <ChevronRight className="h-3 w-3" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {activeTab !== "resumo" && (
            <Card className="glass-card">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {cards.find((c) => c.tab === activeTab)?.titulo || "Detalhes"}
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setActiveTab("resumo")}>
                    Voltar ao resumo
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {detailLoading ? (
                  <div className="flex justify-center py-8 text-sm text-muted-foreground">Carregando...</div>
                ) : detailRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum item encontrado</p>
                ) : (
                  <div className="overflow-x-auto -mx-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Situação</TableHead>
                          <TableHead>Data</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{row.label}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.sublabel}</TableCell>
                            <TableCell>{row.date}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
