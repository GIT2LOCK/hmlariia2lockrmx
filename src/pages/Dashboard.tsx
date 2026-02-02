import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Users, AlertCircle, Clock, Mail, MessageSquare, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealTimeRefresh } from "@/hooks/useRealTimeRefresh";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Demanda {
  dem_id: number;
  titulo_demanda: string;
  prazo_fim: string;
  created_at: string | null;
  user_id: number | null;
  tb_usuario: { nome: string } | null;
  tb_via: { tem_email: boolean; tem_whatsapp: boolean } | null;
  tb_cpf_cnpj: {
    cnpj_id: number;
    tb_cnpj: { razao_social: string } | null;
  } | null;
}

const ITEMS_PER_PAGE = 10;

const Dashboard = () => {
  const queryClient = useQueryClient();
  const [vencidasPage, setVencidasPage] = useState(0);
  const [aVencerPage, setAVencerPage] = useState(0);
  
  const { data: demandas, isLoading, isFetching } = useQuery({
    queryKey: ["dashboard-demandas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tb_demanda")
        .select(`
          dem_id,
          titulo_demanda,
          prazo_fim,
          created_at,
          user_id,
          tb_usuario:user_id(nome),
          tb_via:via_id(tem_email, tem_whatsapp),
          tb_cpf_cnpj:cnpj_cpf_id(
            cnpj_id,
            tb_cnpj:cnpj_id(razao_social)
          )
        `)
        .order("prazo_fim", { ascending: true });

      if (error) throw error;
      return data as Demanda[];
    },
  });

  // Real-time refresh
  useRealTimeRefresh({
    table: "tb_demanda",
    onRefresh: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-demandas"] });
    },
    refreshInterval: 30000, // 30 seconds fallback
  });

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const totalDemandas = demandas?.length || 0;
  const demandasVencidas = demandas?.filter(d => new Date(d.prazo_fim) < now).length || 0;
  const aVencer7Dias = demandas?.filter(d => {
    const prazo = new Date(d.prazo_fim);
    return prazo >= now && prazo <= sevenDaysFromNow;
  }).length || 0;
  const viaEmail = demandas?.filter(d => d.tb_via?.tem_email).length || 0;
  const viaWhatsApp = demandas?.filter(d => d.tb_via?.tem_whatsapp).length || 0;

  const stats = [
    { title: "Total de Demandas", value: totalDemandas.toString(), icon: ClipboardList, color: "text-blue-500" },
    { title: "Demandas Vencidas", value: demandasVencidas.toString(), icon: Users, color: "text-red-500" },
    { title: "A Vencer (7 dias)", value: aVencer7Dias.toString(), icon: Clock, color: "text-yellow-500" },
    { title: "Via Email", value: viaEmail.toString(), icon: Mail, color: "text-purple-500" },
    { title: "Via WhatsApp", value: viaWhatsApp.toString(), icon: MessageSquare, color: "text-green-500" },
  ];

  // Lista completa ordenada por data de criação
  const demandasVencidasAll = demandas
    ?.filter(d => new Date(d.prazo_fim) < now)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()) || [];

  const demandasAVencerAll = demandas
    ?.filter(d => {
      const prazo = new Date(d.prazo_fim);
      return prazo >= now && prazo <= sevenDaysFromNow;
    })
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()) || [];

  // Paginação
  const vencidasTotalPages = Math.ceil(demandasVencidasAll.length / ITEMS_PER_PAGE);
  const aVencerTotalPages = Math.ceil(demandasAVencerAll.length / ITEMS_PER_PAGE);

  const demandasVencidasList = demandasVencidasAll.slice(
    vencidasPage * ITEMS_PER_PAGE,
    (vencidasPage + 1) * ITEMS_PER_PAGE
  );

  const demandasAVencerList = demandasAVencerAll.slice(
    aVencerPage * ITEMS_PER_PAGE,
    (aVencerPage + 1) * ITEMS_PER_PAGE
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  const getViaLabel = (via: { tem_email: boolean; tem_whatsapp: boolean } | null) => {
    if (!via) return "N/A";
    if (via.tem_whatsapp) return "WhatsApp";
    if (via.tem_email) return "Email";
    return "Outro";
  };

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm md:text-base text-muted-foreground">Visão geral do sistema de demandas</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="p-3 md:p-6 pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="p-3 md:p-6 pt-0">
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm md:text-base text-muted-foreground">Visão geral do sistema de demandas</p>
        </div>
        {isFetching && !isLoading && (
          <Badge variant="outline" className="gap-1 animate-pulse">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Atualizando...
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 md:p-6 md:pb-2">
              <CardTitle className="text-[10px] sm:text-xs md:text-sm font-medium text-muted-foreground leading-tight">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 md:h-5 md:w-5 ${stat.color} flex-shrink-0`} />
            </CardHeader>
            <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
              <div className="text-xl sm:text-2xl md:text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-destructive" />
              Demandas Vencidas
              {demandasVencidasAll.length > 0 && (
                <Badge variant="destructive" className="ml-2">{demandasVencidasAll.length}</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Demandas com prazo excedido</CardDescription>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
            {demandasVencidasAll.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma demanda vencida</p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2 md:space-y-3">
                  {demandasVencidasList.map((demanda) => (
                    <div key={demanda.dem_id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 md:p-3 rounded-lg bg-muted/50">
                      <div className="min-w-0">
                        <span className="font-medium text-sm md:text-base block truncate">{demanda.titulo_demanda}</span>
                        <p className="text-xs md:text-sm text-muted-foreground truncate">
                          {demanda.tb_cpf_cnpj?.tb_cnpj?.razao_social || "Empresa não informada"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end sm:flex-col sm:items-end gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          getViaLabel(demanda.tb_via) === "WhatsApp" 
                            ? "bg-accent text-accent-foreground" 
                            : "bg-secondary text-secondary-foreground"
                        }`}>
                          {getViaLabel(demanda.tb_via)}
                        </span>
                        <p className="text-[10px] md:text-xs text-destructive font-medium">
                          Vencido: {formatDate(demanda.prazo_fim)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {vencidasTotalPages > 1 && (
                  <Tabs value={vencidasPage.toString()} onValueChange={(v) => setVencidasPage(Number(v))} className="w-full">
                    <TabsList className="w-full flex justify-center flex-wrap h-auto gap-1">
                      {Array.from({ length: vencidasTotalPages }, (_, i) => (
                        <TabsTrigger key={i} value={i.toString()} className="min-w-[2rem] px-2 py-1 text-xs">
                          {i + 1}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Clock className="h-4 w-4 md:h-5 md:w-5 text-warning" />
              Demandas a Vencer
              {demandasAVencerAll.length > 0 && (
                <Badge variant="outline" className="ml-2 border-warning text-warning">{demandasAVencerAll.length}</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Prazo nos próximos 7 dias</CardDescription>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
            {demandasAVencerAll.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma demanda a vencer</p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2 md:space-y-3">
                  {demandasAVencerList.map((demanda) => (
                    <div key={demanda.dem_id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 md:p-3 rounded-lg bg-muted/50">
                      <div className="min-w-0">
                        <span className="font-medium text-sm md:text-base block truncate">{demanda.titulo_demanda}</span>
                        <p className="text-xs md:text-sm text-muted-foreground truncate">
                          {demanda.tb_cpf_cnpj?.tb_cnpj?.razao_social || "Empresa não informada"}
                        </p>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end sm:flex-col sm:items-end gap-1">
                        <span className={`text-xs md:text-sm ${
                          !demanda.tb_usuario 
                            ? "text-destructive" 
                            : "text-muted-foreground"
                        }`}>
                          {demanda.tb_usuario?.nome || "Não atribuído"}
                        </span>
                        <p className="text-[10px] md:text-xs text-muted-foreground">{formatDate(demanda.prazo_fim)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {aVencerTotalPages > 1 && (
                  <Tabs value={aVencerPage.toString()} onValueChange={(v) => setAVencerPage(Number(v))} className="w-full">
                    <TabsList className="w-full flex justify-center flex-wrap h-auto gap-1">
                      {Array.from({ length: aVencerTotalPages }, (_, i) => (
                        <TabsTrigger key={i} value={i.toString()} className="min-w-[2rem] px-2 py-1 text-xs">
                          {i + 1}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
