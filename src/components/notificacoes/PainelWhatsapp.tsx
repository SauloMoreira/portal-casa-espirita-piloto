import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/StatCard";
import {
  Send, CheckCircle2, XCircle, MessageSquareText, BellOff, Headphones,
  Bot, TrendingUp, TrendingDown, CalendarCheck, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useWhatsappPanel } from "@/hooks/useWhatsappPanel";

const TIPO_LABELS: Record<string, string> = {
  entrevista_agendada: "Entrevista agendada",
  entrevista_lembrete: "Lembrete de entrevista",
  sessao_agendada: "Sessão agendada",
  sessao_lembrete: "Lembrete de sessão",
  remarcacao: "Remarcação",
  cancelamento: "Cancelamento",
};

const INTENT_LABELS: Record<string, string> = {
  proxima_sessao: "Próxima sessão",
  horario_entrevista: "Horário entrevista",
  confirmacao_agendamento: "Confirmação",
  onde_ver_app: "Onde ver no app",
  opt_out: "Opt-out",
  reativar: "Reativar",
  complexo: "Atendimento humano",
  desconhecido: "Desconhecido",
};

function dt(value?: string | null) {
  if (!value) return "—";
  return format(new Date(value), "dd/MM/yy HH:mm", { locale: ptBR });
}

export function PainelWhatsapp() {
  const { data, loading, error, inicio, fim, setInicio, setFim } = useWhatsappPanel(14);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (error) {
    return <Card className="glass-card"><CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent></Card>;
  }

  if (!data || data.autorizado === false) {
    return <Card className="glass-card"><CardContent className="py-8 text-center text-sm text-muted-foreground">Você não tem acesso a este painel.</CardContent></Card>;
  }

  const op = data.operacional;
  const imp = data.impacto;
  const taxaSucesso = op && op.geradas > 0 ? Math.round((op.enviadas / op.geradas) * 100) : 0;
  const presDelta = imp ? imp.presenca_atual_pct - imp.presenca_anterior_pct : 0;
  const faltasDelta = imp ? imp.faltas_atual - imp.faltas_anterior : 0;

  return (
    <div className="space-y-6">
      {/* Período */}
      <Card className="glass-card">
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="space-y-1">
            <Label className="text-xs">De</Label>
            <Input type="date" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} className="h-9 w-auto" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Até</Label>
            <Input type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className="h-9 w-auto" />
          </div>
          <p className="text-xs text-muted-foreground ml-auto">
            Rollout controlado · eventos operacionais (entrevistas e sessões)
          </p>
        </CardContent>
      </Card>

      {/* Volume e sucesso */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Geradas" value={op?.geradas ?? 0} icon={MessageSquareText} subtitle="na fila no período" />
        <StatCard title="Enviadas" value={op?.enviadas ?? 0} icon={CheckCircle2} subtitle={`${taxaSucesso}% de sucesso`} />
        <StatCard title="Falhas" value={op?.falhas ?? 0} icon={XCircle} subtitle="envios com erro" />
        <StatCard title="Recebidas" value={op?.inbound ?? 0} icon={Send} subtitle="mensagens inbound" />
        <StatCard title="Opt-out" value={op?.optout ?? 0} icon={BellOff} subtitle="no período" />
        <StatCard title="Handoffs abertos" value={op?.handoffs_abertos ?? 0} icon={Headphones} subtitle={`${op?.handoffs_resolvidos ?? 0} resolvidos`} />
        <StatCard title="Resolvidas pela IA" value={op?.intents_ia ?? 0} icon={Bot} subtitle="sem atendimento humano" />
        <StatCard title="Pendentes" value={(op?.pendentes ?? 0) + (op?.agendados ?? 0)} icon={MessageSquareText} subtitle="aguardando envio" />
      </div>

      {/* Impacto presença / faltas */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-primary" /> Impacto na presença</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-display font-bold">{imp?.presenca_atual_pct ?? 0}%</span>
              <span className={`text-sm flex items-center gap-1 ${presDelta >= 0 ? "text-green-600" : "text-red-600"}`}>
                {presDelta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {presDelta >= 0 ? "+" : ""}{presDelta} p.p.
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Período anterior: {imp?.presenca_anterior_pct ?? 0}% · {imp?.presentes_atual ?? 0} presenças / {imp?.ausentes_atual ?? 0} ausências
            </p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-primary" /> Faltas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-display font-bold">{imp?.faltas_atual ?? 0}</span>
              <span className={`text-sm flex items-center gap-1 ${faltasDelta <= 0 ? "text-green-600" : "text-red-600"}`}>
                {faltasDelta <= 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                {faltasDelta >= 0 ? "+" : ""}{faltasDelta}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Período anterior: {imp?.faltas_anterior ?? 0} faltas</p>
          </CardContent>
        </Card>
      </div>

      {/* Taxa de entrega por tipo */}
      <Card className="glass-card">
        <CardHeader className="pb-2"><CardTitle className="text-base">Entrega por tipo de mensagem</CardTitle></CardHeader>
        <CardContent>
          {(data.por_tipo?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sem mensagens no período.</p>
          ) : (
            <div className="space-y-2">
              {data.por_tipo!.map((t) => (
                <div key={t.tipo} className="flex items-center gap-3 text-sm">
                  <span className="w-44 shrink-0 truncate">{TIPO_LABELS[t.tipo] || t.tipo}</span>
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

      <div className="grid md:grid-cols-2 gap-3">
        {/* Intents inbound */}
        <Card className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Principais intenções recebidas</CardTitle></CardHeader>
          <CardContent>
            {(data.intents?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma mensagem recebida.</p>
            ) : (
              <div className="space-y-2">
                {data.intents!.map((i) => (
                  <div key={i.intent} className="flex items-center justify-between text-sm">
                    <span>{INTENT_LABELS[i.intent] || i.intent}</span>
                    <Badge variant="secondary">{i.total}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Falhas recentes */}
        <Card className="glass-card">
          <CardHeader className="pb-2"><CardTitle className="text-base">Falhas recentes</CardTitle></CardHeader>
          <CardContent>
            {(data.falhas_recentes?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma falha de envio. 🎉</p>
            ) : (
              <div className="space-y-2">
                {data.falhas_recentes!.map((f, idx) => (
                  <div key={idx} className="rounded-lg border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{TIPO_LABELS[f.tipo] || f.tipo}</span>
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
    </div>
  );
}
