import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AssistidoMobileNav } from "@/components/AssistidoMobileNav";
import { Outlet, Link } from "react-router-dom";
import { NotificationBell } from "@/components/NotificationBell";
import { HelpButton } from "@/components/help/HelpButton";
import { OnboardingTour } from "@/components/help/OnboardingTour";
import { FaleConoscoButton } from "@/components/FaleConoscoButton";
import { Button } from "@/components/ui/button";
import { LifeBuoy } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { InstituicaoProvider, useInstituicaoAtiva } from "@/contexts/InstituicaoContext";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import { SAAS_BRANDING } from "@/config/saasBranding";
import { useTenantBranding } from "@/hooks/useTenantBranding";

/**
 * SAAS-06-C1-FIX11 — Título do header respeita o contexto ativo.
 *
 * - Com tenant selecionado: "{nome_fantasia} — Sistema de Gestão".
 * - Sem tenant + platform_admin: branding global do Portal (Administração da Plataforma).
 * - Sem tenant + usuário comum: branding neutro do SaaS.
 * Nunca herda tenant anterior via cache/localStorage — fonte é o contexto,
 * cujo id é validado por `useSelectedInstituicao` contra `allowedIds`.
 */
function HeaderTitle() {
  const { selecionada, isPlatformAdmin } = useInstituicaoAtiva();
  const branding = useTenantBranding();

  if (selecionada) {
    return (
      <>
        <span className="truncate">{branding.nome}</span>
        <span className="text-muted-foreground"> — Sistema de Gestão</span>
      </>
    );
  }

  if (isPlatformAdmin) {
    return (
      <>
        <span className="truncate">{SAAS_BRANDING.name}</span>
        <span className="text-muted-foreground"> — Administração da Plataforma</span>
      </>
    );
  }

  return (
    <>
      <span className="truncate">{SAAS_BRANDING.name}</span>
      <span className="text-muted-foreground"> — {SAAS_BRANDING.tagline}</span>
    </>
  );
}

function AppLayoutInner() {
  const { toast } = useToast();
  const { role } = useAuth();
  const isAssistido = role === "assistido";

  // Push notification toasts
  useEffect(() => {
    const handler = (e: Event) => {
      const aviso = (e as CustomEvent).detail;
      if (aviso?.titulo) {
        toast({
          title: aviso.titulo,
          description: aviso.mensagem?.substring(0, 100),
        });
      }
    };
    window.addEventListener("aviso-novo", handler);
    return () => window.removeEventListener("aviso-novo", handler);
  }, [toast]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card px-4 shrink-0 gap-2">
            <SidebarTrigger className="mr-2" />
            <h1 className="text-sm font-medium text-foreground truncate flex-1 min-w-0">
              <HeaderTitle />
            </h1>
            <div className="flex items-center gap-1">
              {!isAssistido && <TenantSwitcher />}
              <HelpButton variant="ghost" size="icon" />
              <Button asChild variant="ghost" size="icon" aria-label="Central de Ajuda">
                <Link to={ROUTES.ajuda}>
                  <LifeBuoy className="h-4 w-4" />
                </Link>
              </Button>
              <NotificationBell />
            </div>
          </header>
          <main className={`flex-1 overflow-auto p-4 md:p-6 ${isAssistido ? "pb-24 md:pb-6" : ""}`}>
            <Outlet />
          </main>
        </div>
        {isAssistido && <AssistidoMobileNav />}
        <FaleConoscoButton />
        <OnboardingTour />
      </div>
    </SidebarProvider>
  );
}

export function AppLayout() {
  return (
    <InstituicaoProvider>
      <AppLayoutInner />
    </InstituicaoProvider>
  );
}
