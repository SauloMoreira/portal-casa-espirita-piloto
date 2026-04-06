import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAvisos } from "@/hooks/useAvisos";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Calendar, CheckCircle, Clock, Bell, MapPin } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_LABELS: Record<string, string> = {
  aguardando_inicio: "Aguardando", em_andamento: "Em Andamento", concluido: "Concluído",
};

export default function AssistidoDashboard() {
  const [tratamentos, setTratamentos] = useState<any[]>([]);
  const [proximaSessao, setProximaSessao] = useState<any | null>(null);
  const [stats, setStats] = useState({ ativos: 0, realizadas: 0, faltantes: 0 });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { avisos, naoLidos, marcarComoLido } = useAvisos();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      const { data: assistido } = await supabase.from("assistidos").select("id").eq("user_id", user!.id).maybeSingle();
      if (!assistido) { setLoading(false); return; }

      const { data: vinculos } = await supabase.from("assistido_tratamentos")
        .select("id, tratamento_id, quantidade_total, quantidade_realizada, quantidade_faltante, status")
        .eq("assistido_id", assistido.id).in("status", ["aguardando_inicio", "em_andamento"]);

      if (!vinculos || vinculos.length === 0) { setLoading(false); return; }

      const tratIds = [...new Set(vinculos.map((v) => v.tratamento_id))];
      const vinculoIds = vinculos.map((v) => v.id);
      const hoje = new Date().toISOString().split("T")[0];

      const [{ data: tipos }, { data: proxSessoes }] = await Promise.all([
        supabase.from("tipos_tratamento").select("id, nome").in("id", tratIds),
        supabase.from("agenda_tratamentos_assistido")
          .select("id, assistido_tratamento_id, tratamento_id, data_sessao, horario, status")
          .in("assistido_tratamento_id", vinculoIds)
          .eq("status", "agendado")
          .gte("data_sessao", hoje)
          .order("data_sessao", { ascending: true })
          .limit(1),
      ]);

      const tipoMap = Object.fromEntries((tipos || []).map((t) => [t.id, t]));

      const mapped = vinculos.map((v) => ({
        ...v,
        nome: tipoMap[v.tratamento_id]?.nome || "—",
      }));

      setTratamentos(mapped);
      setStats({
        ativos: vinculos.length,
        realizadas: vinculos.reduce((sum, v) => sum + v.quantidade_realizada, 0),
        faltantes: vinculos.reduce((sum, v) => sum + (v.quantidade_faltante || 0), 0),
      });

      if (proxSessoes && proxSessoes.length > 0) {
        const s = proxSessoes[0];
        setProximaSessao({
          ...s,
          tratamento_nome: tipoMap[s.tratamento_id]?.nome || "—",
        });
      }

      setLoading(false);
    };
    fetchData();
  }, [user]);

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;

  const proximaLabel = proximaSessao
    ? format(new Date(proximaSessao.data_sessao + "T12:00:00"), "dd/MM")
    : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Meu Painel</h1>
        <p className="text-sm text-muted-foreground mt-1">Seus tratamentos e agenda</p>
      </div>

      {/* Cards-resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard title="Tratamentos Ativos" value={stats.ativos} icon={Heart} />
        <StatCard title="Sessões Realizadas" value={stats.realizadas} icon={CheckCircle} />
        <StatCard title="Sessões Faltantes" value={stats.faltantes} icon={Clock} />
        <StatCard title="Próximo Atendimento" value={proximaLabel} icon={Calendar} />
      </div>

      {/* Próxima sessão — destaque principal */}
      {proximaSessao ? (
        <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.06] via-card to-card shadow-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/[0.04] rounded-full -translate-y-12 translate-x-12" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2 tracking-wide uppercase">
              <Calendar className="h-4 w-4" /> Próxima Sessão
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div className="space-y-1">
                <p className="text-lg font-display font-bold text-foreground">{proximaSessao.tratamento_nome}</p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(proximaSessao.data_sessao + "T12:00:00"), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
                {proximaSessao.horario && (
                  <p className="text-sm font-medium text-foreground/80">
                    <Clock className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-primary/60" />
                    {proximaSessao.horario.slice(0, 5)}
                  </p>
                )}
              </div>
              <Badge variant="outline" className="self-start sm:self-auto border-primary/30 text-primary bg-primary/[0.06] text-xs">
                Agendada
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 bg-gradient-to-br from-card to-secondary/20 shadow-sm">
          <CardContent className="py-8">
            <div className="flex flex-col items-center text-muted-foreground gap-2">
              <Calendar className="h-7 w-7 opacity-30" />
              <p className="text-sm font-medium">Nenhuma sessão agendada no momento</p>
              <p className="text-xs opacity-70">Quando houver agendamentos, eles aparecerão aqui</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meus Tratamentos */}
      {tratamentos.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Meus Tratamentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tratamentos.map((t) => {
              const pct = t.quantidade_total > 0 ? (t.quantidade_realizada / t.quantidade_total) * 100 : 0;
              return (
                <div key={t.id} className="rounded-xl border border-border/60 p-4 space-y-2.5 cursor-pointer hover:bg-secondary/30 transition-colors" onClick={() => navigate("/meus-tratamentos")}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{t.nome}</p>
                    <Badge variant="secondary" className="text-xs">{STATUS_LABELS[t.status] || t.status}</Badge>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t.quantidade_realizada}/{t.quantidade_total} sessões</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {tratamentos.length === 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <Heart className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Você ainda não possui tratamentos designados</p>
              <p className="text-xs mt-1">Após sua entrevista fraterna, seus tratamentos aparecerão aqui</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Avisos recentes */}
      {avisos.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" /> Avisos Recentes
              {naoLidos > 0 && <Badge className="text-xs">{naoLidos}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {avisos.slice(0, 3).map((a) => (
              <div
                key={a.id}
                onClick={async () => {
                  if (!a.lido) await marcarComoLido(a.id);
                  if (a.link) navigate(a.link);
                }}
                className={`rounded-xl border p-3 cursor-pointer hover:bg-secondary/30 transition-colors ${!a.lido ? "border-primary/30 bg-primary/5" : "border-border/60"}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{a.titulo}</p>
                  {!a.lido && <span className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.mensagem}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
