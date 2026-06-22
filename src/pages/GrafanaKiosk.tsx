import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { LogOut, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { logout } from "@/services/authService";

/**
 * Tela fallback para usuários com escopo GRAFANA_ONLY: exibe o dashboard
 * Grafana em modo kiosk, ocupando toda a tela. Apenas botões de sair e
 * abrir em nova guia ficam visíveis.
 */
export default function GrafanaKiosk() {
  const { user, grafanaKioskUrl, refreshUser } = useUser();
  const navigate = useNavigate();

  const handleLogout = async () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_expires");
    localStorage.removeItem("auth_user");
    navigate("/", { replace: true });
    refreshUser();
    logout().catch(console.error);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-primary px-4 py-2 text-primary-foreground">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{user.nome} {user.sobrenome}</span>
          <span className="text-xs opacity-70">Acesso restrito ao Grafana</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(grafanaKioskUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Abrir em nova guia
          </Button>
          <Button variant="destructive" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" />
            Sair
          </Button>
        </div>
      </header>
      <iframe
        title="Grafana"
        src={grafanaKioskUrl}
        className="flex-1 w-full border-0"
        allow="fullscreen"
      />
    </div>
  );
}
