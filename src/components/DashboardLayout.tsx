import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";

export function DashboardLayout() {
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-w-0">
          {/* Header mobile com trigger do sidebar */}
          {isMobile && (
            <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 lg:hidden">
              <SidebarTrigger className="-ml-1">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle sidebar</span>
              </SidebarTrigger>
              <span className="font-semibold text-lg">WebCount</span>
            </header>
          )}
          <div className="flex-1 p-4 md:p-6 bg-muted/30 overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
