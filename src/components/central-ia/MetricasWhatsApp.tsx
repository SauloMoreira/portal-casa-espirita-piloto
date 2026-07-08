import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requireInstituicaoId } from "@/lib/tenant/currentTenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, PhoneForwarded, ShieldCheck, Brain, Sparkles,
  ArrowUp, ArrowDown, Minus, AlertTriangle, ListChecks, Wrench,
} from "lucide-react";
import {
  calcularJanelas, montarKpis, topN, truncar,
  agruparPadroesFalha, gerarBacklog,
  type PeriodoDias, type MetricasIaWhatsapp, type Delta, type Impacto,
} from "@/lib/whatsappMetricas";


const PERIODOS: { dias: PeriodoDias; label: string }[] = [
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
  { dias: 90, label: "90 dias" },
];

const IMPACTO_VARIANT: Record<Impacto, "destructive" | "default" | "secondary"> = {
  alto: "destructive",
  medio: "default",
  baixo: "secondary",
};
const IMPACTO_LABEL: Record<Impacto, string> = { alto: "Alto", medio: "Médio", baixo: "Baixo" };

function DeltaBadge({ delta, inverso = false }: { delta: Delta; inverso?: boolean }) {
  if (delta.direcao === "estavel") {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Minus className="h-3 w-3" /> estável</span>;
  }
  // inverso=true: subir é ruim (ex.: handoff). Define a cor semântica.
  const bom = inverso ? delta.direcao === "desceu" : delta.direcao === "subiu";
  const Icon = delta.direcao === "subiu" ? ArrowUp : ArrowDown;
  const txt = delta.variacaoPct === null
    ? `${delta.diferenca > 0 ? "+" : ""}${delta.diferenca}`
    : `${delta.variacaoPct > 0 ? "+" : ""}${delta.variacaoPct}%`;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${bom ? "text-emerald-600" : "text-destructive"}`}>
      <Icon className="h-3 w-3" /> {txt}
    </span>
  );
}

export default function MetricasWhatsApp() {
  const [dias, setDias] = useState<PeriodoDias>(30);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atual, setAtual] = useState<MetricasIaWhatsapp | null>(null);
  const [anterior, setAnterior] = useState<MetricasIaWhatsapp | null>(null);

  const carregar = useCallback(async (d: PeriodoDias) => {
    setLoading(true);
    setErro(null);
    try {
      const { atual: jAtual, anterior: jAnt } = calcularJanelas(d);
      const [r1, r2] = await Promise.all([
        supabase.rpc("metricas_ia_whatsapp", { p_inicio: jAtual.inicio, p_fim: jAtual.fim }),
        supabase.rpc("metricas_ia_whatsapp", { p_inicio: jAnt.inicio, p_fim: jAnt.fim }),
      ]);
      if (r1.error) throw r1.error;
      setAtual(r1.data as unknown as MetricasIaWhatsapp);
      setAnterior(r2.error ? null : (r2.data as unknown as MetricasIaWhatsapp));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar métricas.");
      setAtual(null);
      setAnterior(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(dias); }, [dias, carregar]);

  const seletor = (
    <div className="flex flex-wrap items-center gap-2">
      {PERIODOS.map((p) => (
        <Button key={p.dias} size="sm" variant={dias === p.dias ? "default" : "outline"} onClick={() => setDias(p.dias)}>
          {p.label}
        </Button>
      ))}
    </div>
  );

  if (loading) {
    return <div className="space-y-6">{seletor}<div className="text-center text-muted-foreground py-12">Carregando métricas...</div></div>;
  }
  if (erro) {
    return <div className="space-y-6">{seletor}<Card><CardContent className="py-8 text-center text-destructive">{erro}</CardContent></Card></div>;
  }
  if (!atual) return <div className="space-y-6">{seletor}</div>;

  const kpis = montarKpis(atual, anterior);
  const grupos = agruparPadroesFalha(atual.ambiguidades);
  const backlog = gerarBacklog(grupos, atual.volume.mensagens_recebidas);

  const cards = [
    { label: "Mensagens recebidas", value: atual.volume.mensagens_recebidas, icon: MessageSquare, delta: kpis.mensagens, inverso: false, hint: `${atual.volume.conversas} conversas` },
    { label: "Handoff", value: `${atual.handoff.pct_sobre_mensagens}%`, icon: PhoneForwarded, delta: kpis.pctHandoff, inverso: true, hint: `${atual.handoff.total} no período` },
    { label: "Resolvido sem fallback", value: `${atual.classificacao.pct_sem_fallback}%`, icon: ShieldCheck, delta: kpis.pctSemFallback, inverso: false, hint: `${atual.classificacao.total_complexo} em complexo` },
    { label: "Híbrido acionado", value: `${atual.hibrido.pct_sobre_total}%`, icon: Brain, delta: kpis.pctHibrido, inverso: true, hint: `conf. média ${atual.hibrido.confianca_media}` },
    { label: "Respostas com LLM", value: atual.hibrido.respostas_com_llm, icon: Sparkles, delta: kpis.respostasComLlm, inverso: false, hint: `${atual.volume.respostas_ia} respostas IA` },
  ];

  return (
    <div className="space-y-6">
      {seletor}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <c.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 text-2xl font-bold text-foreground">{c.value}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{c.hint}</span>
                <DeltaBadge delta={c.delta} inverso={c.inverso} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabelas operacionais */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankCard title="Top intenções" rows={topN(atual.classificacao.top_intents).map((i) => ({ label: i.intencao, total: i.total }))} />
        <RankCard title="Top motivos de handoff" rows={topN(atual.handoff.top_motivos).map((i) => ({ label: i.motivo, total: i.total }))} />
        <RankCard title="Top fallback" rows={topN(atual.classificacao.top_fallback).map((i) => ({ label: i.motivo, total: i.total }))} />
        <RankCard title="Top mensagens em complexo" rows={topN(atual.classificacao.top_complexo).map((i) => ({ label: truncar(i.texto, 60), total: i.total }))} />
      </div>

      {/* Ambiguidades */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Ambiguidades e erros recorrentes</CardTitle>
        </CardHeader>
        <CardContent>
          {atual.ambiguidades.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma ambiguidade relevante no período. 🌿</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-20">Freq.</TableHead>
                  <TableHead className="w-28">Intenção</TableHead>
                  <TableHead className="w-24">Escopo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topN(atual.ambiguidades, 20).map((a, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-sm">{truncar(a.texto, 70)}</TableCell>
                    <TableCell>{a.total}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.intencao ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.escopo ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Calibração / padrões de falha */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /> Calibração contínua — padrões de falha</CardTitle>
        </CardHeader>
        <CardContent>
          {grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem padrões de falha agrupáveis no período.</p>
          ) : (
            <div className="space-y-3">
              {grupos.map((g) => (
                <div key={g.categoria} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{g.rotulo}</span>
                    <Badge variant="secondary">{g.total} ocorrências</Badge>
                  </div>
                  {g.exemplos.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
                      {g.exemplos.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backlog inteligente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> Backlog de melhoria sugerido</CardTitle>
        </CardHeader>
        <CardContent>
          {backlog.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma frente de calibração prioritária no momento.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="w-20">Freq.</TableHead>
                  <TableHead className="w-24">Impacto</TableHead>
                  <TableHead>Sugestão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backlog.map((b) => (
                  <TableRow key={b.categoria}>
                    <TableCell className="text-sm font-medium">{b.rotulo}</TableCell>
                    <TableCell>{b.frequencia}</TableCell>
                    <TableCell><Badge variant={IMPACTO_VARIANT[b.impacto]}>{IMPACTO_LABEL[b.impacto]}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{b.sugestao}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RankCard({ title, rows }: { title: string; rows: { label: string; total: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados no período.</p>
        ) : (
          <Table>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{r.label}</TableCell>
                  <TableCell className="w-16 text-right font-medium">{r.total}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
