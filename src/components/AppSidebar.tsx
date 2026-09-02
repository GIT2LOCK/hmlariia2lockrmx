import { 
  LayoutDashboard, 
  LogOut,
  PanelLeftClose,
  PanelLeft,
  Building2,
  MapPin,
  Radio,
  User,
  Users,
  Search,
  Contact,
  UserCheck,
  BookOpen,
  Activity,
  Ticket,
  Trello,
  ShieldCheck,
  AlertTriangle,
  Gauge,
  Link2,
  BarChart3,

} from "lucide-react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/contexts/UserContext";
import { logout } from "@/services/authService";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

import { Permission } from "@/lib/permissions";
import { useAllowedTabs, type TabKey } from "@/hooks/useAllowedTabs";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  permission?: Permission;
  tabKey?: TabKey;
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, tabKey: "dashboard" },
  { title: "Chamados", url: "/dashboard/chamados", icon: Ticket, permission: "tickets.view_own", tabKey: "chamados" },
  { title: "Kanban", url: "/dashboard/chamados-kanban", icon: Trello, permission: "tickets.view_own", tabKey: "chamados" },
  { title: "Dashboard Atendimento", url: "/dashboard/atendimento", icon: Gauge, permission: "dashboard.team", tabKey: "atendimento" },
  { title: "Empresas", url: "/dashboard/empresas", icon: Building2, permission: "registry.view", tabKey: "empresas" },
  { title: "Unidades", url: "/dashboard/unidades", icon: MapPin, permission: "registry.view", tabKey: "unidades" },
  { title: "Operadoras", url: "/dashboard/operadoras", icon: Radio, permission: "registry.view", tabKey: "operadoras" },
  { title: "Pessoas", url: "/dashboard/pessoas", icon: Contact, permission: "registry.view", tabKey: "pessoas" },
  { title: "Responsáveis", url: "/dashboard/responsaveis", icon: UserCheck, permission: "registry.view", tabKey: "responsaveis" },
  { title: "Base de Conhecimento", url: "/dashboard/base-conhecimento", icon: BookOpen, tabKey: "base_conhecimento" },
  { title: "Equipes", url: "/dashboard/equipes", icon: Users, permission: "team.view", tabKey: "equipes" },
  { title: "Relatório de Chamados", url: "/dashboard/relatorios/chamados", icon: BarChart3, permission: "registry.view", tabKey: "relatorios" },
  { title: "Relatórios Zabbix", url: "/dashboard/zabbix/relatorio-alertas", icon: AlertTriangle, permission: "registry.view", tabKey: "zabbix" },
  { title: "Monitoramento", url: "/dashboard/zabbix", icon: Activity, permission: "registry.view", tabKey: "zabbix" },
  { title: "Linkai", url: "/dashboard/linkai", icon: Link2, tabKey: "linkai" },
];

const glassMenuButtonClassName = "ariia-glass-menu-button";

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { user, refreshUser, canManageUsers, can, isGrafanaOnly, isBlocked } = useUser();
  const { allows } = useAllowedTabs();

  const isCliente = user.role === "CLIENTE";
  const isActive = (path: string) => currentPath === path;
  const visibleItems = (isGrafanaOnly || isBlocked)
    ? []
    : isCliente
      ? menuItems.filter((it) => it.url === "/dashboard/chamados")
      : menuItems.filter((it) =>
          (!it.permission || can(it.permission)) && allows(it.tabKey)
        );


  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_expires");
    localStorage.removeItem("auth_user");
    navigate("/", { replace: true });
    refreshUser();
    logout().catch(console.error);
  };

  return (
    <Sidebar className="ariia-glass-sidebar" collapsible="icon">
      <SidebarHeader className="border-b border-sky-300/20 px-3 py-3">
        <div className={`ariia-glass-user-card flex items-center ${collapsed ? 'justify-center !p-1' : 'gap-3'}`}>
          <Avatar className={`${collapsed ? 'h-8 w-8' : 'h-10 w-10'} transition-all duration-300`}>
            <AvatarImage src={user.avatar} alt={`${user.nome} ${user.sobrenome}`} />
            <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground">
              {user.nome[0]}{user.sobrenome?.[0] || ""}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-primary-foreground">
                {user.nome} {user.sobrenome}
              </span>
              <span className="text-xs font-medium text-white/85">{user.cargo}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-primary-foreground/60 text-xs uppercase tracking-wider">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className={glassMenuButtonClassName}
                  >
                    <NavLink to={item.url} className="flex items-center gap-3">
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-primary-foreground/60 text-xs uppercase tracking-wider">
            Conta
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {!isCliente && !isGrafanaOnly && !isBlocked && canManageUsers && allows("usuarios") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/dashboard/usuarios")}
                    tooltip="Usuários"
                    className={glassMenuButtonClassName}
                  >
                    <NavLink to="/dashboard/usuarios" className="flex items-center gap-3">
                      <Users className="h-5 w-5" />
                      <span>Usuários</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {!isCliente && !isGrafanaOnly && !isBlocked && canManageUsers && allows("grafana") && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/dashboard/grafana")}
                    tooltip="Grafana"
                    className={glassMenuButtonClassName}
                  >
                    <NavLink to="/dashboard/grafana" className="flex items-center gap-3">
                      <ShieldCheck className="h-5 w-5" />
                      <span>Grafana</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/dashboard/perfil")}
                  tooltip="Meu Perfil"
                  className={glassMenuButtonClassName}
                >
                  <NavLink to="/dashboard/perfil" className="flex items-center gap-3">
                    <User className="h-5 w-5" />
                    <span>Meu Perfil</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sky-300/20 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={handleLogout}
              tooltip="Sair"
              className={glassMenuButtonClassName}
            >
              <LogOut className="h-5 w-5" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={toggleSidebar}
              tooltip={collapsed ? "Expandir" : "Minimizar"}
              className={glassMenuButtonClassName}
            >
              {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
              <span>Minimizar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
