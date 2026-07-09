import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/constants/routes";
import { ACESSO_LABELS } from "@/lib/voluntarioAcesso";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  nome: string;
}

export function PosCadastroAcessoDialog({ open, onOpenChange, nome }: Props) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Voluntário cadastrado com sucesso
          </DialogTitle>
          <DialogDescription className="pt-2">
            {nome ? <span className="font-medium text-foreground">{nome}</span> : "O voluntário"} foi
            registrado. {ACESSO_LABELS.orientacao}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          Acesso operacional é concedido separadamente, com auditoria, em Acesso e Segurança →
          Permissões de Acesso. Este passo é opcional agora.
        </div>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fazer depois
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate(ROUTES.governancaAcessos);
            }}
            className="gap-2"
          >
            Ir para Gestão de Acesso
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
