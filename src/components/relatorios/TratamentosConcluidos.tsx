import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import ReportFilters, { FilterValues, defaultFilters } from "./ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/StatCard";
import { Download, CheckCircle, Users, Activity, Calendar, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { exportCsv } from "@/lib/exportCsv";

interface Row {
  id: string;
  assistido: string;
  tratamento: string;
  tipoTratamento: string;
  dataInicio: string;
  dataConclusao: string;
  total: number;
  realizada: number;
  status: string;
  tarefeiro: string;
  coordenador: string;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 220 70% 50%))",
  "hsl(var(--chart-3, 150 60% 45%))",
  "hsl(var(--chart-4, 40 80% 55%))",
  "hsl(var(--chart-5, 280 60% 55%))",
];

export default function TratamentosConcluidos() {
  const [filters, setFilters] = useState<FilterValues>(defaultFilters());
  const [rows, setRows] = useState<Row[]>([]);
  const { role, user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      let q = supabase
        .from("assistido_tratamentos")
        .select("id, data_inicio, quantidade_total, quantidade_realizada, status, updated_at, assistido:assistidos(nome), tratamento:tipos_tratamento(id, nome, tipo, tarefeiro_id, coordenador_responsavel_id)")
        .eq("status", "concluido")
        .gte("updated_at", filters.dataInicio)
        .lte("updated_at", filters.dataFim + "T23:59:59");

      if (filters.tratamentoId !== "todos") q = q.eq("tratamento_id", filters.tratamentoId);

      const { data } = await q;
      if (!data) { setRows([]); return; }

      const filtered = data.filter((d: any) => {
        const t = d.tratamento as any;
        if (!t) return false;
        if (filters.tarefeiroId !== "todos" && t.tarefeiro_id !== filters.tarefeiroId) return false;
        if (filters.coordenadorId !== "todos" && t.coordenador_responsavel_id !== filters.coordenadorId) return false;
        if (filters.tipoTratamento !== "todos" && t.tipo !== filters.tipoTratamento) return false;
        if (role === "coordenador_de_tratamento" && t.coordenador_responsavel_id !== user?.id) return false;
        if (role === "tarefeiro" && t.tarefeiro_id && t.tarefeiro_id !== user?.id) return false;
        return true;
      });

      // Collect unique tarefeiro/coordenador IDs for name resolution
      const tarefIds = new Set<string>();
      const coordIds = new Set<string>();
      filtered.forEach((d: any) => {
        if (d.tratamento?.tarefeiro_id) tarefIds.add(d.tratamento.tarefeiro_id);
        if (d.tratamento?.coordenador_responsavel_id) coordIds.add(d.tratamento.coordenador_responsavel_id);
      });

      const allIds = [...new Set([...tarefIds, ...coordIds])];
      let nameMap = new Map<string, string>();
      if (allIds.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("user_id, nome_completo").in("user_id", allIds);
        (profiles || []).forEach((p) => nameMap.set(p.user_id, p.nome_completo || "Sem nome"));
      }

      setRows(filtered.map((d: any) => ({
        id: d.id,
        assistido: d.assistido?.nome || "—",
        tratamento: d.tratamento?.nome || "—",
        tipoTratamento: d.tratamento?.tipo || "—",
        dataInicio: d.data_inicio ? new Date(d.data_inicio + "T12:00:00").toLocaleDateString("pt-BR") : "—",
        dataConclusao: new Date(d.updated_at).toLocaleDateString("pt-BR"),
        total: d.quantidade_total,
        realizada: d.quantidade_realizada,
        status: d.status,
        tarefeiro: d.tratamento?.tarefeiro_id ? nameMap.get(d.tratamento.tarefeiro_id) || "—" : "—",
        coordenador: d.tratamento?.coordenador_responsavel_id ? nameMap.get(d.tratamento.coordenador_responsavel_id) || "—" : "—",
      })));
    };
    fetchData();
  }, [filters, role, user]);

  const assistidosUnicos = new Set(rows.map((r) => r.assistido)).size;
  const tratamentosUnicos = new Set(rows.map((r) => r.tratamento)).size;
  const totalSessoes = rows.reduce((s, r) => s + r.realizada, 0);

  // Por tipo de tratamento
  const porTipo = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.tipoTratamento] = (acc[r.tipoTratamento] || 0) + 1;
    return acc;
  }, {});

  // Por tratamento (para bar chart)
  const porTratamento = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.tratamento] = (acc[r.tratamento] || 0) + 1;
    return acc;
  }, {});

  const barData = Object.entries(porTratamento)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name: name.length > 15 ? name.slice(0, 15) + "…" : name, Concluídos: value }));

  const pieData = Object.entries(porTipo).map(([name, value]) => ({ name, value }));

  // Tratamento com mais conclusões
  const topTratamento = barData.length > 0 ? barData[0].name : "—";

  return (
    <div className="space-y-6">
      <ReportFilters values={filters} onChange={setFilters} show={["dataInicio", "dataFim", "tratamentoId", "tipoTratamento", "tarefeiroId", "coordenadorId"]} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Concluídos" value={rows.length} icon={CheckCircle} />
        <StatCard title="Assistidos" value={assistidosUnicos} icon={Users} />
        <StatCard title="Tipos Tratamento" value={Object.keys(porTipo).length} icon={Activity} />
        <StatCard title="Sessões Realizadas" value={totalSessoes} icon={Calendar} />
        <StatCard title="Mais Concluído" value={topTratamento} icon={Trophy} />
      </div>

      {(barData.length > 0 || pieData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {barData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Concluídos por Tratamento</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData}>
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="Concluídos" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {pieData.length > 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Distribuição por Tipo</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Detalhamento</CardTitle>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => exportCsv("tratamentos_concluidos.csv", ["Assistido", "Tratamento", "Tipo", "Início", "Conclusão", "Total", "Realizada", "Tarefeiro", "Coordenador", "Status"], rows.map((r) => [r.assistido, r.tratamento, r.tipoTratamento, r.dataInicio, r.dataConclusao, String(r.total), String(r.realizada), r.tarefeiro, r.coordenador, r.status]))}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assistido</TableHead>
                  <TableHead>Tratamento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Conclusão</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Realiz.</TableHead>
                  <TableHead>Tarefeiro</TableHead>
                  <TableHead>Coordenador</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum dado encontrado</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.assistido}</TableCell>
                    <TableCell className="text-sm">{r.tratamento}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.tipoTratamento}</TableCell>
                    <TableCell className="text-sm">{r.dataInicio}</TableCell>
                    <TableCell className="text-sm">{r.dataConclusao}</TableCell>
                    <TableCell className="text-center">{r.total}</TableCell>
                    <TableCell className="text-center">{r.realizada}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.tarefeiro}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.coordenador}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">Concluído</Badge></TableCell>
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
