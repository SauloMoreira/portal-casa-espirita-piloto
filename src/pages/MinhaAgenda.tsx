import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Heart, BookOpen } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const DIAS_SEMANA = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

const STATUS_SESSAO_LABELS: Record<string, string> = {
  agendado: "Agendada",
  realizado: "Realizada",
  ausente: "Ausente",
};

export default function MinhaAgenda() {
  const [sessoesFuturas, setSessoesFuturas] = useState<any[]>([]);
  const [sessoesPassadas, setSessoesPassadas] = useState<any[]>([]);
  const [entrevistas, setEntrevistas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistorico, setShowHistorico] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      const { data: assistido } = await supabase.from("assistidos").select("id").eq("user_id", user!.id).maybeSingle();
      if (!assistido) { setLoading(false); return; }

      const hoje = new Date().toISOString().split("T")[0];

      const [{ data: futuras }, { data: passadas }, { data: ent }] = await Promise.all([
        supabase.from("agenda_tratamentos_assistido")
          .select("id, tratamento_id, data_sessao, horario, status")
          .eq("assistido_id", assistido.id)
          .eq("status", "agendado")
          .gte("data_sessao", hoje)
          .order("data_sessao", { ascending: true })
          .limit(30),
        supabase.from("agenda_tratamentos_assistido")
          .select("id, tratamento_id, data_sessao, horario, status")
          .eq("assistido_id", assistido.id)
          .in("status", ["realizado", "ausente", "cancelado", "remarcado"])
          .order("data_sessao", { ascending: false })
          .limit(30),
        supabase.from("entrevistas_fraternas")
          .select("id, data, tipo_entrevista, status")
          .eq("assistido_id", assistido.id)
          .eq("status", "agendada")
          .order("data"),
      ]);

      const allSessoes = [...(futuras || []), ...(passadas || [])];
      if (allSessoes.length > 0) {
        const tratIds = [...new Set(allSessoes.map((s) => s.tratamento_id))];
        const { data: tipos } = await supabase.from("tipos_tratamento").select("id, nome").in("id", tratIds);
        const tipoMap = Object.fromEntries((tipos || []).map((t) => [t.id, t]));
        const addNome = (s: any) => ({ ...s, tratamento_nome: tipoMap[s.tratamento_id]?.nome || "—" });
        setSessoesFuturas((futuras || []).map(addNome));
        setSessoesPassadas((passadas || []).map(addNome));
      }

      setEntrevistas(ent || []);
      setLoading(false);
    };
    fetchData();
  }, [user]);
  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Minha Agenda</h1>
        <p className="text-sm text-muted-foreground mt-1">Seus próximos atendimentos confirmados</p>
      </div>

      {entrevistas.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" /> Entrevistas Agendadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entrevistas.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Entrevista Fraterna</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(e.data).toLocaleString("pt-BR", { dateStyle: "long", timeStyle: "short" })}
                  </p>
                </div>
                <Badge variant="secondary">{e.tipo_entrevista === "livre" ? "Livre" : "Regular"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Próximas Sessões
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sessoes.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground">
              <Heart className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma sessão agendada</p>
              <p className="text-xs mt-1">Quando suas sessões forem confirmadas, elas aparecerão aqui</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessoes.map((s) => {
                const dataObj = new Date(s.data_sessao + "T12:00:00");
                return (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{s.tratamento_nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(dataObj, "dd/MM/yyyy")} — {DIAS_SEMANA[dataObj.getDay()]}
                        {s.horario && ` às ${s.horario.slice(0, 5)}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_SESSAO_LABELS[s.status] || s.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
