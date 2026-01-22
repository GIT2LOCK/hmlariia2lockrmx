import { 
  LayoutDashboard, 
  ClipboardList, 
  Settings, 
  Users, 
  FileText, 
  HelpCircle,
  LogOut,
  PanelLeftClose,
  PanelLeft
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import logo from "@/assets/logo.png";

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
import { Button } from "@/components/ui/button";

const menuItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Tasks", url: "/dashboard/tasks", icon: ClipboardList },
  { title: "Usuários", url: "/dashboard/users", icon: Users },
  { title: "Relatórios", url: "/dashboard/reports", icon: FileText },
];

const configItems = [
  { title: "Configurações", url: "/dashboard/settings", icon: Settings },
  { title: "Ajuda", url: "/dashboard/help", icon: HelpCircle },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  return (
    <Sidebar
      className="border-r border-border bg-primary"
      collapsible="icon"
    >
      <SidebarHeader className="p-3 border-b border-primary-foreground/20">
        <div className="flex items-center justify-center">
          <img 
            src={logo} 
            alt="Web Contador" 
            className={`transition-all duration-300 ${collapsed ? 'h-8 w-8 object-contain' : 'h-9'}`}
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-primary">
        <SidebarGroup>
          <SidebarGroupLabel className="text-primary-foreground/60 text-xs uppercase tracking-wider">
            Menu Principal
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

        <SidebarGroup>
          <SidebarGroupLabel className="text-primary-foreground/60 text-xs uppercase tracking-wider">
            Sistema
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {configItems.map((item) => (
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
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-primary-foreground/20 bg-primary">
        <Button 
          variant="ghost" 
          className={`w-full text-primary-foreground/70 hover:text-red-300 hover:bg-primary-foreground/10 ${collapsed ? 'justify-center' : 'justify-start gap-3'}`}
          asChild
        >
          <NavLink to="/">
            <LogOut className="h-5 w-5" />
            {!collapsed && <span>Sair</span>}
          </NavLink>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="w-full text-primary-foreground/70 hover:text-primary-foreground hover:bg-primary-foreground/10 mt-2"
        >
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
