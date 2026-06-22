import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUser, ModuleAction } from "@/contexts/UserContext";
import { Permission, denyMessage, Role } from "@/lib/permissions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAllowedTabs, type TabKey } from "@/hooks/useAllowedTabs";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requirePermission?: Permission;
  requireModule?: { key: string; action?: ModuleAction };
  tabKey?: TabKey;
  /** Rota acessível por usuário GRAFANA_ONLY (ex: kiosk, perfil). */
  allowGrafanaOnly?: boolean;
  /** Perfis explicitamente proibidos (ex: ['CLIENTE'] para área admin). */
  forbidRoles?: Role[];
}

export function ProtectedRoute({
  children,
  requirePermission,
  requireModule,
  tabKey,
  allowGrafanaOnly,
  forbidRoles,
}: ProtectedRouteProps) {
  const {
    isAuthenticated, isLoading, syncFromDatabase, can, canModule,
    isBlocked, isGrafanaOnly, user,
  } = useUser();
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

  // Usuário bloqueado: sem acesso a nada.
  if (isBlocked) {
    toast.error("Seu acesso foi bloqueado. Procure um administrador.");
    return <Navigate to="/" replace />;
  }

  // Usuário só de Grafana: tudo redireciona para kiosk, salvo rotas explicitamente permitidas.
  if (isGrafanaOnly && !allowGrafanaOnly) {
    return <Navigate to="/dashboard/grafana-kiosk" replace />;
  }

  // CLIENTE não pode entrar em áreas internas
  if (forbidRoles && forbidRoles.includes(user.role as Role)) {
    toast.error("Acesso não autorizado para o seu perfil.");
    return <Navigate to="/dashboard/chamados" replace />;
  }

  if (requirePermission && !can(requirePermission)) {
    toast.error(denyMessage(requirePermission));
    return <Navigate to="/dashboard" replace />;
  }

  if (requireModule && !canModule(requireModule.key, requireModule.action || "view")) {
    toast.error("Você não tem acesso a essa área.");
    return <Navigate to="/dashboard" replace />;
  }

  if (tabKey && !allows(tabKey)) {
    toast.error("Você não tem acesso a essa área.");
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
