import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { DashboardLayout } from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Empresas from "./pages/Empresas";
import Unidades from "./pages/Unidades";
import UnidadeDetalhe from "./pages/UnidadeDetalhe";
import Operadoras from "./pages/Operadoras";
import MeuPerfil from "./pages/MeuPerfil";
import Usuarios from "./pages/Usuarios";
import Pessoas from "./pages/Pessoas";
import Responsaveis from "./pages/Responsaveis";
import BaseConhecimento from "./pages/BaseConhecimento";
import DashboardZabbix from "./pages/DashboardZabbix";
import ZabbixTvView from "./pages/ZabbixTvView";
import Relatorios from "./pages/Relatorios";
import Chamados from "./pages/Chamados";
import DashboardAtendimento from "./pages/DashboardAtendimento";
import ChamadoDetalhe from "./pages/ChamadoDetalhe";
import Equipes from "./pages/Equipes";
import OAuthConsent from "./pages/OAuthConsent";
import GrafanaControle from "./pages/GrafanaControle";
import RelatorioAlertasZabbix from "./pages/RelatorioAlertasZabbix";
import { UserProvider } from "./contexts/UserContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <UserProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="empresas" element={<Empresas />} />
              <Route path="unidades" element={<Unidades />} />
              <Route path="unidades/:id" element={<UnidadeDetalhe />} />
              <Route path="operadoras" element={<Operadoras />} />
              <Route path="pessoas" element={<Pessoas />} />
              <Route path="responsaveis" element={<Responsaveis />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="base-conhecimento" element={<BaseConhecimento />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="chamados" element={<Chamados />} />
              <Route path="chamados/:id" element={<ChamadoDetalhe />} />
              <Route path="equipes" element={<Equipes />} />
              <Route path="zabbix" element={<DashboardZabbix />} />
              <Route path="zabbix/tv" element={<ZabbixTvView />} />
              <Route path="zabbix/relatorio-alertas" element={<RelatorioAlertasZabbix />} />
              <Route path="grafana" element={<GrafanaControle />} />
              <Route path="grafana" element={<GrafanaControle />} />
              <Route path="perfil" element={<MeuPerfil />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </UserProvider>
  </QueryClientProvider>
);

export default App;
