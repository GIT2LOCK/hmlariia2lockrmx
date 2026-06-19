import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { Permission, denyMessage } from "@/lib/permissions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAllowedTabs, type TabKey } from "@/hooks/useAllowedTabs";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requirePermission?: Permission;
  tabKey?: TabKey;
}

export function ProtectedRoute({ children, requirePermission, tabKey }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, syncFromDatabase, can } = useUser();
  const location = useLocation();
  const { allows, loading: tabsLoading } = useAllowedTabs();

  useEffect(() => {
    if (isAuthenticated) syncFromDatabase();
  }, [isAuthenticated, location.pathname]);

  if (isLoading || (isAuthenticated && tabKey && tabsLoading)) {
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

  if (tabKey && !allows(tabKey)) {
    toast.error("Você não tem acesso a essa área.");
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
