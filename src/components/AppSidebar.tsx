import { 
  LayoutDashboard, 
  ClipboardList, 
  Settings, 
  Users, 
  FileText, 
  LogOut,
  PanelLeftClose,
  PanelLeft,
  UsersRound,
  Webhook,
  Building2,
  AlertCircle,
  Clock,
  User,
  BarChart3,
  Inbox,
  UserCog
} from "lucide-react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useUser, UserRole } from "@/contexts/UserContext";
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
import { LucideIcon } from "lucide-react";

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

interface MenuSection {
  label: string;
  items: MenuItem[];
}

// Menus por perfil
const getMenusByRole = (role: UserRole): MenuSection[] => {
  switch (role) {
    case "VIEWER":
      return [
        {
          label: "Menu Principal",
          items: [
            { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
            { title: "Demandas", url: "/dashboard/demandas", icon: ClipboardList },
            { title: "Empresas", url: "/dashboard/empresas", icon: Building2 },
          ],
        },
        {
          label: "Conta",
          items: [
            { title: "Meu Perfil", url: "/dashboard/perfil", icon: User },
          ],
        },
      ];

    case "USER":
      return [
        {
          label: "Menu Principal",
          items: [
            { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
            { title: "Minhas Demandas", url: "/dashboard/demandas", icon: ClipboardList },
            { title: "Empresas", url: "/dashboard/empresas", icon: Building2 },
          ],
        },
        {
          label: "Conta",
          items: [
            { title: "Meu Perfil", url: "/dashboard/perfil", icon: User },
          ],
        },
      ];
    
    case "ADMIN":
      return [
        {
          label: "Menu Principal",
          items: [
            { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
            { title: "Demandas", url: "/dashboard/demandas", icon: ClipboardList },
            { title: "Empresas", url: "/dashboard/empresas", icon: Building2 },
            { title: "Pessoas", url: "/dashboard/pessoas", icon: Users },
            { title: "Relatórios", url: "/dashboard/relatorios", icon: BarChart3 },
          ],
        },
        {
          label: "Sistema",
          items: [
            { title: "Configurações", url: "/dashboard/configuracoes", icon: Settings },
            { title: "Usuários", url: "/dashboard/usuarios", icon: UserCog },
            { title: "Grupos", url: "/dashboard/grupos", icon: UsersRound },
            { title: "Webhook", url: "/dashboard/webhook", icon: Webhook },
          ],
        },
        {
          label: "Conta",
          items: [
            { title: "Meu Perfil", url: "/dashboard/perfil", icon: User },
          ],
        },
      ];
    
    case "SUPERADMIN":
      return [
        {
          label: "Menu Principal",
          items: [
            { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
            { title: "Triagem / Fila", url: "/dashboard/triagem", icon: Inbox },
            { title: "Demandas", url: "/dashboard/demandas", icon: ClipboardList },
            { title: "Empresas", url: "/dashboard/empresas", icon: Building2 },
            { title: "Pessoas", url: "/dashboard/pessoas", icon: Users },
            { title: "Relatórios", url: "/dashboard/relatorios", icon: BarChart3 },
          ],
        },
        {
          label: "Sistema",
          items: [
            { title: "Configurações", url: "/dashboard/configuracoes", icon: Settings },
            { title: "Usuários", url: "/dashboard/usuarios", icon: UserCog },
            { title: "Grupos", url: "/dashboard/grupos", icon: UsersRound },
            { title: "Webhook", url: "/dashboard/webhook", icon: Webhook },
          ],
        },
        {
          label: "Conta",
          items: [
            { title: "Meu Perfil", url: "/dashboard/perfil", icon: User },
          ],
        },
      ];
    
    default:
      return [];
  }
};

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { user, refreshUser } = useUser();

  const isActive = (path: string) => currentPath === path;

  const menuSections = getMenusByRole(user.role);

  const handleLogout = () => {
    logout();
    refreshUser();
    navigate("/", { replace: true });
  };

  return (
    <Sidebar
      className="border-r border-border bg-primary"
      collapsible="icon"
    >
      <SidebarHeader className="p-3 border-b border-primary-foreground/20">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <Avatar className={`${collapsed ? 'h-8 w-8' : 'h-10 w-10'} transition-all duration-300`}>
            <AvatarImage src={user.avatar} alt={`${user.nome} ${user.sobrenome}`} />
            <AvatarFallback className="bg-primary-foreground/20 text-primary-foreground">
              {user.nome[0]}{user.sobrenome[0]}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-primary-foreground">
                {user.nome} {user.sobrenome}
              </span>
              <span className="text-xs text-primary-foreground/60">
                {user.cargo}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-primary">
        {menuSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-primary-foreground/60 text-xs uppercase tracking-wider">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                      className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 data-[active=true]:bg-primary-foreground/20 data-[active=true]:text-primary-foreground"
                    >
                      <NavLink 
                        to={item.url} 
                        className="flex items-center gap-3"
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-primary-foreground/20 bg-primary px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={handleLogout}
              tooltip="Sair"
              className="text-primary-foreground/80 hover:text-red-300 hover:bg-primary-foreground/10"
            >
              <LogOut className="h-5 w-5" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton 
              onClick={toggleSidebar}
              tooltip={collapsed ? "Expandir" : "Minimizar"}
              className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
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
