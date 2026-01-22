import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Users, AlertCircle, Mail, MessageSquare, Clock } from "lucide-react";

const stats = [
  { title: "Total de Demandas", value: "50", icon: ClipboardList, color: "text-blue-500" },
  { title: "Sem Responsável", value: "8", icon: Users, color: "text-red-500" },
  { title: "A Vencer (7 dias)", value: "12", icon: Clock, color: "text-yellow-500" },
  { title: "Via Email", value: "28", icon: Mail, color: "text-purple-500" },
  { title: "Via WhatsApp", value: "22", icon: MessageSquare, color: "text-green-500" },
];

const Dashboard = () => {
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-sm md:text-base text-muted-foreground">Visão geral do sistema de demandas</p>
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
              <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-yellow-500" />
              Demandas Sem Atribuição
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Demandas aguardando responsável</CardDescription>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
            <div className="space-y-2 md:space-y-3">
              {[
                { id: 1, titulo: "Declaração de IR", empresa: "Comércio ABC", prazo: "2024-02-10", via: "WhatsApp" },
                { id: 2, titulo: "Regularização fiscal", empresa: "Serviços Gerais ME", prazo: "2024-02-08", via: "WhatsApp" },
                { id: 3, titulo: "Análise de balanço", empresa: "Indústria XYZ", prazo: "2024-02-12", via: "Email" },
                { id: 4, titulo: "Emissão de guias", empresa: "Tech Solutions", prazo: "2024-02-15", via: "Email" },
              ].map((demanda) => (
                <div key={demanda.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 md:p-3 rounded-lg bg-muted/50">
                  <div className="min-w-0">
                    <span className="font-medium text-sm md:text-base block truncate">{demanda.titulo}</span>
                    <p className="text-xs md:text-sm text-muted-foreground truncate">{demanda.empresa}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end sm:flex-col sm:items-end gap-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      demanda.via === "WhatsApp" 
                        ? "bg-green-100 text-green-700" 
                        : "bg-purple-100 text-purple-700"
                    }`}>
                      {demanda.via}
                    </span>
                    <p className="text-[10px] md:text-xs text-muted-foreground">Prazo: {demanda.prazo}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 md:p-6">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <Clock className="h-4 w-4 md:h-5 md:w-5 text-red-500" />
              Demandas a Vencer
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Prazo nos próximos 7 dias</CardDescription>
          </CardHeader>
          <CardContent className="p-3 md:p-6 pt-0 md:pt-0">
            <div className="space-y-2 md:space-y-3">
              {[
                { id: 1, titulo: "Regularização fiscal", empresa: "Serviços Gerais ME", prazo: "2024-02-08", responsavel: "Não atribuído" },
                { id: 2, titulo: "Declaração de IR", empresa: "Comércio ABC", prazo: "2024-02-10", responsavel: "Não atribuído" },
                { id: 3, titulo: "Análise de balanço", empresa: "Indústria XYZ", prazo: "2024-02-12", responsavel: "Maria Santos" },
                { id: 4, titulo: "Revisão de balanço", empresa: "Tech Solutions", prazo: "2024-02-15", responsavel: "João Silva" },
              ].map((demanda) => (
                <div key={demanda.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2 md:p-3 rounded-lg bg-muted/50">
                  <div className="min-w-0">
                    <span className="font-medium text-sm md:text-base block truncate">{demanda.titulo}</span>
                    <p className="text-xs md:text-sm text-muted-foreground truncate">{demanda.empresa}</p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end sm:flex-col sm:items-end gap-1">
                    <span className={`text-xs md:text-sm ${
                      demanda.responsavel === "Não atribuído" 
                        ? "text-red-500" 
                        : "text-muted-foreground"
                    }`}>
                      {demanda.responsavel}
                    </span>
                    <p className="text-[10px] md:text-xs text-muted-foreground">{demanda.prazo}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
