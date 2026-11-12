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
  ArrowUpDown,
  Palette,
  Sun,
  Moon,
  Warehouse,
  Boxes,
  MessageCircle,

  Wifi,
  ChevronDown,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser } from "@/contexts/UserContext";
import { logout } from "@/services/authService";
import { toast } from "sonner";

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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { Permission, canAccessElevadores } from "@/lib/permissions";
import { useAllowedTabs, type TabKey } from "@/hooks/useAllowedTabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MenuItem {
  title: string;
  url: string;
  icon: any;
  permission?: Permission;
  tabKey?: TabKey;
}

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    title: "Visão geral",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, tabKey: "dashboard" },
      { title: "Dashboard Atendimento", url: "/dashboard/atendimento", icon: Gauge, permission: "dashboard.team", tabKey: "atendimento" },
    ],
  },
  {
    title: "Atendimento",
    items: [
      { title: "Chamados", url: "/dashboard/chamados", icon: Ticket, permission: "tickets.view_own", tabKey: "chamados" },
      { title: "Kanban", url: "/dashboard/chamados-kanban", icon: Trello, permission: "tickets.view_own", tabKey: "chamados" },
      { title: "Filas e Equipes", url: "/dashboard/equipes", icon: Users, permission: "team.view", tabKey: "equipes" },
      { title: "Base de Conhecimento", url: "/dashboard/base-conhecimento", icon: BookOpen, tabKey: "base_conhecimento" },
      { title: "Relatório de Chamados", url: "/dashboard/relatorios/chamados", icon: BarChart3, permission: "registry.view", tabKey: "relatorios" },
    ],
  },
  {
    title: "Comunicação",
    items: [
      { title: "AriiaTalk", url: "/dashboard/ariiatalk", icon: MessageCircle, tabKey: "ariiatalk" },
    ],
  },
  {
    title: "Cadastros e ativos",
    items: [
      { title: "Empresas", url: "/dashboard/empresas", icon: Building2, permission: "registry.view", tabKey: "empresas" },
      { title: "Unidades", url: "/dashboard/unidades", icon: MapPin, permission: "registry.view", tabKey: "unidades" },
      { title: "Operadoras", url: "/dashboard/operadoras", icon: Radio, permission: "registry.view", tabKey: "operadoras" },
      { title: "Pessoas", url: "/dashboard/pessoas", icon: Contact, permission: "registry.view", tabKey: "pessoas" },
      { title: "Responsáveis", url: "/dashboard/responsaveis", icon: UserCheck, permission: "registry.view", tabKey: "responsaveis" },
      { title: "Inventário", url: "/dashboard/inventario", icon: Boxes, permission: "registry.view", tabKey: "inventario" },
      { title: "Elevadores", url: "/dashboard/elevadores", icon: ArrowUpDown, permission: "registry.view", tabKey: "elevadores" },
    ],
  },
  {
    title: "Observabilidade",
    items: [
      { title: "Monitoramento", url: "/dashboard/zabbix", icon: Activity, permission: "registry.view", tabKey: "zabbix" },
      { title: "Disponibilidade de Links", url: "/dashboard/zabbix/disponibilidade-links", icon: Wifi, permission: "registry.view", tabKey: "zabbix" },
      { title: "Relatórios Zabbix", url: "/dashboard/zabbix/relatorio-alertas", icon: AlertTriangle, permission: "registry.view", tabKey: "zabbix" },
    ],
  },
  {
    title: "Ferramentas",
    items: [
      { title: "Linkai", url: "/dashboard/linkai", icon: Link2, tabKey: "linkai" },
    ],
  },
];

const glassMenuButtonClassName = "ariia-glass-menu-button";

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { user, refreshUser, canManageUsers, can, isGrafanaOnly, isBlocked, saveAccountTheme, isSavingTheme } = useUser();
  const { allows } = useAllowedTabs();
  const { theme = "light" } = useTheme();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("ariia-sidebar-collapsed-groups") || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch {
      return {};
    }
  });

  const isCliente = user.role === "CLIENTE";
  const isActive = (path: string) => currentPath === path;
  const visibleGroups = (isGrafanaOnly || isBlocked)
    ? []
    : menuGroups.map((group) => ({
        ...group,
        items: group.items.filter((it) => {
        if (it.tabKey === "elevadores") return canAccessElevadores(user.role, user.email) || allows("elevadores");
        if (isCliente) return it.url === "/dashboard/chamados";
        return (!it.permission || can(it.permission)) && allows(it.tabKey);
        }),
      })).filter((group) => group.items.length > 0);

  useEffect(() => {
    const activeGroup = menuGroups.find((group) => group.items.some((item) => isActive(item.url)));
    if (activeGroup && collapsedGroups[activeGroup.title]) {
      setCollapsedGroups((current) => {
        const next = { ...current, [activeGroup.title]: false };
        localStorage.setItem("ariia-sidebar-collapsed-groups", JSON.stringify(next));
        return next;
      });
    }
  }, [currentPath, collapsedGroups]);

  const setGroupOpen = (title: string, open: boolean) => {
    setCollapsedGroups((current) => {
      const next = { ...current, [title]: !open };
      localStorage.setItem("ariia-sidebar-collapsed-groups", JSON.stringify(next));
      return next;
    });
  };


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
        {visibleGroups.map((group) => (
          <Collapsible key={group.title} open={!collapsedGroups[group.title]} onOpenChange={(open) => setGroupOpen(group.title, open)}>
            <SidebarGroup className="ariia-sidebar-group">
              <SidebarGroupLabel asChild className="ariia-sidebar-group-label">
                <CollapsibleTrigger className="ariia-sidebar-group-trigger" aria-label={`${collapsedGroups[group.title] ? "Expandir" : "Recolher"} ${group.title}`}>
                  <span>{group.title}</span>
                  <span className="ariia-sidebar-group-meta">
                    <span className="ariia-sidebar-group-count">{group.items.length}</span>
                    <ChevronDown className="ariia-sidebar-chevron" aria-hidden="true" />
                  </span>
                </CollapsibleTrigger>
              </SidebarGroupLabel>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => (
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
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip="Tema" className={glassMenuButtonClassName}>
                  <Palette className="h-5 w-5" />
                  <span>Tema</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-52">
                <DropdownMenuLabel>Aparência</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={(value) => {
                  saveAccountTheme(value).catch(() => toast.error("Não foi possível salvar o tema. Tente novamente."));
                }}>
                  <DropdownMenuRadioItem value="light" disabled={isSavingTheme} className="gap-2">
                    <Sun className="h-4 w-4" /> Claro
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark" disabled={isSavingTheme} className="gap-2">
                    <Moon className="h-4 w-4" /> Escuro
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="goodstorage" disabled={isSavingTheme} className="gap-2">
                    <Warehouse className="h-4 w-4" />
                    <span className="flex-1">GoodStorage</span>
                    <span className="flex gap-1" aria-hidden="true">
                      <span className="goodstorage-swatch-orange h-2.5 w-2.5 rounded-full" />
                      <span className="goodstorage-swatch-green h-2.5 w-2.5 rounded-full" />
                      <span className="goodstorage-swatch-blue h-2.5 w-2.5 rounded-full" />
                    </span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
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

