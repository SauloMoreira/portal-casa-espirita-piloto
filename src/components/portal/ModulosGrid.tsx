import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import type { PortalInstituicaoView } from "@/hooks/usePortalHub";
import { MODULO_ROTA } from "@/hooks/usePortalHub";

interface Props {
  instituicao: PortalInstituicaoView;
}

type EstadoModulo = "ativo" | "indisponivel_no_plano" | "em_breve" | "suspenso";

function estadoDoModulo(
  inst: PortalInstituicaoView,
  ativoNoPlano: boolean,
  temRota: boolean,
): EstadoModulo {
  const assinatura = inst.assinatura;
  const suspenso =
    inst.status === "suspensa" ||
    inst.status === "inativa" ||
    !assinatura ||
    assinatura.status === "suspensa" ||
    assinatura.status === "cancelada" ||
    assinatura.status === "inadimplente" ||
    inst.vinculo_status !== "ativo";
  if (suspenso) return "suspenso";
  if (!ativoNoPlano) return "indisponivel_no_plano";
  if (!temRota) return "em_breve";
  return "ativo";
}

const LABEL: Record<EstadoModulo, string> = {
  ativo: "Ativo",
  indisponivel_no_plano: "Não incluso no plano",
  em_breve: "Em breve",
  suspenso: "Suspenso",
};

export function ModulosGrid({ instituicao }: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {instituicao.modulos.map((m) => {
        const rota = MODULO_ROTA[m.codigo] ?? null;
        const estado = estadoDoModulo(instituicao, m.ativo_no_plano, Boolean(rota));
        const podeAbrir = estado === "ativo";
        return (
          <div
            key={m.id}
            className={cn(
              "flex flex-col justify-between gap-3 rounded-lg border p-4",
              podeAbrir ? "hover:border-primary/50 hover:shadow-sm" : "opacity-80",
            )}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium capitalize">{m.nome}</p>
                <Badge variant={podeAbrir ? "default" : "outline"}>{LABEL[estado]}</Badge>
              </div>
              {m.descricao && (
                <p className="text-xs text-muted-foreground">{m.descricao}</p>
              )}
            </div>
            <div className="flex items-center justify-end">
              {podeAbrir && rota ? (
                <Button asChild size="sm">
                  <Link to={rota}>
                    Acessar <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              ) : estado === "em_breve" ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" /> em preparação para SaaS
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" /> {LABEL[estado]}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
