import { useState } from "react";
import { useIaIndicadores } from "@/hooks/useIaIndicadores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BarChart3, CheckCircle, AlertTriangle, Brain, MinusCircle, X } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";

const fmtPeriodo = (p: string) => {
  const [y, m] = p.split("-");
  return `${m}/${y.slice(2)}`;
};

export default function IndicadoresAssertividade() {
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const { data, loading } = useIaIndicadores({ inicio: inicio || null, fim: fim || null });

  const filtros = (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 pt-4">
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="h-9 w-[150px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="h-9 w-[150px]" />
        </div>
        {(inicio || fim) && (
          <Button variant="ghost" size="sm" onClick={() => { setInicio(""); setFim(""); }}>
            <X className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}
      </CardContent>
    </Card>
  );

  if (loading) return <div className="space-y-6">{filtros}<div className="text-center text-muted-foreground py-12">Carregando indicadores...</div></div>;

  const pieData = [
    { name: "Acertou totalmente", value: data.aderenciaTotal, color: "hsl(var(--primary))" },
    { name: "Acertou parcialmente", value: data.aderenciaParcial, color: "hsl(var(--secondary))" },
    { name: "Inadequada", value: data.divergencia, color: "hsl(var(--destructive))" },
    { name: "Inconclusiva", value: data.inconclusiva, color: "hsl(var(--muted-foreground))" },
    { name: "Sem uso", value: data.semUso, color: "hsl(var(--border))" },
  ].filter((d) => d.value > 0);

  const cards = [
    {
      label: "Entrevistas com apoio da IA",
      value: data.totalSugestoes,
      icon: Brain,
      hint: `${data.avaliadas} avaliadas · ${data.pendentes} pendentes`,
      tip: "Total de entrevistas em que a IA foi usada como apoio. A decisão final é sempre humana.",
    },
    {
      label: "Convergência total",
      value: `${data.taxaAderenciaTotal}%`,
      icon: CheckCircle,
      hint: `${data.aderenciaTotal} de ${data.baseAderencia} avaliações`,
      tip: "Percentual de casos em que a decisão humana coincidiu integralmente com a sugestão da IA. Não significa 'acerto absoluto' da IA — mede convergência com a decisão final registrada. Base exclui 'sem uso' e 'inconclusiva'.",
    },
    {
      label: "Convergência parcial",
      value: `${data.taxaAderenciaParcial}%`,
      icon: BarChart3,
      hint: `${data.aderenciaParcial} de ${data.baseAderencia} avaliações`,
      tip: "Casos em que a decisão humana coincidiu em parte com a sugestão da IA. Base exclui 'sem uso' e 'inconclusiva'.",
    },
    {
      label: "Divergência",
      value: `${data.taxaDivergencia}%`,
      icon: AlertTriangle,
      hint: `${data.divergencia} de ${data.baseAderencia} avaliações`,
      tip: "Casos em que a decisão humana diferiu da sugestão da IA. Divergência não é erro do entrevistador: a decisão fraterna/humana prevalece sobre o apoio da IA.",
    },
  ];

  return (
    <div className="space-y-6">
      {filtros}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <c.icon className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-bold mt-1">{c.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{c.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.avaliadas === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
            <MinusCircle className="h-8 w-8 opacity-50" />
            <p>Ainda não há sugestões avaliadas para gerar indicadores.</p>
            <p className="text-xs">Realize entrevistas usando o Assistente IA para alimentar este painel.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Distribuição das avaliações</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Evolução no tempo</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={data.evolucao.map((e) => ({ ...e, periodo: fmtPeriodo(e.periodo) }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="periodo" fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="sugestoes" name="Sugestões" stroke="hsl(var(--primary))" />
                    <Line type="monotone" dataKey="aderencia" name="Aderência" stroke="hsl(var(--secondary))" />
                    <Line type="monotone" dataKey="divergencia" name="Divergência" stroke="hsl(var(--destructive))" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Tratamentos mais sugeridos x atribuídos</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tratamento</TableHead>
                      <TableHead className="text-right">Sugeridos</TableHead>
                      <TableHead className="text-right">Atribuídos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const atrMap = new Map(data.tratamentosMaisAtribuidos.map((t) => [t.nome, t.total]));
                      const nomes = new Set([
                        ...data.tratamentosMaisSugeridos.map((t) => t.nome),
                        ...data.tratamentosMaisAtribuidos.map((t) => t.nome),
                      ]);
                      const sugMap = new Map(data.tratamentosMaisSugeridos.map((t) => [t.nome, t.total]));
                      const rows = [...nomes].sort((a, b) => (sugMap.get(b) || 0) - (sugMap.get(a) || 0));
                      if (rows.length === 0) {
                        return <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Sem dados</TableCell></TableRow>;
                      }
                      return rows.map((nome) => (
                        <TableRow key={nome}>
                          <TableCell>{nome}</TableCell>
                          <TableCell className="text-right">{sugMap.get(nome) || 0}</TableCell>
                          <TableCell className="text-right">{atrMap.get(nome) || 0}</TableCell>
                        </TableRow>
                      ));
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Queixas por assertividade</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={data.queixasMaiorAcerto}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="nome" fontSize={10} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis fontSize={11} domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="taxa" name="% acerto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {data.queixasMaiorDivergencia.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Queixas com maior divergência</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.queixasMaiorDivergencia.map((q) => (
                  <Badge key={q.nome} variant="destructive">
                    {q.nome} · {q.taxa}% ({q.divergencias}/{q.total})
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
