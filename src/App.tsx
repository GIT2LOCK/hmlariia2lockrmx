import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
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
import Permissoes from "./pages/Permissoes";
import GrafanaKiosk from "./pages/GrafanaKiosk";
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
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/oauth/consent" element={<OAuthConsent />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<ProtectedRoute tabKey="dashboard"><Dashboard /></ProtectedRoute>} />
              <Route path="empresas" element={<ProtectedRoute tabKey="empresas"><Empresas /></ProtectedRoute>} />
              <Route path="unidades" element={<ProtectedRoute tabKey="unidades"><Unidades /></ProtectedRoute>} />
              <Route path="unidades/:id" element={<ProtectedRoute tabKey="unidades"><UnidadeDetalhe /></ProtectedRoute>} />
              <Route path="operadoras" element={<ProtectedRoute tabKey="operadoras"><Operadoras /></ProtectedRoute>} />
              <Route path="pessoas" element={<ProtectedRoute tabKey="pessoas"><Pessoas /></ProtectedRoute>} />
              <Route path="responsaveis" element={<ProtectedRoute tabKey="responsaveis"><Responsaveis /></ProtectedRoute>} />
              <Route path="usuarios" element={<ProtectedRoute tabKey="usuarios"><Usuarios /></ProtectedRoute>} />
              <Route path="permissoes" element={<ProtectedRoute tabKey="permissoes"><Permissoes /></ProtectedRoute>} />
              <Route path="base-conhecimento" element={<ProtectedRoute tabKey="base_conhecimento"><BaseConhecimento /></ProtectedRoute>} />
              <Route path="relatorios" element={<ProtectedRoute tabKey="relatorios"><Relatorios /></ProtectedRoute>} />
              <Route path="chamados" element={<ProtectedRoute tabKey="chamados"><Chamados /></ProtectedRoute>} />
              <Route path="atendimento" element={<ProtectedRoute tabKey="atendimento"><DashboardAtendimento /></ProtectedRoute>} />
              <Route path="chamados/:id" element={<ProtectedRoute tabKey="chamados"><ChamadoDetalhe /></ProtectedRoute>} />
              <Route path="equipes" element={<ProtectedRoute tabKey="equipes"><Equipes /></ProtectedRoute>} />
              <Route path="zabbix" element={<ProtectedRoute tabKey="zabbix"><DashboardZabbix /></ProtectedRoute>} />
              <Route path="zabbix/tv" element={<ProtectedRoute tabKey="zabbix"><ZabbixTvView /></ProtectedRoute>} />
              <Route path="zabbix/relatorio-alertas" element={<ProtectedRoute tabKey="zabbix"><RelatorioAlertasZabbix /></ProtectedRoute>} />
              <Route path="grafana" element={<ProtectedRoute tabKey="grafana"><GrafanaControle /></ProtectedRoute>} />
              <Route path="grafana-kiosk" element={<ProtectedRoute allowGrafanaOnly><GrafanaKiosk /></ProtectedRoute>} />
              <Route path="perfil" element={<ProtectedRoute allowGrafanaOnly><MeuPerfil /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </UserProvider>
  </QueryClientProvider>
);

export default App;
