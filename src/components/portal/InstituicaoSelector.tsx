import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PortalInstituicaoView } from "@/hooks/usePortalHub";
import { CheckCircle2, MapPin } from "lucide-react";

interface Props {
  instituicoes: PortalInstituicaoView[];
  selectedId: string | null;
  onSelect: (id: string | null) => boolean;
}

const STATUS_LABEL: Record<PortalInstituicaoView["status"], string> = {
  ativa: "Ativa",
  implantacao: "Em implantação",
  inativa: "Inativa",
  suspensa: "Suspensa",
};

const STATUS_VARIANT: Record<
  PortalInstituicaoView["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  ativa: "default",
  implantacao: "secondary",
  inativa: "outline",
  suspensa: "destructive",
};

export function InstituicaoSelector({ instituicoes, selectedId, onSelect }: Props) {
  return (
    <ul className="space-y-2">
      {instituicoes.map((inst) => {
        const isSelected = inst.id === selectedId;
        const podeSelecionar = inst.vinculo_status === "ativo";
        return (
          <li
            key={inst.id}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between",
              isSelected && "border-primary bg-primary/5",
              !podeSelecionar && "opacity-70",
            )}
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="truncate font-medium">{inst.nome}</p>
                <Badge variant={STATUS_VARIANT[inst.status]} className="shrink-0">
                  {STATUS_LABEL[inst.status]}
                </Badge>
                {inst.vinculo_status !== "ativo" && (
                  <Badge variant="outline" className="shrink-0">
                    Vínculo {inst.vinculo_status}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {(inst.cidade || inst.uf) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[inst.cidade, inst.uf].filter(Boolean).join(" · ")}
                  </span>
                )}
                <span>Papel: {inst.papel_local.replace("_", " ")}</span>
                {inst.plano && <span>Plano: {inst.plano.nome}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isSelected ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-4 w-4" /> Selecionada
                </span>
              ) : (
                <Button
                  size="sm"
                  variant={podeSelecionar ? "default" : "outline"}
                  disabled={!podeSelecionar}
                  onClick={() => onSelect(inst.id)}
                >
                  {podeSelecionar ? "Selecionar" : "Indisponível"}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
