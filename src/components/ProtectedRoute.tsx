import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { Permission, denyMessage } from "@/lib/permissions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requirePermission?: Permission;
}

export function ProtectedRoute({ children, requirePermission }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, syncFromDatabase, can } = useUser();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) syncFromDatabase();
  }, [isAuthenticated, location.pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando autenticação...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (requirePermission && !can(requirePermission)) {
    toast.error(denyMessage(requirePermission));
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
