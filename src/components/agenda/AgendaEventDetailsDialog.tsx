import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar as CalendarIcon, BookOpen } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getAgendaStatusColor, getAgendaStatusLabel } from "@/constants/agenda";
import { formatEntrevistaTime } from "@/lib/agenda";
import type { EntrevistaAgendaItem } from "@/types/agenda";

interface Props {
  entrevista: EntrevistaAgendaItem | null;
  onClose: () => void;
  canRealizar: boolean;
  onRealizar: (entrevista: EntrevistaAgendaItem) => void;
}

export function AgendaEventDetailsDialog({ entrevista, onClose, canRealizar, onRealizar }: Props) {
  if (!entrevista) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            Detalhes da Entrevista
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Assistido</p>
              <p className="font-medium">{entrevista.assistido_nome}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Entrevistador</p>
              <p className="font-medium">{entrevista.entrevistador_nome}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Data</p>
              <p className="font-medium">{format(parseISO(entrevista.data), "dd/MM/yyyy", { locale: ptBR })}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Horário</p>
              <p className="font-medium">{formatEntrevistaTime(entrevista.data) || "Não definido"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Tipo</p>
              <p className="font-medium capitalize">{entrevista.tipo_entrevista}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Status</p>
              <Badge className={getAgendaStatusColor(entrevista.status)}>
                {getAgendaStatusLabel(entrevista.status)}
              </Badge>
            </div>
          </div>
          {/* BUG-03: o conteúdo da entrevista fraterna (observações/relato) é
              confidencial e não é exibido na agenda — a agenda é estritamente
              operacional (assistido, data, horário, tipo, status). */}
          {canRealizar && entrevista.status === "agendada" && (
            <Button className="w-full gap-2" onClick={() => onRealizar(entrevista)}>
              <BookOpen className="h-4 w-4" />
              Fazer Entrevista
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
