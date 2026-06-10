import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Eye, User } from "lucide-react";
import { getAgendaStatusColor, getAgendaStatusLabel } from "@/constants/agenda";
import { formatEntrevistaTime } from "@/lib/agenda";
import type { EntrevistaAgendaItem } from "@/types/agenda";

interface Props {
  entrevista: EntrevistaAgendaItem;
  onClick: () => void;
  expanded?: boolean;
}

export function AgendaEntrevistaCard({ entrevista, onClick, expanded }: Props) {
  const time = formatEntrevistaTime(entrevista.data);

  return (
    <div
      className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {time && (
            <span className="text-xs font-semibold text-primary flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {time}
            </span>
          )}
          <Badge className={`text-[10px] ${getAgendaStatusColor(entrevista.status)}`}>
            {getAgendaStatusLabel(entrevista.status)}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {entrevista.tipo_entrevista === "livre" ? "Livre" : "Regular"}
          </Badge>
        </div>
        <p className="text-sm font-medium truncate">{entrevista.assistido_nome}</p>
        {expanded && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <User className="h-3 w-3" />
            {entrevista.entrevistador_nome}
          </p>
        )}
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
        <Eye className="h-4 w-4" />
      </Button>
    </div>
  );
}
