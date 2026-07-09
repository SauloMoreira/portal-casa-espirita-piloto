import { Link, Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ShieldCheck, Boxes, ArrowRight, Loader2, AlertTriangle, CreditCard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { ROUTES } from "@/constants";
import { ROLE } from "@/constants/roles";
import { InstituicaoSelector } from "@/components/portal/InstituicaoSelector";
import { ModulosGrid } from "@/components/portal/ModulosGrid";
import { PlanoResumo } from "@/components/portal/PlanoResumo";
import { useTenantBranding } from "@/hooks/useTenantBranding";
import { SAAS_BRANDING } from "@/config/saasBranding";

export default function Portal() {
  const { profile, user, role, roles } = useAuth();
  const {
    isLoading,
    isError,
    isPlatformAdmin,
    instituicoes,
    selectedInstituicaoId,
    selecionada,
    selectInstituicao,
  } = useInstituicaoAtiva();

  const branding = useTenantBranding();
  void selectedInstituicaoId;

  const nomeExibicao = profile?.nome_completo || user?.email || "Bem-vindo";


  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // SAAS-06-A2 — Blindagem de experiência por perfil.
  // Assistido puro (sem papel administrativo E sem ser platform_admin) é
  // redirecionado ao seu dashboard: o Portal SaaS é uma superfície de gestão
  // multi-instituição, não pertence à jornada do assistido.
  const isAssistidoPuro =
    !isPlatformAdmin &&
    role === ROLE.ASSISTIDO &&
    roles.every((r) => r === ROLE.ASSISTIDO);
  if (isAssistidoPuro) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  // Defesa em profundidade: o card administrativo global só aparece para
  // platform_admin/platform_owner reais. Admin local de instituição NÃO se
  // qualifica (isPlatformAdmin já vem exclusivamente de platform_admins).
  const podeVerCardAdminPlataforma = isPlatformAdmin && role !== ROLE.ASSISTIDO;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          {branding.scope === "tenant" && branding.logoUrl && (
            <img
              src={branding.logoUrl}
              alt=""
              className="h-10 w-10 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {branding.scope === "tenant" ? SAAS_BRANDING.name : "Plataforma Casa Espírita"}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {branding.scope === "tenant" ? branding.nome : `Olá, ${nomeExibicao}`}
            </h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {branding.scope === "tenant"
            ? branding.slogan
            : "Selecione uma instituição para acessar os módulos disponíveis conforme o plano contratado."}
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

      {podeVerCardAdminPlataforma && (
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
