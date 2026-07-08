import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { usePortalHub } from "@/hooks/usePortalHub";
import { ROUTES } from "@/constants";

/**
 * SAAS-06-A2 — Guarda de rota para visão administrativa GLOBAL da plataforma.
 *
 * Só libera acesso quando o usuário é `platform_admin`/`platform_owner`
 * (checagem via `platform_admins`, aplicada tanto por RLS no backend quanto
 * por este wrapper como defesa em profundidade).
 *
 * IMPORTANTE:
 *  - Admin local da instituição NÃO é platform_admin.
 *  - Assistidos e usuários operacionais são redirecionados ao Portal.
 *  - RLS no backend continua sendo a fonte de verdade — este guard é UX/UI.
 */
export function PlatformAdminRoute({ children }: { children: React.ReactNode }) {
  const { isPlatformAdmin, isLoading } = usePortalHub();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return <Navigate to={ROUTES.portal} replace />;
  }

  return <>{children}</>;
}
