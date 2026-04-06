import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAvisos } from "@/hooks/useAvisos";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Calendar, CheckCircle, Clock, Bell } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const STATUS_LABELS: Record<string, string> = {
  aguardando_inicio: "Aguardando", em_andamento: "Em Andamento", concluido: "Concluído",
};

export default function AssistidoDashboard() {
  const [tratamentos, setTratamentos] = useState<any[]>([]);
  const [stats, setStats] = useState({ ativos: 0, realizadas: 0, faltantes: 0 });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { avisos, naoLidos, marcarComoLido } = useAvisos();
  const navigate = useNavigate();

  useEffect(() => {
    const fetch = async () => {
      const { data: assistido } = await supabase.from("assistidos").select("id").eq("user_id", user!.id).maybeSingle();
      if (!assistido) { setLoading(false); return; }

      const { data: vinculos } = await supabase.from("assistido_tratamentos")
        .select("id, tratamento_id, quantidade_total, quantidade_realizada, quantidade_faltante, status")
        .eq("assistido_id", assistido.id).in("status", ["aguardando_inicio", "em_andamento"]);

      if (!vinculos || vinculos.length === 0) { setLoading(false); return; }

      const tratIds = [...new Set(vinculos.map((v) => v.tratamento_id))];
      const { data: tipos } = await supabase.from("tipos_tratamento").select("id, nome, tipo, dia_semana, horario").in("id", tratIds);
      const tipoMap = Object.fromEntries((tipos || []).map((t) => [t.id, t]));

      const mapped = vinculos.map((v) => ({
        ...v,
        nome: tipoMap[v.tratamento_id]?.nome || "—",
        dia_semana: tipoMap[v.tratamento_id]?.dia_semana,
        horario: tipoMap[v.tratamento_id]?.horario,
      }));

      setTratamentos(mapped);
      setStats({
        ativos: vinculos.length,
        realizadas: vinculos.reduce((sum, v) => sum + v.quantidade_realizada, 0),
        faltantes: vinculos.reduce((sum, v) => sum + (v.quantidade_faltante || 0), 0),
      });
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Meu Painel</h1>
        <p className="text-sm text-muted-foreground mt-1">Seus tratamentos e agenda</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Tratamentos Ativos" value={stats.ativos} icon={Heart} />
        <StatCard title="Sessões Realizadas" value={stats.realizadas} icon={CheckCircle} />
        <StatCard title="Sessões Faltantes" value={stats.faltantes} icon={Clock} />
        <StatCard title="Próximo Atendimento" value="—" icon={Calendar} />
      </div>

      {tratamentos.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Meus Tratamentos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tratamentos.map((t) => {
              const pct = t.quantidade_total > 0 ? (t.quantidade_realizada / t.quantidade_total) * 100 : 0;
              return (
                <div key={t.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{t.nome}</p>
                    <Badge variant="secondary" className="text-xs">{STATUS_LABELS[t.status] || t.status}</Badge>
                  </div>
                  <Progress value={pct} className="h-1.5" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{t.quantidade_realizada}/{t.quantidade_total} sessões</span>
                    {t.dia_semana !== null && <span>{DIAS_SEMANA[t.dia_semana]} {t.horario || ""}</span>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {tratamentos.length === 0 && (
        <Card className="glass-card">
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
        <Card className="glass-card">
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
                className={`rounded-lg border p-3 cursor-pointer hover:bg-muted/30 transition-colors ${!a.lido ? "border-primary/30 bg-primary/5" : ""}`}
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
