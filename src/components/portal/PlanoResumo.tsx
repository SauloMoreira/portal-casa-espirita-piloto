import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CreditCard } from "lucide-react";
import type { PortalInstituicaoView, SaasAssinaturaStatus } from "@/hooks/usePortalHub";

interface Props {
  instituicao: PortalInstituicaoView | null;
}

const STATUS_LABEL: Record<SaasAssinaturaStatus, string> = {
  trial: "Em avaliação",
  ativa: "Ativa",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
  inadimplente: "Inadimplente",
};

const STATUS_VARIANT: Record<
  SaasAssinaturaStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  trial: "secondary",
  ativa: "default",
  suspensa: "destructive",
  cancelada: "destructive",
  inadimplente: "destructive",
};

function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

export function PlanoResumo({ instituicao }: Props) {
  if (!instituicao) {
    return (
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-5 w-5 text-primary" /> Plano e assinatura
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Selecione uma instituição para visualizar seu plano.
          </p>
        </CardContent>
      </Card>
    );
  }

  const modulosAtivos = instituicao.modulos.filter((m) => m.ativo_no_plano);

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-5 w-5 text-primary" /> Plano e assinatura
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Plano</p>
          <p className="font-medium">{instituicao.plano?.nome ?? "Sem plano vinculado"}</p>
          {instituicao.plano?.descricao && (
            <p className="text-xs text-muted-foreground">{instituicao.plano.descricao}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
            {instituicao.assinatura ? (
              <Badge variant={STATUS_VARIANT[instituicao.assinatura.status]}>
                {STATUS_LABEL[instituicao.assinatura.status]}
              </Badge>
            ) : (
              <Badge variant="outline">Sem assinatura</Badge>
            )}
          </div>
          {instituicao.assinatura?.trial_ate && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Trial até</p>
              <p className="inline-flex items-center gap-1 font-medium">
                <CalendarClock className="h-4 w-4" />
                {formatDate(instituicao.assinatura.trial_ate)}
              </p>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Módulos inclusos
          </p>
          {modulosAtivos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum módulo incluso.</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1">
              {modulosAtivos.map((m) => (
                <li key={m.id}>
                  <Badge variant="secondary" className="capitalize">
                    {m.nome}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {instituicao.assinatura && (
          <div className="grid grid-cols-2 gap-3 border-t pt-3 text-xs text-muted-foreground">
            <div>
              <p>Início</p>
              <p className="font-medium text-foreground">
                {formatDate(instituicao.assinatura.data_inicio)}
              </p>
            </div>
            <div>
              <p>Fim</p>
              <p className="font-medium text-foreground">
                {formatDate(instituicao.assinatura.data_fim)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
