import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/StatCard";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Send, CheckCircle2, XCircle, MessageSquareText, BellOff, Headphones,
  Bot, TrendingUp, TrendingDown, CalendarCheck, AlertTriangle, RotateCcw,
  Clock, Download, Timer, Users,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useWhatsappPanelV2, type RangePreset } from "@/hooks/useWhatsappPanelV2";
import {
  taxaSucesso, taxaResposta, taxaOptOut, taxaHandoff, reducaoFaltas,
  formatDuracao, tipoLabel, intentLabel, buildCsv, downloadCsv, EVENTO_LABELS,
} from "@/lib/whatsappMetrics";

const STATUS_OPTS = [
  { v: "all", l: "Todos os status" },
  { v: "enviado", l: "Enviado" },
  { v: "falha", l: "Falha" },
  { v: "pendente", l: "Pendente" },
  { v: "agendado", l: "Agendado" },
  { v: "cancelado", l: "Cancelado" },
];
const TEMPLATE_OPTS = [
  { v: "all", l: "Todos os tipos" },
  { v: "entrevista_agendada", l: "Entrevista agendada" },
  { v: "entrevista_lembrete", l: "Lembrete de entrevista" },
  { v: "sessao_agendada", l: "Sessão agendada" },
  { v: "sessao_lembrete", l: "Lembrete de sessão" },
  { v: "remarcacao", l: "Remarcação" },
  { v: "cancelamento", l: "Cancelamento" },
];
const RESOLUCAO_OPTS = [
  { v: "all", l: "IA + Humano" },
  { v: "ia", l: "Resolvida pela IA" },
  { v: "handoff", l: "Atendimento humano" },
];

function dt(value?: string | null) {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yy HH:mm", { locale: ptBR });
}

function Delta({ value, invert = false, suffix = "" }: { value: number; invert?: boolean; suffix?: string }) {
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`text-sm flex items-center gap-1 ${good ? "text-green-600" : "text-red-600"}`}>
      <Icon className="h-4 w-4" />
      {value >= 0 ? "+" : ""}{value}{suffix}
    </span>
  );
}

export function PainelWhatsapp() {
  const {
    data, loading, error, inicio, fim, preset, filtros,
    setPreset, setInicio, setFim, setFiltro, resetFiltros,
  } = useWhatsappPanelV2("semanal");

  const ent = data?.entrega;
  const eng = data?.engajamento;
  const efe = data?.efetividade;
  const ia = data?.ia_humano;
  const qua = data?.qualidade;

  const kpis = useMemo(() => {
    if (!ent) return null;
    return {
      sucesso: taxaSucesso(ent.enviadas, ent.geradas),
      resposta: taxaResposta(ent.inbound, ent.enviadas),
      optout: taxaOptOut(eng?.optout ?? 0, eng?.assistidos_impactados ?? 0),
      handoff: taxaHandoff(ia?.handoffs ?? 0, ia?.inbound ?? 0),
      reducaoFaltas: reducaoFaltas(efe?.faltas_anterior ?? 0, efe?.faltas_atual ?? 0),
    };
  }, [ent, eng, ia, efe]);

  function exportCsv() {
    if (!data || !ent) return;
    const rows: Array<Array<unknown>> = [
      ["Mensagens geradas", ent.geradas],
      ["Mensagens enviadas", ent.enviadas],
      ["Falhas de envio", ent.falhas],
      ["Taxa de sucesso (%)", kpis?.sucesso ?? 0],
      ["Tempo médio até envio (s)", ent.tempo_medio_envio_seg],
      ["Inbound recebidas", ent.inbound],
      ["Retries", ent.retries],
      ["Taxa de resposta (%)", kpis?.resposta ?? 0],
      ["Opt-out no período", eng?.optout ?? 0],
      ["Reativações", eng?.reativacoes ?? 0],
      ["Taxa de opt-out (%)", kpis?.optout ?? 0],
      ["Média msgs/assistido", eng?.media_msgs_por_assistido ?? 0],
      ["Presença atual (%)", efe?.presenca_atual_pct ?? 0],
      ["Presença anterior (%)", efe?.presenca_anterior_pct ?? 0],
      ["Faltas no período", efe?.faltas_atual ?? 0],
      ["Faltas período anterior", efe?.faltas_anterior ?? 0],
      ["Redução de faltas (%)", kpis?.reducaoFaltas ?? 0],
      ["Comparecimento após lembrete (%)", efe?.comparecimento_apos_lembrete_pct ?? 0],
      ["Inbound tratadas", ia?.inbound ?? 0],
      ["Resolvidas pela IA", ia?.resolvidas_ia ?? 0],
      ["Handoffs", ia?.handoffs ?? 0],
      ["Taxa de handoff (%)", kpis?.handoff ?? 0],
      ["Tempo médio até resolução humana (s)", ia?.tempo_medio_resolucao_seg ?? 0],
      ["Mensagens fora da janela", qua?.fora_janela ?? 0],
      ["Bloqueadas por deduplicação", qua?.dedup_bloqueadas ?? 0],
      ["Barradas por limite diário", qua?.limite_diario_barradas ?? 0],
      ["Sem telefone", qua?.sem_telefone ?? 0],
    ];
    const csv = buildCsv(["Indicador", "Valor"], rows);
    downloadCsv(`painel-whatsapp_${inicio}_${fim}.csv`, csv);
  }

  function exportFalhasCsv() {
    if (!ent) return;
    const rows = ent.falhas_recentes.map((f) => [
      tipoLabel(f.tipo), EVENTO_LABELS[f.evento] || f.evento, f.telefone ?? "", f.erro ?? "", f.retries, dt(f.quando),
    ]);
    downloadCsv(`falhas-whatsapp_${inicio}_${fim}.csv`, buildCsv(
      ["Tipo", "Evento", "Telefone", "Erro", "Retries", "Quando"], rows));
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }
  if (error) {
    return <Card><CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent></Card>;
  }
  if (!data || data.autorizado === false) {
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Você não tem acesso a este painel.</CardContent></Card>;
  }

  const serie = (data.serie ?? []).map((p) => ({
    ...p, label: format(new Date(p.dia + "T00:00:00"), "dd/MM", { locale: ptBR }),
  }));
  const presDelta = (efe?.presenca_atual_pct ?? 0) - (efe?.presenca_anterior_pct ?? 0);
  const faltasDelta = (efe?.faltas_atual ?? 0) - (efe?.faltas_anterior ?? 0);
  const horariosChart = (eng?.horarios ?? []).map((h) => ({ hora: `${String(h.hora).padStart(2, "0")}h`, total: h.total }));

  return (
    <div className="space-y-6">
      {/* ===== Filtros ===== */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="flex gap-1 rounded-lg border p-1">
            {(["diario", "semanal", "mensal", "custom"] as RangePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setPreset(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                  preset === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "custom" ? "Personalizado" : p}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={inicio} max={fim} onChange={(e) => { setInicio(e.target.value); setPreset("custom"); }} className="h-9 w-auto" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={fim} min={inicio} onChange={(e) => { setFim(e.target.value); setPreset("custom"); }} className="h-9 w-auto" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo de mensagem</Label>
            <Select value={filtros.template ?? "all"} onValueChange={(v) => setFiltro("template", v === "all" ? null : v)}>
              <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{TEMPLATE_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status de envio</Label>
            <Select value={filtros.status ?? "all"} onValueChange={(v) => setFiltro("status", v === "all" ? null : v)}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Resolução</Label>
            <Select value={filtros.resolucao ?? "all"} onValueChange={(v) => setFiltro("resolucao", v === "all" ? null : (v as "ia" | "handoff"))}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{RESOLUCAO_OPTS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" onClick={resetFiltros} className="h-9">
            <RotateCcw className="h-4 w-4 mr-1" /> Limpar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} className="h-9 ml-auto">
            <Download className="h-4 w-4 mr-1" /> Exportar CSV
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="completo">
        <TabsList>
          <TabsTrigger value="completo">Visão completa</TabsTrigger>
          <TabsTrigger value="semanal">Resumo executivo</TabsTrigger>
        </TabsList>

        {/* ===================== VISÃO COMPLETA ===================== */}
        <TabsContent value="completo" className="space-y-6 mt-4">
          {/* BLOCO 1 — Entrega e operação */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Entrega e operação</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Geradas" value={ent?.geradas ?? 0} icon={MessageSquareText} subtitle="na fila no período" />
              <StatCard title="Enviadas" value={ent?.enviadas ?? 0} icon={CheckCircle2} subtitle={`${kpis?.sucesso ?? 0}% de sucesso`} />
              <StatCard title="Falhas" value={ent?.falhas ?? 0} icon={XCircle} subtitle="envios com erro" />
              <StatCard title="Recebidas" value={ent?.inbound ?? 0} icon={Send} subtitle="mensagens inbound" />
              <StatCard title="Tempo até envio" value={formatDuracao(ent?.tempo_medio_envio_seg)} icon={Timer} subtitle="médio geração→envio" />
              <StatCard title="Retries" value={ent?.retries ?? 0} icon={RotateCcw} subtitle="tentativas de reenvio" />
              <StatCard title="Pendentes" value={(ent?.pendentes ?? 0) + (ent?.agendados ?? 0)} icon={Clock} subtitle="aguardando envio" />
              <StatCard title="Sem telefone" value={ent?.sem_telefone ?? 0} icon={AlertTriangle} subtitle="não entregáveis" />
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Volume por período</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="geradas" name="Geradas" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="enviadas" name="Enviadas" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="falhas" name="Falhas" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="inbound" name="Inbound" stroke="hsl(142 71% 45%)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Falhas por tipo de evento</CardTitle></CardHeader>
                <CardContent>
                  {(ent?.falhas_por_evento?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma falha no período. 🎉</p>
                  ) : (
                    <div className="space-y-2">
                      {ent!.falhas_por_evento.map((f) => (
                        <div key={f.evento} className="flex items-center justify-between text-sm">
                          <span>{EVENTO_LABELS[f.evento] || f.evento}</span>
                          <Badge variant="destructive">{f.falhas} / {f.total}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Falhas recentes</CardTitle>
                  {(ent?.falhas_recentes?.length ?? 0) > 0 && (
                    <Button variant="ghost" size="sm" onClick={exportFalhasCsv}><Download className="h-3.5 w-3.5" /></Button>
                  )}
                </CardHeader>
                <CardContent>
                  {(ent?.falhas_recentes?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma falha de envio. 🎉</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {ent!.falhas_recentes.map((f, idx) => (
                        <div key={idx} className="rounded-lg border p-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{tipoLabel(f.tipo)}</span>
                            <span className="text-muted-foreground">{dt(f.quando)}</span>
                          </div>
                          <p className="text-muted-foreground">{f.telefone || "sem telefone"} · <span className="text-destructive">{f.erro || "erro"}</span></p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* BLOCO 2 — Engajamento */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Engajamento do assistido</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Respostas inbound" value={eng?.inbound ?? 0} icon={Send} subtitle={`${kpis?.resposta ?? 0}% taxa de resposta`} />
              <StatCard title="Opt-out" value={eng?.optout ?? 0} icon={BellOff} subtitle={`${kpis?.optout ?? 0}% dos impactados`} />
              <StatCard title="Reativações" value={eng?.reativacoes ?? 0} icon={RotateCcw} subtitle="voltaram ao canal" />
              <StatCard title="Msgs / assistido" value={eng?.media_msgs_por_assistido ?? 0} icon={Users} subtitle={`${eng?.assistidos_impactados ?? 0} impactados`} />
            </div>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Horários com maior resposta</CardTitle></CardHeader>
              <CardContent className="h-56">
                {horariosChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma resposta recebida no período.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={horariosChart} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="hora" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="total" name="Respostas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </section>

          {/* BLOCO 3 — Efetividade */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Efetividade operacional</h3>
            <div className="grid md:grid-cols-3 gap-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-primary" /> Presença</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-display font-bold">{efe?.presenca_atual_pct ?? 0}%</span>
                    <Delta value={presDelta} suffix=" p.p." />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Anterior: {efe?.presenca_anterior_pct ?? 0}% · {efe?.presentes_atual ?? 0} presenças / {efe?.ausentes_atual ?? 0} ausências
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Faltas</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-display font-bold">{efe?.faltas_atual ?? 0}</span>
                    <Delta value={faltasDelta} invert />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Anterior: {efe?.faltas_anterior ?? 0} · Redução: {kpis?.reducaoFaltas ?? 0}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Após lembrete</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="text-3xl font-display font-bold">{efe?.comparecimento_apos_lembrete_pct ?? 0}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Comparecimento entre {efe?.comparecimento_base ?? 0} sessões de quem recebeu lembrete
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* BLOCO 4 — IA e humano */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">IA e atendimento humano</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Inbound tratadas" value={ia?.inbound ?? 0} icon={MessageSquareText} subtitle="mensagens recebidas" />
              <StatCard title="Resolvidas pela IA" value={ia?.resolvidas_ia ?? 0} icon={Bot} subtitle="sem escalonamento" />
              <StatCard title="Handoffs" value={ia?.handoffs ?? 0} icon={Headphones} subtitle={`${kpis?.handoff ?? 0}% taxa de handoff`} />
              <StatCard title="Tempo até resolução" value={formatDuracao(ia?.tempo_medio_resolucao_seg)} icon={Timer} subtitle="médio do humano" />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Intenções recebidas</CardTitle></CardHeader>
                <CardContent>
                  {(ia?.intents?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma mensagem recebida.</p>
                  ) : (
                    <div className="space-y-2">
                      {ia!.intents.map((i) => (
                        <div key={i.intent} className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            {intentLabel(i.intent)}
                            {i.resolvida && <Badge variant="secondary" className="text-[10px]">IA</Badge>}
                          </span>
                          <Badge variant="outline">{i.total}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Motivos de handoff</CardTitle></CardHeader>
                <CardContent>
                  {(ia?.motivos?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhum handoff no período.</p>
                  ) : (
                    <div className="space-y-2">
                      {ia!.motivos.map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="truncate pr-2">{m.motivo}</span>
                          <Badge variant="outline">{m.total}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          {/* BLOCO 5 — Qualidade */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Qualidade da comunicação</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Fora da janela" value={qua?.fora_janela ?? 0} icon={Clock} subtitle="deve ser zero" />
              <StatCard title="Dedup. bloqueadas" value={qua?.dedup_bloqueadas ?? 0} icon={CheckCircle2} subtitle="anti-duplicação" />
              <StatCard title="Limite diário" value={qua?.limite_diario_barradas ?? 0} icon={AlertTriangle} subtitle="barradas" />
              <StatCard title="Canceladas" value={qua?.canceladas ?? 0} icon={XCircle} subtitle="na fila" />
            </div>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Entrega por tipo de mensagem</CardTitle></CardHeader>
              <CardContent>
                {(qua?.por_tipo?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sem mensagens no período.</p>
                ) : (
                  <div className="space-y-2">
                    {qua!.por_tipo.map((t) => (
                      <div key={t.tipo} className="flex items-center gap-3 text-sm">
                        <span className="w-44 shrink-0 truncate">{tipoLabel(t.tipo)}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${t.taxa_entrega}%` }} />
                        </div>
                        <span className="w-12 text-right tabular-nums">{t.taxa_entrega}%</span>
                        <span className="w-24 text-right text-xs text-muted-foreground">{t.enviadas}/{t.geradas} env.</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            {(qua?.optout_por_tipo?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Opt-out por tipo de mensagem</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {qua!.optout_por_tipo.map((t, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span>{tipoLabel(t.tipo)}</span>
                        <Badge variant="destructive">{t.total}</Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        </TabsContent>

        {/* ===================== RESUMO EXECUTIVO ===================== */}
        <TabsContent value="semanal" className="space-y-6 mt-4">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Saúde do canal</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatCard title="Enviadas" value={ent?.enviadas ?? 0} icon={CheckCircle2} subtitle={`${kpis?.sucesso ?? 0}% sucesso`} />
              <StatCard title="Falhas" value={ent?.falhas ?? 0} icon={XCircle} subtitle="envios com erro" />
              <StatCard title="Inbound" value={ent?.inbound ?? 0} icon={Send} subtitle="recebidas" />
              <StatCard title="Opt-out" value={eng?.optout ?? 0} icon={BellOff} subtitle="no período" />
              <StatCard title="Taxa resposta" value={`${kpis?.resposta ?? 0}%`} icon={MessageSquareText} subtitle="inbound/enviadas" />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Impacto operacional</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Presença" value={`${efe?.presenca_atual_pct ?? 0}%`} icon={CalendarCheck} subtitle={`antes: ${efe?.presenca_anterior_pct ?? 0}%`} />
              <StatCard title="Faltas" value={efe?.faltas_atual ?? 0} icon={AlertTriangle} subtitle={`antes: ${efe?.faltas_anterior ?? 0}`} />
              <StatCard title="Redução faltas" value={`${kpis?.reducaoFaltas ?? 0}%`} icon={TrendingDown} subtitle="vs. período anterior" />
              <StatCard title="Após lembrete" value={`${efe?.comparecimento_apos_lembrete_pct ?? 0}%`} icon={CheckCircle2} subtitle="comparecimento" />
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">IA e atendimento</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard title="Resolvidas IA" value={ia?.resolvidas_ia ?? 0} icon={Bot} subtitle="sem escalonamento" />
              <StatCard title="Handoffs" value={ia?.handoffs ?? 0} icon={Headphones} subtitle={`${kpis?.handoff ?? 0}% taxa`} />
              <StatCard title="Resolução humana" value={formatDuracao(ia?.tempo_medio_resolucao_seg)} icon={Timer} subtitle="tempo médio" />
              <StatCard title="Resolvidos" value={ia?.handoffs_resolvidos ?? 0} icon={CheckCircle2} subtitle="handoffs fechados" />
            </div>
            {(ia?.motivos?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Principais motivos de handoff</CardTitle></CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {ia!.motivos.slice(0, 6).map((m, idx) => (
                      <Badge key={idx} variant="outline">{m.motivo} · {m.total}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Aprendizados</h3>
            <div className="grid md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Mensagens com melhor / pior entrega</CardTitle></CardHeader>
                <CardContent>
                  {(qua?.por_tipo?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Sem dados no período.</p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {[...qua!.por_tipo].sort((a, b) => b.taxa_entrega - a.taxa_entrega).slice(0, 1).map((t) => (
                        <div key={"best" + t.tipo} className="flex items-center justify-between">
                          <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-600" /> {tipoLabel(t.tipo)}</span>
                          <Badge variant="secondary">{t.taxa_entrega}%</Badge>
                        </div>
                      ))}
                      {[...qua!.por_tipo].sort((a, b) => a.taxa_entrega - b.taxa_entrega).slice(0, 1).map((t) => (
                        <div key={"worst" + t.tipo} className="flex items-center justify-between">
                          <span className="flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-600" /> {tipoLabel(t.tipo)}</span>
                          <Badge variant="secondary">{t.taxa_entrega}%</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Dúvidas mais frequentes</CardTitle></CardHeader>
                <CardContent>
                  {(ia?.intents?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma mensagem recebida.</p>
                  ) : (
                    <div className="space-y-2">
                      {ia!.intents.slice(0, 5).map((i) => (
                        <div key={i.intent} className="flex items-center justify-between text-sm">
                          <span>{intentLabel(i.intent)}</span>
                          <Badge variant="outline">{i.total}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
