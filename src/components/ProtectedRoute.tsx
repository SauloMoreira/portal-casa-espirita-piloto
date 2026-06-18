import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { useEffect } from "react";

interface Props {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export const ProtectedRoute = ({ children, allowedRoles }: Props) => {
  const { session, role, roles, profile, loading, rolesResolved, signOut, mfaPending } = useAuth();
  const location = useLocation();

  // Accounts that are not active lose access immediately:
  // - "inativo": deactivated by an admin
  // - "pendente": self-registration awaiting administrative approval
  const blockedStatus = profile?.status === "inativo" || profile?.status === "pendente";
  useEffect(() => {
    if (session && blockedStatus) {
      signOut();
    }
  }, [session, blockedStatus, signOut]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // No session: send to login.
  if (!session) return <Navigate to="/login" replace />;

  // Blocked account (inactive or pending approval): deny access.
  if (blockedStatus) return <Navigate to="/login" replace />;

  // Force temporary-password users to change it before anything else.
  if (profile?.senha_temporaria && location.pathname !== "/reset-password") {
    return <Navigate to="/reset-password" replace />;
  }

  // Second factor pending: the account has a verified MFA factor but the session
  // is still aal1. Force the TOTP step before any protected content renders.
  if (mfaPending && location.pathname !== "/mfa-verify") {
    return <Navigate to="/mfa-verify" replace />;
  }

  // Fail-closed: with a live session, never render protected content until the
  // role/profile resolution has actually SUCCEEDED. A read failure leaves
  // rolesResolved=false, so we wait (showing a loader) instead of falling
  // through to a permissive default.
  if (!rolesResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }


  // Fail-closed: a route that requires roles must NEVER render until a
  // valid role has been resolved AND the user holds one of the allowed roles.
  //
  // Guarding on the FULL roles array (not a single collapsed role) is essential:
  // a person can accumulate an institutional role (e.g. tarefeiro/médium/admin)
  // AND the "assistido" condition at the same time, and must keep access to BOTH
  // experiences. We also treat "administrador_master" as "admin" for guards.
  if (allowedRoles && allowedRoles.length > 0) {
    const effectiveRoles = new Set<AppRole>(roles);
    if (role) effectiveRoles.add(role);
    if (effectiveRoles.has("administrador_master")) effectiveRoles.add("admin");

    if (effectiveRoles.size === 0) {
      return <Navigate to="/login" replace />;
    }
    if (!allowedRoles.some((r) => effectiveRoles.has(r))) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};
