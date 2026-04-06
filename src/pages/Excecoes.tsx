import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, CalendarX, UserX, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ExcecaoCard {
  titulo: string;
  valor: number;
  icon: React.ElementType;
  cor: string;
  link?: string;
}

export default function Excecoes() {
  const [cards, setCards] = useState<ExcecaoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const { role } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const result: ExcecaoCard[] = [];

      // 1. Tratamentos aguardando agendamento
      const { data: aguardando } = await supabase
        .from("assistido_tratamentos")
        .select("id")
        .eq("status", "aguardando_agendamento");
      result.push({
        titulo: "Aguardando Agendamento",
        valor: aguardando?.length || 0,
        icon: Clock,
        cor: "text-amber-500",
        link: "/lista-espera",
      });

      // 2. Sessões passadas sem presença
      const today = new Date().toISOString().split("T")[0];
      const { data: sessoesPast } = await supabase
        .from("agenda_tratamentos_assistido")
        .select("id")
        .lt("data_sessao", today)
        .eq("status", "agendado");
      result.push({
        titulo: "Sessões Sem Presença",
        valor: sessoesPast?.length || 0,
        icon: CalendarX,
        cor: "text-red-500",
      });

      // 3. Entrevistas sem tratamento definido
      const { data: entrevistas } = await supabase
        .from("entrevistas_fraternas")
        .select("id, assistido_id")
        .eq("status", "realizada");
      if (entrevistas) {
        let semTratamento = 0;
        for (const e of entrevistas) {
          const { data: trat } = await supabase
            .from("assistido_tratamentos")
            .select("id")
            .eq("assistido_id", e.assistido_id)
            .limit(1);
          if (!trat || trat.length === 0) semTratamento++;
        }
        result.push({
          titulo: "Entrevistas Sem Tratamento",
          valor: semTratamento,
          icon: AlertTriangle,
          cor: "text-orange-500",
        });
      }

      // 4. Assistidos com muitas faltas (3+)
      const { data: presencas } = await supabase
        .from("presencas_tratamentos")
        .select("assistido_tratamento_id")
        .eq("status_presenca", "ausente");
      if (presencas) {
        const faltaCount: Record<string, number> = {};
        presencas.forEach((p: any) => {
          faltaCount[p.assistido_tratamento_id] = (faltaCount[p.assistido_tratamento_id] || 0) + 1;
        });
        const comMuitasFaltas = Object.values(faltaCount).filter((c) => c >= 3).length;
        result.push({
          titulo: "Assistidos com Faltas Recorrentes",
          valor: comMuitasFaltas,
          icon: UserX,
          cor: "text-red-400",
        });
      }

      // 5. Tratamentos em andamento
      const { data: emAndamento } = await supabase
        .from("assistido_tratamentos")
        .select("id")
        .eq("status", "em_andamento");
      result.push({
        titulo: "Tratamentos em Andamento",
        valor: emAndamento?.length || 0,
        icon: Activity,
        cor: "text-blue-500",
      });

      setCards(result);
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Exceções e Pendências</h1>
        <p className="text-sm text-muted-foreground mt-1">Itens que exigem atenção operacional</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-sm text-muted-foreground">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <Card
              key={card.titulo}
              className={`glass-card cursor-pointer hover:shadow-md transition-shadow ${card.link ? "" : ""}`}
              onClick={() => card.link && navigate(card.link)}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.titulo}</p>
                    <p className="text-3xl font-bold mt-1">{card.valor}</p>
                  </div>
                  <card.icon className={`h-8 w-8 ${card.cor} opacity-80`} />
                </div>
                {card.valor > 0 && (
                  <Badge variant="destructive" className="mt-3 text-xs">
                    Requer atenção
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
