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

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Empresas", url: "/dashboard/empresas", icon: Building2 },
  { title: "Unidades", url: "/dashboard/unidades", icon: MapPin },
  { title: "Operadoras", url: "/dashboard/operadoras", icon: Radio },
  { title: "Pessoas", url: "/dashboard/pessoas", icon: Contact },
  { title: "Responsáveis", url: "/dashboard/responsaveis", icon: UserCheck },
  { title: "Base de Conhecimento", url: "/dashboard/base-conhecimento", icon: BookOpen },
  { title: "Dashboard Zabbix", url: "/dashboard/zabbix", icon: Activity },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { user, refreshUser, canManageUsers } = useUser();

  const isActive = (path: string) => currentPath === path;

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
    <Sidebar className="border-r border-border bg-primary" collapsible="icon">
      <SidebarHeader className="p-3 border-b border-primary-foreground/20">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
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
              <span className="text-xs text-primary-foreground/60">{user.cargo}</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-primary">
        <SidebarGroup>
          <SidebarGroupLabel className="text-primary-foreground/60 text-xs uppercase tracking-wider">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 data-[active=true]:bg-primary-foreground/20 data-[active=true]:text-primary-foreground"
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
              {canManageUsers && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/dashboard/usuarios")}
                    tooltip="Usuários"
                    className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 data-[active=true]:bg-primary-foreground/20 data-[active=true]:text-primary-foreground"
                  >
                    <NavLink to="/dashboard/usuarios" className="flex items-center gap-3">
                      <Users className="h-5 w-5" />
                      <span>Usuários</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActive("/dashboard/perfil")}
                  tooltip="Meu Perfil"
                  className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 data-[active=true]:bg-primary-foreground/20 data-[active=true]:text-primary-foreground"
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
