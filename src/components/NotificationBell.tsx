import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAvisos } from "@/hooks/useAvisos";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
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
  alteracao_sessao: "Alteração",
  proxima_sessao: "Próxima Sessão",
  orientacao: "Orientação",
  pendencia: "Pendência",
  geral: "Geral",
};

export function NotificationBell() {
  const { avisos, naoLidos, marcarComoLido } = useAvisos();
  const navigate = useNavigate();
  const recentes = avisos.slice(0, 5);

  const handleClick = async (aviso: typeof avisos[0]) => {
    if (!aviso.lido) await marcarComoLido(aviso.id);
    if (aviso.link) navigate(aviso.link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {naoLidos > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {naoLidos > 9 ? "9+" : naoLidos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="text-sm font-semibold">Notificações</h4>
          {naoLidos > 0 && (
            <Badge variant="secondary" className="text-xs">{naoLidos} nova{naoLidos > 1 ? "s" : ""}</Badge>
          )}
        </div>
        <ScrollArea className="max-h-72">
          {recentes.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação</p>
          ) : (
            <div className="divide-y">
              {recentes.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handleClick(a)}
                  className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${!a.lido ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${TIPO_COLORS[a.tipo] || TIPO_COLORS.geral}`}>
                      {TIPO_LABELS[a.tipo] || a.tipo}
                    </span>
                    {!a.lido && <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  <p className="text-sm font-medium mt-1">{a.titulo}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.mensagem}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2">
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate("/notificacoes")}>
            Ver todas as notificações
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
