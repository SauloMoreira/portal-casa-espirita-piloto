import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { usePortalHub } from "@/hooks/usePortalHub";
import { useSelectedInstituicao } from "@/hooks/useSelectedInstituicao";
import { ModulosGrid } from "@/components/portal/ModulosGrid";
import { PlanoResumo } from "@/components/portal/PlanoResumo";

export default function PortalModulos() {
  const { isLoading, instituicoes } = usePortalHub();
  const allowedIds = useMemo(
    () => instituicoes.filter((i) => i.vinculo_status === "ativo").map((i) => i.id),
    [instituicoes],
  );
  const { selectedInstituicaoId } = useSelectedInstituicao(allowedIds);
  const selecionada =
    instituicoes.find((i) => i.id === selectedInstituicaoId) ?? null;

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Módulos</h1>
        <p className="text-sm text-muted-foreground">
          Visão detalhada dos módulos disponíveis conforme o plano da instituição selecionada.
        </p>
      </header>

      {!selecionada ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Selecione uma instituição no Portal para visualizar seus módulos.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Módulos da instituição {selecionada.nome}</CardTitle>
            </CardHeader>
            <CardContent>
              <ModulosGrid instituicao={selecionada} />
            </CardContent>
          </Card>
          <PlanoResumo instituicao={selecionada} />
        </div>
      )}
    </div>
  );
}
