import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  registrarAvisoAusencia,
  type TipoCompromissoAviso,
} from "@/services/avisos/avisosAusenciaService";

interface Props {
  tipoCompromisso: TipoCompromissoAviso;
  compromissoId: string;
  /** Texto curto do compromisso, ex.: "Sessão de Reiki — 30/06/2025". */
  descricao: string;
  onRegistrado?: () => void;
}

const ERROS: Record<string, string> = {
  aviso_duplicado: "Já existe um aviso em aberto para este compromisso.",
  compromisso_inelegivel: "Este compromisso não permite aviso (precisa estar agendado e ser futuro).",
  compromisso_invalido: "Compromisso não encontrado.",
  motivo_muito_longo: "O motivo é muito longo (máx. 500 caracteres).",
};

export function AvisoAusenciaDialog({ tipoCompromisso, compromissoId, descricao, onRegistrado }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const { toast } = useToast();

  const handleConfirmar = async () => {
    setEnviando(true);
    try {
      await registrarAvisoAusencia({ tipoCompromisso, compromissoId, motivo });
      toast({
        title: "Aviso registrado",
        description: "A equipe foi avisada. Sua agenda não muda automaticamente.",
      });
      setOpen(false);
      setMotivo("");
      onRegistrado?.();
    } catch (e: any) {
      const code = e?.message ?? "";
      toast({
        title: "Não foi possível registrar",
        description: ERROS[code] ?? "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-xs"
        onClick={() => setOpen(true)}
      >
        <CalendarX className="h-3.5 w-3.5 mr-1" /> Não poderei comparecer
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Não poderei comparecer</DialogTitle>
            <DialogDescription>
              Você está avisando sobre: <strong>{descricao}</strong>. A equipe será
              notificada. Este aviso <strong>não cancela nem remarca</strong> seu
              compromisso — a equipe entrará em contato se necessário.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="motivo-ausencia" className="text-sm">
              Motivo (opcional)
            </Label>
            <Textarea
              id="motivo-ausencia"
              placeholder="Se quiser, conte brevemente o motivo (opcional)"
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground">
              O motivo é visível apenas à equipe responsável.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmar} disabled={enviando}>
              {enviando ? "Enviando..." : "Confirmar aviso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
