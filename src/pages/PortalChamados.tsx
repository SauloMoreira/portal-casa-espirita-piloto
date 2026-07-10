/**
 * SAAS-06-C1-FIX10 — Rota Portal Admin → Chamados (visão global).
 */
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { usePortalHub } from "@/hooks/usePortalHub";
import { ROUTES } from "@/constants";
import ChamadosPage from "./Chamados";

export default function PortalChamados() {
  const { isPlatformAdmin, isLoading } = usePortalHub();
  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isPlatformAdmin) return <Navigate to={ROUTES.portal} replace />;
  return <ChamadosPage scope="global" />;
}
