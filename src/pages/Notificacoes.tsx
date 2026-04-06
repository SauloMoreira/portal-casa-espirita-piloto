import { useAvisos, Aviso } from "@/hooks/useAvisos";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TIPO_COLORS: Record<string, string> = {
  agendamento: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  alteracao_sessao: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  proxima_sessao: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  orientacao: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  pendencia: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  geral: "bg-muted text-muted-foreground",
};

const TIPO_LABELS: Record<string, string> = {
  agendamento: "Agendamento",
  alteracao_sessao: "Alteração de Sessão",
  proxima_sessao: "Próxima Sessão",
  orientacao: "Orientação",
  pendencia: "Pendência",
  geral: "Geral",
};

export default function Notificacoes() {
  const { avisos, naoLidos, loading, marcarComoLido, marcarTodosComoLidos } = useAvisos();
  const navigate = useNavigate();

  const handleClick = async (aviso: Aviso) => {
    if (!aviso.lido) await marcarComoLido(aviso.id);
    if (aviso.link) navigate(aviso.link);
  };

  if (loading) return <div className="flex items-center justify-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Notificações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {naoLidos > 0 ? `${naoLidos} aviso${naoLidos > 1 ? "s" : ""} não lido${naoLidos > 1 ? "s" : ""}` : "Todos os avisos lidos"}
          </p>
        </div>
        {naoLidos > 0 && (
          <Button variant="outline" size="sm" onClick={marcarTodosComoLidos}>
            <CheckCheck className="h-4 w-4 mr-1" /> Marcar todos como lidos
          </Button>
        )}
      </div>

      {avisos.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {avisos.map((a) => (
            <Card
              key={a.id}
              className={`glass-card cursor-pointer transition-colors hover:bg-muted/30 ${!a.lido ? "border-primary/30 bg-primary/5" : ""}`}
              onClick={() => handleClick(a)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {!a.lido && <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-primary shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${TIPO_COLORS[a.tipo] || TIPO_COLORS.geral}`}>
                        {TIPO_LABELS[a.tipo] || a.tipo}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(a.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-1">{a.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{a.mensagem}</p>
                    {a.link && (
                      <span className="inline-flex items-center gap-1 text-xs text-primary mt-1">
                        <ExternalLink className="h-3 w-3" /> Ir para a tela
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
