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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Visão geral do sistema de demandas</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              Demandas Sem Atribuição
            </CardTitle>
            <CardDescription>Demandas aguardando responsável</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { id: 1, titulo: "Declaração de IR", empresa: "Comércio ABC", prazo: "2024-02-10", via: "WhatsApp" },
                { id: 2, titulo: "Regularização fiscal", empresa: "Serviços Gerais ME", prazo: "2024-02-08", via: "WhatsApp" },
                { id: 3, titulo: "Análise de balanço", empresa: "Indústria XYZ", prazo: "2024-02-12", via: "Email" },
                { id: 4, titulo: "Emissão de guias", empresa: "Tech Solutions", prazo: "2024-02-15", via: "Email" },
              ].map((demanda) => (
                <div key={demanda.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <span className="font-medium">{demanda.titulo}</span>
                    <p className="text-sm text-muted-foreground">{demanda.empresa}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm px-2 py-1 rounded-full ${
                      demanda.via === "WhatsApp" 
                        ? "bg-green-100 text-green-700" 
                        : "bg-purple-100 text-purple-700"
                    }`}>
                      {demanda.via}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">Prazo: {demanda.prazo}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-red-500" />
              Demandas a Vencer
            </CardTitle>
            <CardDescription>Prazo nos próximos 7 dias</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { id: 1, titulo: "Regularização fiscal", empresa: "Serviços Gerais ME", prazo: "2024-02-08", responsavel: "Não atribuído" },
                { id: 2, titulo: "Declaração de IR", empresa: "Comércio ABC", prazo: "2024-02-10", responsavel: "Não atribuído" },
                { id: 3, titulo: "Análise de balanço", empresa: "Indústria XYZ", prazo: "2024-02-12", responsavel: "Maria Santos" },
                { id: 4, titulo: "Revisão de balanço", empresa: "Tech Solutions", prazo: "2024-02-15", responsavel: "João Silva" },
              ].map((demanda) => (
                <div key={demanda.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <span className="font-medium">{demanda.titulo}</span>
                    <p className="text-sm text-muted-foreground">{demanda.empresa}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-sm ${
                      demanda.responsavel === "Não atribuído" 
                        ? "text-red-500" 
                        : "text-muted-foreground"
                    }`}>
                      {demanda.responsavel}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">{demanda.prazo}</p>
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
