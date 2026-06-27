import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getTratamentosCoordenados } from "@/services/coordenacao/escopo";
import ReportFilters, { FilterValues, defaultFilters } from "./ReportFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/StatCard";
import { Download, Users, Activity, CheckCircle, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { exportCsv } from "@/lib/exportCsv";

interface Row {
  tratamento: string;
  tipo: string;
  total: number;
  emAndamento: number;
  aguardando: number;
  concluido: number;
  outros: number;
}

export default function AssistidosPorTratamento() {
  const [filters, setFilters] = useState<FilterValues>(defaultFilters());
  const [rows, setRows] = useState<Row[]>([]);
  const { role, user } = useAuth();

  useEffect(() => {
    const fetch = async () => {
      // Escopo N:N: ids de tratamentos sob coordenação (do próprio usuário e/ou do filtro)
      const meusTratIds =
        role === "coordenador_de_tratamento" && user?.id
          ? new Set(await getTratamentosCoordenados(user.id))
          : null;
      let filtroCoordIds: Set<string> | null = null;
      if (filters.coordenadorId !== "todos") {
        const { data: ct } = await supabase
          .from("coordenacao_tratamento")
          .select("tratamento_id")
          .eq("coordenador_id", filters.coordenadorId);
        filtroCoordIds = new Set((ct || []).map((r) => r.tratamento_id));
      }

      let q = supabase
        .from("assistido_tratamentos")
        .select("tratamento_id, status, tratamento:tipos_tratamento(nome, tipo, tarefeiro_id)")
        .gte("created_at", filters.dataInicio)
        .lte("created_at", filters.dataFim + "T23:59:59")
        .limit(5000);

      if (filters.tratamentoId !== "todos") q = q.eq("tratamento_id", filters.tratamentoId);
      if (filters.status !== "todos") q = q.eq("status", filters.status);

      const { data } = await q;
      if (!data) { setRows([]); return; }

      const filtered = data.filter((d: any) => {
        const t = d.tratamento as any;
        if (!t) return false;
        if (filters.tarefeiroId !== "todos" && t.tarefeiro_id !== filters.tarefeiroId) return false;
        if (filtroCoordIds && !filtroCoordIds.has(d.tratamento_id)) return false;
        if (filters.tipoTratamento !== "todos" && t.tipo !== filters.tipoTratamento) return false;
        if (meusTratIds && !meusTratIds.has(d.tratamento_id)) return false;
        if (role === "tarefeiro" && t.tarefeiro_id && t.tarefeiro_id !== user?.id) return false;
        return true;
      });

      const map = new Map<string, Row>();
      filtered.forEach((d: any) => {
        const t = d.tratamento as any;
        const key = d.tratamento_id;
        if (!map.has(key)) map.set(key, { tratamento: t.nome, tipo: t.tipo, total: 0, emAndamento: 0, aguardando: 0, concluido: 0, outros: 0 });
        const r = map.get(key)!;
        r.total++;
        if (d.status === "em_andamento") r.emAndamento++;
        else if (["aguardando_inicio", "aguardando_liberacao"].includes(d.status)) r.aguardando++;
        else if (d.status === "concluido") r.concluido++;
        else r.outros++;
      });

      setRows([...map.values()].sort((a, b) => a.tratamento.localeCompare(b.tratamento)));
    };
    fetch();
  }, [filters, role, user]);

  const totals = rows.reduce((acc, r) => ({ total: acc.total + r.total, andamento: acc.andamento + r.emAndamento, aguardando: acc.aguardando + r.aguardando, concluido: acc.concluido + r.concluido }), { total: 0, andamento: 0, aguardando: 0, concluido: 0 });

  const colors = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))"];

  return (
    <div className="space-y-6">
      <ReportFilters values={filters} onChange={setFilters} show={["dataInicio", "dataFim", "tratamentoId", "tarefeiroId", "coordenadorId", "status"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Vinculados" value={totals.total} icon={Users} />
        <StatCard title="Em Andamento" value={totals.andamento} icon={Activity} />
        <StatCard title="Aguardando" value={totals.aguardando} icon={Clock} />
        <StatCard title="Concluídos" value={totals.concluido} icon={CheckCircle} />
      </div>

      {rows.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={rows.slice(0, 10)}>
                <XAxis dataKey="tratamento" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="total" name="Total" radius={[4, 4, 0, 0]}>
                  {rows.slice(0, 10).map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm font-semibold">Detalhamento</CardTitle>
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => exportCsv("assistidos_por_tratamento.csv", ["Tratamento", "Tipo", "Total", "Em Andamento", "Aguardando", "Concluído", "Outros"], rows.map((r) => [r.tratamento, r.tipo, String(r.total), String(r.emAndamento), String(r.aguardando), String(r.concluido), String(r.outros)]))}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tratamento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Total</TableHead>
                  <TableHead className="text-center">Em Andamento</TableHead>
                  <TableHead className="text-center">Aguardando</TableHead>
                  <TableHead className="text-center">Concluído</TableHead>
                  <TableHead className="text-center">Outros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum dado encontrado</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.tratamento}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.tipo}</TableCell>
                    <TableCell className="text-center">{r.total}</TableCell>
                    <TableCell className="text-center">{r.emAndamento}</TableCell>
                    <TableCell className="text-center">{r.aguardando}</TableCell>
                    <TableCell className="text-center">{r.concluido}</TableCell>
                    <TableCell className="text-center">{r.outros}</TableCell>
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