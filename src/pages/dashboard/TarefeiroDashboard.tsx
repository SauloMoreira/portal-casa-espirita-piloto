import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardCheck, Users, Heart, Clock, Check, X, ArrowRight, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { registrarPresencaRoteada } from "@/services/agendaPlano/orquestracao";

interface SessaoDoDia {
  assistido_tratamento_id: string;
  tratamento_nome: string;
  assistido_nome: string;
  horario: string | null;
  quantidade_total: number;
  quantidade_realizada: number;
  presenca_registrada: boolean;
  tem_plano: boolean;
  usa_novo_modelo: boolean;
}

interface SessaoPublica {
  id: string;
  nome: string;
  total_presentes: number;
}

export default function TarefeiroDashboard() {
  const [sessoes, setSessoes] = useState<SessaoDoDia[]>([]);
  const [sessoesPublicas, setSessoesPublicas] = useState<SessaoPublica[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const today = new Date().toISOString().split("T")[0];

  const fetchData = useCallback(async () => {
    if (!user) return;

    // Real public sessions of the day (only open ones)
    const { data: pubSessoes } = await supabase
      .from("sessoes_publicas")
      .select("id, total_presentes, tipos_tratamento:tratamento_id(nome)")
      .eq("data_sessao", today)
      .eq("status", "aberta");
    setSessoesPublicas(
      (pubSessoes || []).map((s: any) => ({
        id: s.id,
        nome: s.tipos_tratamento?.nome || "Trabalho público",
        total_presentes: s.total_presentes ?? 0,
      }))
    );



    const { data: agendaSessoes } = await supabase
      .from("agenda_tratamentos_assistido")
      .select("id, assistido_id, assistido_tratamento_id, tratamento_id, horario, status")
      .eq("data_sessao", today)
      .in("status", ["agendado", "confirmado"]);

    if (!agendaSessoes || agendaSessoes.length === 0) {
      setSessoes([]);
      return;
    }

    const tratIds = [...new Set(agendaSessoes.map((s) => s.tratamento_id))];
    const atIds = [...new Set(agendaSessoes.map((s) => s.assistido_tratamento_id))];
    const assistidoIds = [...new Set(agendaSessoes.map((s) => s.assistido_id))];

    const [{ data: tratamentos }, { data: vinculos }, { data: assistidos }, { data: presencas }] = await Promise.all([
      supabase.from("tipos_tratamento").select("id, nome, tarefeiro_id").in("id", tratIds),
      supabase.from("assistido_tratamentos")
        .select("id, quantidade_total, quantidade_realizada, status")
        .in("id", atIds)
        .in("status", ["aguardando_inicio", "em_andamento", "liberado"]),
      supabase.from("assistidos").select("id, nome").in("id", assistidoIds),
      supabase.from("presencas_tratamentos")
        .select("assistido_tratamento_id")
        .in("assistido_tratamento_id", atIds)
        .eq("data", today),
    ]);

    const tratMap = Object.fromEntries((tratamentos || []).map((t) => [t.id, t]));
    const vinculoMap = Object.fromEntries((vinculos || []).map((v) => [v.id, v]));
    const assistMap = Object.fromEntries((assistidos || []).map((a) => [a.id, a.nome]));
    const presencaSet = new Set((presencas || []).map((p) => p.assistido_tratamento_id));

    const result: SessaoDoDia[] = agendaSessoes
      .filter((s) => {
        const trat = tratMap[s.tratamento_id];
        if (!trat) return false;
        // Show all sessions if tarefeiro_id not set, or only the tarefeiro's own
        if (trat.tarefeiro_id && trat.tarefeiro_id !== user.id) return false;
        return vinculoMap[s.assistido_tratamento_id] != null;
      })
      .map((s) => {
        const trat = tratMap[s.tratamento_id];
        const vinculo = vinculoMap[s.assistido_tratamento_id];
        return {
          assistido_tratamento_id: s.assistido_tratamento_id,
          tratamento_nome: trat?.nome || "—",
          assistido_nome: assistMap[s.assistido_id] || "—",
          horario: s.horario || null,
          quantidade_total: vinculo?.quantidade_total || 0,
          quantidade_realizada: vinculo?.quantidade_realizada || 0,
          presenca_registrada: presencaSet.has(s.assistido_tratamento_id),
        };
      })
      .sort((a, b) => a.tratamento_nome.localeCompare(b.tratamento_nome));

    setSessoes(result);
  }, [user, today]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const registrarPresenca = async (atId: string, statusPresenca: "presente" | "ausente") => {
    setLoadingId(atId);
    const { error } = await supabase.rpc("registrar_presenca", {
      p_assistido_tratamento_id: atId,
      p_data: today,
      p_status_presenca: statusPresenca,
      p_registrado_por: user!.id,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: statusPresenca === "presente" ? "Presença registrada" : "Ausência registrada" });
      fetchData();
    }
    setLoadingId(null);
  };

  const pendentes = sessoes.filter((s) => !s.presenca_registrada).length;
  const registradas = sessoes.filter((s) => s.presenca_registrada).length;
  const tratamentosUnicos = [...new Set(sessoes.map((s) => s.tratamento_nome))].length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Painel do Tarefeiro</h1>
        <p className="text-sm text-muted-foreground mt-1">Tratamentos e presenças do dia</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tratamentos Hoje" value={tratamentosUnicos} icon={Heart} />
        <StatCard title="Assistidos Esperados" value={sessoes.length} icon={Users} />
        <StatCard title="Presenças Pendentes" value={pendentes} icon={Clock} />
        <StatCard title="Presenças Registradas" value={registradas} icon={ClipboardCheck} />
      </div>

      {/* Public sessions of the day (real sessoes_publicas) */}
      {sessoesPublicas.length > 0 && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.05] to-card shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <QrCode className="h-4 w-4 text-primary" />
                Sessões Públicas de Hoje
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => navigate("/sessoes-publicas")}
              >
                Gerenciar <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sessoesPublicas.map((s) => (
                <div
                  key={s.id}
                  onClick={() => navigate("/sessoes-publicas")}
                  className="flex items-center justify-between rounded-xl border border-border/60 p-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                >
                  <span className="text-sm font-medium truncate">{s.nome}</span>
                  <Badge variant="secondary" className="gap-1 shrink-0">
                    <Users className="h-3 w-3" /> {s.total_presentes}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" />
              Controle de Presença — Hoje,{" "}
              {new Date(today + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long" })}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/presenca")}
            >
              Ver controle completo <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {sessoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Heart className="h-9 w-9 mb-3 opacity-20" />
              <p className="text-sm font-medium">Nenhuma sessão agendada para hoje</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tratamento</TableHead>
                    <TableHead>Assistido</TableHead>
                    <TableHead className="hidden md:table-cell">Horário</TableHead>
                    <TableHead className="text-center">Progresso</TableHead>
                    <TableHead className="text-center">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessoes.map((item) => (
                    <TableRow key={item.assistido_tratamento_id}>
                      <TableCell className="font-medium text-sm">{item.tratamento_nome}</TableCell>
                      <TableCell className="text-sm">{item.assistido_nome}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {item.horario ? item.horario.substring(0, 5) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-xs text-muted-foreground">
                          {item.quantidade_realizada}/{item.quantidade_total}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {item.presenca_registrada ? (
                          <Badge variant="secondary" className="text-xs">Registrada</Badge>
                        ) : (
                          <div className="flex gap-1 justify-center">
                            <Button
                              size="sm"
                              variant="default"
                              className="gap-1 h-7 text-xs"
                              disabled={loadingId === item.assistido_tratamento_id}
                              onClick={() => registrarPresenca(item.assistido_tratamento_id, "presente")}
                            >
                              <Check className="h-3 w-3" /> Presente
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1 h-7 text-xs"
                              disabled={loadingId === item.assistido_tratamento_id}
                              onClick={() => registrarPresenca(item.assistido_tratamento_id, "ausente")}
                            >
                              <X className="h-3 w-3" /> Ausente
                            </Button>
                          </div>
                        )}
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
