import { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AssistidoMobileNav } from "@/components/AssistidoMobileNav";
import { Outlet, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { HelpButton } from "@/components/help/HelpButton";
import { OnboardingTour } from "@/components/help/OnboardingTour";
import { Button } from "@/components/ui/button";
import { LifeBuoy } from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export function AppLayout() {
  const [nomeFantasia, setNomeFantasia] = useState<string | null>(null);
  const { toast } = useToast();
  const { role } = useAuth();
  const isAssistido = role === "assistido";

  const fetchInst = () => {
    supabase.from("instituicao_config").select("nome_fantasia").limit(1).then(({ data }) => {
      if (data && data.length > 0) setNomeFantasia((data[0] as any).nome_fantasia);
    });
  };

  useEffect(() => {
    fetchInst();
    window.addEventListener("instituicao-updated", fetchInst);
    return () => window.removeEventListener("instituicao-updated", fetchInst);
  }, []);

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
          <header className="h-14 flex items-center border-b bg-card px-4 shrink-0">
            <SidebarTrigger className="mr-4" />
            <h1 className="text-sm font-medium text-foreground truncate flex-1">
              {nomeFantasia || "Casa Espírita"} — Sistema de Gestão
            </h1>
            <NotificationBell />
          </header>
          <main className={`flex-1 overflow-auto p-4 md:p-6 ${isAssistido ? "pb-24 md:pb-6" : ""}`}>
            <Outlet />
          </main>
        </div>
        {isAssistido && <AssistidoMobileNav />}
      </div>
    </SidebarProvider>
  );
}
