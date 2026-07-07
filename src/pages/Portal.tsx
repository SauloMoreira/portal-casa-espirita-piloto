import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ShieldCheck, Boxes, ArrowRight, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePortalHub } from "@/hooks/usePortalHub";
import { useSelectedInstituicao } from "@/hooks/useSelectedInstituicao";
import { ROUTES } from "@/constants";
import { InstituicaoSelector } from "@/components/portal/InstituicaoSelector";
import { ModulosGrid } from "@/components/portal/ModulosGrid";
import { PlanoResumo } from "@/components/portal/PlanoResumo";

export default function Portal() {
  const { profile, user } = useAuth();
  const { isLoading, isError, isPlatformAdmin, instituicoes } = usePortalHub();

  const allowedIds = useMemo(
    () => instituicoes.filter((i) => i.vinculo_status === "ativo").map((i) => i.id),
    [instituicoes],
  );
  const { selectedInstituicaoId, selectInstituicao } = useSelectedInstituicao(allowedIds);
  const selecionada =
    instituicoes.find((i) => i.id === selectedInstituicaoId) ?? null;

  const nomeExibicao = profile?.nome_completo || user?.email || "Bem-vindo";

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Plataforma Casa Espírita</p>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {nomeExibicao}</h1>
        <p className="text-sm text-muted-foreground">
          Selecione uma instituição para acessar os módulos disponíveis conforme o plano contratado.
        </p>
      </header>

      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            Não foi possível carregar seus dados do Portal. Tente novamente em instantes.
          </CardContent>
        </Card>
      )}

      {isPlatformAdmin && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Você é administrador da plataforma</p>
                <p className="text-xs text-muted-foreground">
                  Acesso à visão global de instituições, planos e assinaturas.
                </p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to={ROUTES.portalAdmin}>
                Abrir visão administrativa <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Minhas instituições</CardTitle>
              </div>
              <Badge variant="secondary">{instituicoes.length}</Badge>
            </CardHeader>
            <CardContent>
              {instituicoes.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Você ainda não está vinculado a nenhuma instituição.
                  <br />
                  Peça ao administrador da sua casa espírita para criar o seu vínculo.
                </div>
              ) : (
                <InstituicaoSelector
                  instituicoes={instituicoes}
                  selectedId={selectedInstituicaoId}
                  onSelect={selectInstituicao}
                />
              )}
              {instituicoes.length > 0 && (
                <div className="mt-4 flex justify-end">
                  <Button asChild variant="ghost" size="sm">
                    <Link to={ROUTES.portalInstituicoes}>Ver todas</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Módulos disponíveis</CardTitle>
              </div>
              {selecionada && (
                <Button asChild variant="ghost" size="sm">
                  <Link to={ROUTES.portalModulos}>Ver detalhes</Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {selecionada ? (
                <ModulosGrid instituicao={selecionada} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Selecione uma instituição para visualizar os módulos.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <PlanoResumo instituicao={selecionada} />
      </section>
    </div>
  );
}
