import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { usePortalHub } from "@/hooks/usePortalHub";
import { useSelectedInstituicao } from "@/hooks/useSelectedInstituicao";
import { InstituicaoSelector } from "@/components/portal/InstituicaoSelector";

export default function PortalInstituicoes() {
  const { isLoading, instituicoes } = usePortalHub();
  const allowedIds = useMemo(
    () => instituicoes.filter((i) => i.vinculo_status === "ativo").map((i) => i.id),
    [instituicoes],
  );
  const { selectedInstituicaoId, selectInstituicao } = useSelectedInstituicao(allowedIds);

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
        <h1 className="text-2xl font-semibold tracking-tight">Minhas instituições</h1>
        <p className="text-sm text-muted-foreground">
          Todas as instituições em que você possui vínculo. Selecione uma para operar.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vínculos</CardTitle>
        </CardHeader>
        <CardContent>
          {instituicoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não está vinculado a nenhuma instituição.
            </p>
          ) : (
            <InstituicaoSelector
              instituicoes={instituicoes}
              selectedId={selectedInstituicaoId}
              onSelect={selectInstituicao}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
