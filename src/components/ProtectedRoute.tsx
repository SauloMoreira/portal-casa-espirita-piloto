import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";

interface Props {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export const ProtectedRoute = ({ children, allowedRoles }: Props) => {
  const { session, role, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  // No session: send to login.
  if (!session) return <Navigate to="/login" replace />;

  // Force temporary-password users to change it before anything else.
  if (profile?.senha_temporaria && location.pathname !== "/reset-password") {
    return <Navigate to="/reset-password" replace />;
  }

  // Fail-closed: a route that requires roles must NEVER render until a
  // valid role has been resolved AND it is one of the allowed roles.
  if (allowedRoles && allowedRoles.length > 0) {
    if (!role) {
      // Role not yet resolved or could not be determined -> deny.
      return <Navigate to="/login" replace />;
    }
    if (!allowedRoles.includes(role)) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};
