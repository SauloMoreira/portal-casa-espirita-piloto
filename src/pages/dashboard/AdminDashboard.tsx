import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AIInsightsBlock from "@/components/dashboard/AIInsightsBlock";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users, Heart, Calendar, ClipboardCheck, BookOpen, TrendingUp, TrendingDown,
  AlertTriangle, BarChart3, FileText, ListChecks, Clock, CheckCircle,
  ArrowRight, Download, Briefcase, UserCheck, CalendarX, Hourglass,
  PieChart as PieChartIcon, Activity, Target, ExternalLink
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend, LineChart, Line, CartesianGrid, AreaChart, Area
} from "recharts";
import { buildAgeDistribution, getAgeGroup, calcAge } from "@/lib/ageGroups";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

const CHART_COLORS = [
  "hsl(174, 42%, 35%)", "hsl(152, 55%, 42%)", "hsl(38, 60%, 55%)",
  "hsl(200, 80%, 50%)", "hsl(280, 45%, 55%)", "hsl(0, 72%, 51%)",
  "hsl(174, 42%, 55%)", "hsl(152, 55%, 62%)"
];

type PeriodKey = "hoje" | "7d" | "30d" | "mes" | "ano";

function getPeriodRange(key: PeriodKey) {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  switch (key) {
    case "hoje": return { start: today, end: today };
    case "7d": return { start: format(subDays(now, 7), "yyyy-MM-dd"), end: today };
    case "30d": return { start: format(subDays(now, 30), "yyyy-MM-dd"), end: today };
    case "mes": return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    case "ano": return { start: format(startOfYear(now), "yyyy-MM-dd"), end: today };
  }
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodKey>("mes");
  const [loading, setLoading] = useState(true);

  // Raw data
  const [assistidos, setAssistidos] = useState<any[]>([]);
  const [tratAtivos, setTratAtivos] = useState(0);
  const [tratConcluidos, setTratConcluidos] = useState(0);
  const [entAgendadas, setEntAgendadas] = useState(0);
  const [presencasHoje, setPresencasHoje] = useState(0);
  const [listaEspera, setListaEspera] = useState(0);
  const [entRecentes, setEntRecentes] = useState<any[]>([]);
  const [tratPorTipo, setTratPorTipo] = useState<any[]>([]);
  const [presencas, setPresencas] = useState<any[]>([]);
  const [palestras, setPalestras] = useState<any[]>([]);
  const [cargaTarefeiros, setCargaTarefeiros] = useState<any[]>([]);
  const [entrevistas, setEntrevistas] = useState<any[]>([]);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [faltasMes, setFaltasMes] = useState(0);
  const [aguardandoAgend, setAguardandoAgend] = useState(0);
  const [tratamentos, setTratamentos] = useState<any[]>([]);
  const [publicoPalestras, setPublicoPalestras] = useState(0);
  const [aguardandoList, setAguardandoList] = useState<any[]>([]);
  const [aguardandoOpen, setAguardandoOpen] = useState(false);

  const range = useMemo(() => getPeriodRange(period), [period]);

  useEffect(() => {
    fetchAll();
  }, [period]);

  async function fetchAll() {
    setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");

    const [
      { data: assistidosData },
      { count: tratAtivosC },
      { count: tratConcluidosC },
      { count: entAgendasC },
      { count: presencasHojeC },
      { count: listaEsperaC },
      { count: aguardAgendC },
      { data: recentesData },
      { data: tratData },
      { data: presData },
      { data: palData },
      { data: entData },
      { count: faltasMesC },
      { data: tiposTrat },
    ] = await Promise.all([
      supabase.from("assistidos").select("id, nome, data_nascimento, status, created_at, quantidade_palestras").is("deleted_at", null).limit(5000),
      supabase.from("assistido_tratamentos").select("*", { count: "exact", head: true }).in("status", ["aguardando_inicio", "em_andamento"]),
      supabase.from("assistido_tratamentos").select("*", { count: "exact", head: true }).eq("status", "concluido").gte("updated_at", range.start + "T00:00:00").lte("updated_at", range.end + "T23:59:59"),
      supabase.from("entrevistas_fraternas").select("*", { count: "exact", head: true }).eq("status", "agendada"),
      supabase.from("presencas_tratamentos").select("*", { count: "exact", head: true }).eq("data", today),
      supabase.from("assistido_tratamentos").select("*", { count: "exact", head: true }).eq("status", "aguardando_liberacao"),
      supabase.from("assistido_tratamentos").select("*", { count: "exact", head: true }).eq("status", "aguardando_agendamento"),
      supabase.from("entrevistas_fraternas").select("id, data, status, assistido_id, entrevistador_id, tipo_entrevista").order("data", { ascending: false }).limit(5),
      supabase.from("assistido_tratamentos").select("tratamento_id, status, tratamento:tipos_tratamento(nome, tarefeiro_id)").in("status", ["aguardando_inicio", "em_andamento"]).limit(5000),
      supabase.from("presencas_tratamentos").select("data, status_presenca").gte("data", range.start).lte("data", range.end).limit(5000),
      supabase.from("presencas_palestras").select("palestra_id, presente, palestra:palestras(data)").limit(5000),
      supabase.from("entrevistas_fraternas").select("id, data, status, tipo_entrevista").gte("data", range.start + "T00:00:00").lte("data", range.end + "T23:59:59").limit(5000),
      supabase.from("presencas_tratamentos").select("*", { count: "exact", head: true }).eq("status_presenca", "ausente").gte("data", range.start).lte("data", range.end),
      supabase.from("tipos_tratamento").select("id, nome, tarefeiro_id, coordenador_responsavel_id").eq("status", "ativo"),
    ]);

    setAssistidos(assistidosData || []);
    setTratAtivos(tratAtivosC || 0);
    setTratConcluidos(tratConcluidosC || 0);
    setEntAgendadas(entAgendasC || 0);
    setPresencasHoje(presencasHojeC || 0);
    setListaEspera(listaEsperaC || 0);
    setAguardandoAgend(aguardAgendC || 0);
    setFaltasMes(faltasMesC || 0);
    setTratamentos(tiposTrat || []);

    // Recent interviews with names
    if (recentesData) {
      const ids = [...new Set(recentesData.map((r: any) => r.assistido_id))];
      const entIds = [...new Set(recentesData.map((r: any) => r.entrevistador_id))];
      const [{ data: nomes }, { data: entNomes }] = await Promise.all([
        supabase.from("assistidos").select("id, nome").in("id", ids),
        supabase.from("profiles").select("user_id, nome_completo").in("user_id", entIds),
      ]);
      const nomeMap = Object.fromEntries((nomes || []).map((n: any) => [n.id, n.nome]));
      const entMap = Object.fromEntries((entNomes || []).map((n: any) => [n.user_id, n.nome_completo]));
      setEntRecentes(recentesData.map((r: any) => ({
        ...r,
        assistido_nome: nomeMap[r.assistido_id] || "—",
        entrevistador_nome: entMap[r.entrevistador_id] || "—",
      })));
    }

    // Treatment distribution
    if (tratData) {
      const map = new Map<string, { nome: string; count: number }>();
      tratData.forEach((d: any) => {
        const t = d.tratamento as any;
        if (!t) return;
        const key = d.tratamento_id;
        if (!map.has(key)) map.set(key, { nome: t.nome, count: 0 });
        map.get(key)!.count++;
      });
      setTratPorTipo([...map.values()].sort((a, b) => b.count - a.count));
    }

    // Workload by tarefeiro
    if (tratData && tiposTrat) {
      const tarefeiroMap = new Map<string, { total: number }>();
      tratData.forEach((d: any) => {
        const t = d.tratamento as any;
        if (!t || !t.tarefeiro_id) return;
        if (!tarefeiroMap.has(t.tarefeiro_id)) tarefeiroMap.set(t.tarefeiro_id, { total: 0 });
        tarefeiroMap.get(t.tarefeiro_id)!.total++;
      });
      const tIds = [...tarefeiroMap.keys()];
      if (tIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, nome_completo").in("user_id", tIds);
        const pMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p.nome_completo || "Sem nome"]));
        setCargaTarefeiros(
          [...tarefeiroMap.entries()]
            .map(([id, v]) => ({ nome: pMap[id] || id.slice(0, 8), total: v.total }))
            .sort((a, b) => b.total - a.total)
        );
      }
    }

    // Presence data
    setPresencas(presData || []);
    setPalestras(palData || []);
    setEntrevistas(entData || []);

    // Lectures audience
    const totalPresentes = (palData || []).filter((p: any) => p.presente).length;
    setPublicoPalestras(totalPresentes);

    // Pendencies
    const pend: any[] = [];
    if ((aguardAgendC || 0) > 0) pend.push({ label: "Assistidos aguardando agendamento", count: aguardAgendC, action: "aguardando", icon: Hourglass });
    if ((listaEsperaC || 0) > 0) pend.push({ label: "Itens na lista de espera", count: listaEsperaC, path: "/lista-espera", icon: Clock });
    if ((faltasMesC || 0) > 0) pend.push({ label: "Faltas no período", count: faltasMesC, path: "/relatorios", icon: CalendarX });
    setPendencias(pend);

    setLoading(false);
  }

  // Derived data
  const ageData = useMemo(() => buildAgeDistribution(assistidos), [assistidos]);
  const topAge = useMemo(() => ageData.reduce((a, b) => (b.value > a.value ? b : a), { name: "—", value: 0 }), [ageData]);
  const bottomAge = useMemo(() => ageData.filter(a => a.name !== "Não informado").reduce((a, b) => (b.value < a.value ? b : a), { name: "—", value: Infinity }), [ageData]);

  const presenceChart = useMemo(() => {
    const map = new Map<string, { presentes: number; ausentes: number }>();
    presencas.forEach((p: any) => {
      const key = p.data;
      if (!map.has(key)) map.set(key, { presentes: 0, ausentes: 0 });
      const entry = map.get(key)!;
      if (p.status_presenca === "presente") entry.presentes++;
      else entry.ausentes++;
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-15)
      .map(([date, v]) => ({
        data: format(new Date(date + "T12:00:00"), "dd/MM", { locale: ptBR }),
        Presenças: v.presentes,
        Ausências: v.ausentes,
      }));
  }, [presencas]);

  const entrevistasPorTipo = useMemo(() => {
    let regulares = 0, livres = 0, realizadas = 0;
    entrevistas.forEach((e: any) => {
      if (e.tipo_entrevista === "livre") livres++; else regulares++;
      if (e.status === "realizada") realizadas++;
    });
    return { regulares, livres, realizadas, total: entrevistas.length };
  }, [entrevistas]);

  const funnel = useMemo(() => {
    const total = assistidos.length;
    const emTrat = tratAtivos;
    const concluidos = tratConcluidos;
    return [
      { name: "Cadastrados", value: total },
      { name: "Entrevistados", value: entrevistasPorTipo.realizadas },
      { name: "Em Tratamento", value: emTrat },
      { name: "Aguardando", value: aguardandoAgend },
      { name: "Concluídos", value: concluidos },
    ];
  }, [assistidos, tratAtivos, tratConcluidos, entrevistasPorTipo, aguardandoAgend]);

  // Top/bottom treatments
  const topTrat = tratPorTipo[0];
  const bottomTrat = tratPorTipo[tratPorTipo.length - 1];
  const topTarefeiro = cargaTarefeiros[0];

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { agendada: "Agendada", realizada: "Realizada", cancelada: "Cancelada", remarcada: "Remarcada" };
    return map[s] || s;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Carregando dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* BLOCK 1 — Executive Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Painel Administrativo</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão geral operacional e gerencial</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["hoje", "7d", "30d", "mes", "ano"] as PeriodKey[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
              className="text-xs h-8"
            >
              {p === "hoje" ? "Hoje" : p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : p === "mes" ? "Mês" : "Ano"}
            </Button>
          ))}
        </div>
      </div>

      {/* BLOCK 2 — Main Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Assistidos" value={assistidos.length} subtitle="Cadastrados" icon={Users} />
        <StatCard title="Trat. Ativos" value={tratAtivos} subtitle="Em andamento" icon={Heart} />
        <StatCard title="Entrev. Agendadas" value={entAgendadas} subtitle="Pendentes" icon={Calendar} />
        <StatCard title="Presenças Hoje" value={presencasHoje} subtitle="Registradas" icon={ClipboardCheck} />
        <StatCard title="Lista de Espera" value={listaEspera} subtitle="Aguardando" icon={Hourglass} />
        <StatCard title="Concluídos" value={tratConcluidos} subtitle="No período" icon={CheckCircle} />
      </div>

      {/* BLOCK 3 — Strategic Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Maior Tratamento" value={topTrat?.nome || "—"} subtitle={`${topTrat?.count || 0} assistidos`} icon={TrendingUp} />
        <StatCard title="Menor Tratamento" value={bottomTrat?.nome || "—"} subtitle={`${bottomTrat?.count || 0} assistidos`} icon={TrendingDown} />
        <StatCard title="Maior Carga" value={topTarefeiro?.nome?.split(" ")[0] || "—"} subtitle={`${topTarefeiro?.total || 0} vínculos`} icon={Briefcase} />
        <StatCard title="Palestras" value={publicoPalestras} subtitle="Presenças no período" icon={BookOpen} />
        <StatCard title="Faltas" value={faltasMes} subtitle="No período" icon={CalendarX} />
        <div className="cursor-pointer" onClick={handleOpenAguardando}>
          <StatCard title="Aguardando Agend." value={aguardandoAgend} subtitle="Ver detalhes ›" icon={Clock} />
        </div>
      </div>

      {/* Age group mini-cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard title="Faixa Mais Presente" value={topAge.name} subtitle={`${topAge.value} assistidos`} icon={UserCheck} />
        <StatCard title="Faixa Menos Presente" value={bottomAge.name === "—" ? "—" : bottomAge.name} subtitle={`${bottomAge.value === Infinity ? 0 : bottomAge.value} assistidos`} icon={Activity} />
      </div>

      {/* BLOCK 4 — Critical Pendencies */}
      {pendencias.length > 0 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" /> Pendências Críticas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {pendencias.map((p, i) => {
                const Icon = p.icon;
                return (
                  <div
                    key={i}
                    onClick={() => {
                      if (p.action === "aguardando") handleOpenAguardando();
                      else if (p.path) navigate(p.path);
                    }}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-card hover:bg-secondary/50 cursor-pointer transition-colors"
                  >
                    <Icon className="h-5 w-5 text-warning shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{p.label}</p>
                      <p className="text-lg font-bold text-foreground">{p.count}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* BLOCK 5 — Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assistidos por Tratamento */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" /> Assistidos por Tratamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {tratPorTipo.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={tratPorTipo.slice(0, 8)} layout="vertical" margin={{ left: 10 }}>
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="nome" type="category" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="count" name="Assistidos" radius={[0, 4, 4, 0]}>
                    {tratPorTipo.slice(0, 8).map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>

        {/* Presença x Ausência */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Presença × Ausência
            </CardTitle>
          </CardHeader>
          <CardContent>
            {presenceChart.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={presenceChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(150,12%,90%)" />
                  <XAxis dataKey="data" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="Presenças" stackId="1" stroke="hsl(152,55%,42%)" fill="hsl(152,55%,42%)" fillOpacity={0.4} />
                  <Area type="monotone" dataKey="Ausências" stackId="1" stroke="hsl(0,72%,51%)" fill="hsl(0,72%,51%)" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>

        {/* Faixa Etária */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" /> Assistidos por Faixa Etária
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ageData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={ageData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                    {ageData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>

        {/* Funil Operacional */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Funil Operacional
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 py-2">
              {funnel.map((step, i) => {
                const maxVal = Math.max(...funnel.map((f) => f.value), 1);
                const pct = (step.value / maxVal) * 100;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{step.name}</span>
                      <span className="font-bold text-foreground">{step.value}</span>
                    </div>
                    <div className="h-3 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* BLOCK 6 — Interviews */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" /> Entrevistas no Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-xl font-bold text-foreground">{entrevistasPorTipo.total}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-xl font-bold text-foreground">{entrevistasPorTipo.regulares}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Regulares</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-xl font-bold text-foreground">{entrevistasPorTipo.livres}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Livres</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-3 text-center">
                <p className="text-xl font-bold text-foreground">{entrevistasPorTipo.realizadas}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Realizadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Carga por Tarefeiro */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Carga por Tarefeiro
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cargaTarefeiros.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cargaTarefeiros.slice(0, 6)}>
                  <XAxis dataKey="nome" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total" name="Vínculos" radius={[4, 4, 0, 0]} fill="hsl(174,42%,35%)" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Sem dados de carga</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BLOCK 8 — Quick Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Interviews */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" /> Entrevistas Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {entRecentes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <BookOpen className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">Nenhuma entrevista registrada</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entRecentes.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.assistido_nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(e.data), "dd/MM/yyyy HH:mm", { locale: ptBR })} • {e.entrevistador_nome}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{statusLabel(e.status)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Age group table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Distribuição por Faixa Etária
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Faixa</TableHead>
                  <TableHead className="text-center">Qtde</TableHead>
                  <TableHead className="text-center">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ageData.map((a, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{a.name}</TableCell>
                    <TableCell className="text-center">{a.value}</TableCell>
                    <TableCell className="text-center text-muted-foreground">
                      {assistidos.length > 0 ? ((a.value / assistidos.length) * 100).toFixed(1) + "%" : "0%"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* BLOCK — AI Insights */}
      <AIInsightsBlock dashboardData={{
        totalAssistidos: assistidos.length,
        tratAtivos,
        tratConcluidos,
        entAgendadas,
        presencasHoje,
        listaEspera,
        faltasMes,
        aguardandoAgend,
        publicoPalestras,
        periodo: `${range.start} a ${range.end}`,
        faixaEtaria: ageData,
        tratPorTipo,
        cargaTarefeiros,
        entrevistasPorTipo,
      }} />

      {/* BLOCK 9 — Shortcuts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" /> Acesso Rápido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "Relatórios", path: "/relatorios", icon: FileText },
              { label: "Lista de Espera", path: "/lista-espera", icon: ListChecks },
              { label: "Agenda", path: "/agenda", icon: Calendar },
              { label: "Exceções", path: "/excecoes", icon: AlertTriangle },
              { label: "Assistidos", path: "/assistidos", icon: Users },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.path}
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => navigate(item.path)}
                >
                  <Icon className="h-3.5 w-3.5" /> {item.label}
                </Button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
