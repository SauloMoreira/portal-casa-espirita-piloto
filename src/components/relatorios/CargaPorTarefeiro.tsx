import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ReportFilters, { FilterValues, defaultFilters } from "./ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/StatCard";
import { Download, Users, Calendar, CalendarCheck, CalendarX, Trophy, Activity, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { exportCsv } from "@/lib/exportCsv";

interface Row {
  tarefeiro: string;
  tarefeiroId: string;
  totalAssistidos: number;
  totalSessoes: number;
  presencas: number;
  ausencias: number;
  emAndamento: number;
  concluidos: number;
  tratamentos: string[];
}

export default function CargaPorTarefeiro() {
  const [filters, setFilters] = useState<FilterValues>(defaultFilters());
  const [rows, setRows] = useState<Row[]>([]);
  const { role, user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      // Get tratamentos with tarefeiro
      const { data: tipos } = await supabase.from("tipos_tratamento").select("id, nome, tarefeiro_id").not("tarefeiro_id", "is", null);
      if (!tipos || tipos.length === 0) { setRows([]); return; }

      const filtered = tipos.filter((t) => {
        if (filters.tratamentoId !== "todos" && t.id !== filters.tratamentoId) return false;
        if (filters.tarefeiroId !== "todos" && t.tarefeiro_id !== filters.tarefeiroId) return false;
        if (role === "tarefeiro" && t.tarefeiro_id !== user?.id) return false;
        return true;
      });

      if (filtered.length === 0) { setRows([]); return; }

      const tarefIds = [...new Set(filtered.map((t) => t.tarefeiro_id).filter(Boolean))] as string[];
      const tratIds = filtered.map((t) => t.id);

      const [{ data: profiles }, { data: sessoes }, { data: presencas }, { data: vinculos }] = await Promise.all([
        supabase.rpc("staff_names", { _ids: tarefIds }),
        supabase.from("agenda_tratamentos_assistido").select("tratamento_id, assistido_id").in("tratamento_id", tratIds).gte("data_sessao", filters.dataInicio).lte("data_sessao", filters.dataFim).limit(10000),
        supabase.from("presencas_tratamentos").select("status_presenca, assistido_tratamento:assistido_tratamentos(tratamento_id)").gte("data", filters.dataInicio).lte("data", filters.dataFim).limit(10000),
        supabase.from("assistido_tratamentos").select("tratamento_id, status").in("tratamento_id", tratIds).limit(5000),
      ]);

      const nameMap = new Map((profiles || []).map((p) => [p.user_id, p.nome_completo || "Sem nome"]));

      const tarefMap = new Map<string, { tratamentos: Set<string>; tratNomes: Set<string>; assistidos: Set<string>; sessoes: number; presencas: number; ausencias: number; emAndamento: number; concluidos: number }>();

      filtered.forEach((t) => {
        const tid = t.tarefeiro_id!;
        if (!tarefMap.has(tid)) tarefMap.set(tid, { tratamentos: new Set(), tratNomes: new Set(), assistidos: new Set(), sessoes: 0, presencas: 0, ausencias: 0, emAndamento: 0, concluidos: 0 });
        const r = tarefMap.get(tid)!;
        r.tratamentos.add(t.id);
        r.tratNomes.add(t.nome);
      });

      (sessoes || []).forEach((s) => {
        const trat = filtered.find((t) => t.id === s.tratamento_id);
        if (trat && trat.tarefeiro_id && tarefMap.has(trat.tarefeiro_id)) {
          const r = tarefMap.get(trat.tarefeiro_id)!;
          r.sessoes++;
          r.assistidos.add(s.assistido_id);
        }
      });

      (presencas || []).forEach((p: any) => {
        const tratId = p.assistido_tratamento?.tratamento_id;
        if (!tratId) return;
        const trat = filtered.find((t) => t.id === tratId);
        if (trat && trat.tarefeiro_id && tarefMap.has(trat.tarefeiro_id)) {
          const r = tarefMap.get(trat.tarefeiro_id)!;
          if (p.status_presenca === "presente") r.presencas++;
          else r.ausencias++;
        }
      });

      // Count em_andamento and concluidos per tarefeiro
      (vinculos || []).forEach((v: any) => {
        const trat = filtered.find((t) => t.id === v.tratamento_id);
        if (trat && trat.tarefeiro_id && tarefMap.has(trat.tarefeiro_id)) {
          const r = tarefMap.get(trat.tarefeiro_id)!;
          if (v.status === "em_andamento") r.emAndamento++;
          else if (v.status === "concluido") r.concluidos++;
        }
      });

      const result: Row[] = [];
      tarefMap.forEach((v, k) => {
        result.push({
          tarefeiro: nameMap.get(k) || "—",
          tarefeiroId: k,
          totalAssistidos: v.assistidos.size,
          totalSessoes: v.sessoes,
          presencas: v.presencas,
          ausencias: v.ausencias,
          emAndamento: v.emAndamento,
          concluidos: v.concluidos,
          tratamentos: [...v.tratNomes],
        });
      });

      setRows(result.sort((a, b) => a.tarefeiro.localeCompare(b.tarefeiro)));
    };
    fetchData();
  }, [filters, role, user]);

  const totals = rows.reduce((acc, r) => ({
    sessoes: acc.sessoes + r.totalSessoes,
    presencas: acc.presencas + r.presencas,
    ausencias: acc.ausencias + r.ausencias,
    assistidos: acc.assistidos + r.totalAssistidos,
    emAndamento: acc.emAndamento + r.emAndamento,
    concluidos: acc.concluidos + r.concluidos,
  }), { sessoes: 0, presencas: 0, ausencias: 0, assistidos: 0, emAndamento: 0, concluidos: 0 });

  const maiorCarga = rows.length > 0 ? rows.reduce((a, b) => a.totalSessoes >= b.totalSessoes ? a : b).tarefeiro.split(" ")[0] : "—";
  const mediaSessoes = rows.length > 0 ? Math.round(totals.sessoes / rows.length) : 0;
  const mediaAssistidos = rows.length > 0 ? Math.round(totals.assistidos / rows.length) : 0;

  const chartData = rows.map((r) => ({
    name: r.tarefeiro.split(" ")[0],
    Sessões: r.totalSessoes,
    Presenças: r.presencas,
    Ausências: r.ausencias,
  }));

  return (
    <div className="space-y-6">
      <ReportFilters values={filters} onChange={setFilters} show={["dataInicio", "dataFim", "tratamentoId", "tarefeiroId"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Sessões" value={totals.sessoes} icon={Calendar} />
        <StatCard title="Assistidos Atendidos" value={totals.assistidos} icon={Users} />
        <StatCard title="Maior Carga" value={maiorCarga} icon={Trophy} />
        <StatCard title="Média Sessões/Taref." value={mediaSessoes} icon={TrendingUp} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Presenças" value={totals.presencas} icon={CalendarCheck} />
        <StatCard title="Ausências" value={totals.ausencias} icon={CalendarX} />
        <StatCard title="Em Andamento" value={totals.emAndamento} icon={Activity} />
        <StatCard title="Concluídos" value={totals.concluidos} icon={Activity} />
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Carga por Tarefeiro</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Sessões" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Presenças" fill="hsl(var(--chart-2, 150 60% 45%))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Ausências" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Detalhamento</CardTitle>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => exportCsv("carga_por_tarefeiro.csv", ["Tarefeiro", "Assistidos", "Sessões", "Presenças", "Ausências", "Em Andamento", "Concluídos", "Tratamentos"], rows.map((r) => [r.tarefeiro, String(r.totalAssistidos), String(r.totalSessoes), String(r.presencas), String(r.ausencias), String(r.emAndamento), String(r.concluidos), r.tratamentos.join(", ")]))}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarefeiro</TableHead>
                  <TableHead className="text-center">Assistidos</TableHead>
                  <TableHead className="text-center">Sessões</TableHead>
                  <TableHead className="text-center">Presenças</TableHead>
                  <TableHead className="text-center">Ausências</TableHead>
                  <TableHead className="text-center">Em Andam.</TableHead>
                  <TableHead className="text-center">Concluídos</TableHead>
                  <TableHead>Tratamentos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum dado encontrado</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.tarefeiroId}>
                    <TableCell className="font-medium">{r.tarefeiro}</TableCell>
                    <TableCell className="text-center">{r.totalAssistidos}</TableCell>
                    <TableCell className="text-center">{r.totalSessoes}</TableCell>
                    <TableCell className="text-center">{r.presencas}</TableCell>
                    <TableCell className="text-center">{r.ausencias}</TableCell>
                    <TableCell className="text-center">{r.emAndamento}</TableCell>
                    <TableCell className="text-center">{r.concluidos}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.tratamentos.join(", ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
