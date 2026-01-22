import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList, Users, FileText, CheckCircle } from "lucide-react";

const stats = [
  { title: "Tasks Pendentes", value: "12", icon: ClipboardList, color: "text-blue-500" },
  { title: "Tasks Concluídas", value: "48", icon: CheckCircle, color: "text-green-500" },
  { title: "Usuários Ativos", value: "8", icon: Users, color: "text-purple-500" },
  { title: "Relatórios", value: "24", icon: FileText, color: "text-orange-500" },
];

const Dashboard = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
        <p className="text-muted-foreground">Bem-vindo ao painel de controle</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <CardTitle>Tasks Recentes</CardTitle>
            <CardDescription>Últimas tasks cadastradas no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { id: 1, title: "Revisar documentação fiscal", status: "Pendente" },
                { id: 2, title: "Atualizar cadastro de clientes", status: "Em andamento" },
                { id: 3, title: "Gerar relatório mensal", status: "Concluído" },
                { id: 4, title: "Conferir lançamentos contábeis", status: "Pendente" },
              ].map((task) => (
                <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="font-medium">{task.title}</span>
                  <span className={`text-sm px-2 py-1 rounded-full ${
                    task.status === "Concluído" 
                      ? "bg-green-100 text-green-700" 
                      : task.status === "Em andamento"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atividade Recente</CardTitle>
            <CardDescription>Últimas ações realizadas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { action: "Task #123 foi concluída", time: "Há 5 minutos", user: "João Silva" },
                { action: "Novo usuário cadastrado", time: "Há 1 hora", user: "Admin" },
                { action: "Relatório exportado", time: "Há 2 horas", user: "Maria Santos" },
                { action: "Configurações atualizadas", time: "Há 3 horas", user: "Admin" },
              ].map((activity, index) => (
                <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="h-2 w-2 mt-2 rounded-full bg-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{activity.action}</p>
                    <p className="text-sm text-muted-foreground">
                      {activity.user} · {activity.time}
                    </p>
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
