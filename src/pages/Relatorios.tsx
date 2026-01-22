import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  BarChart3, 
  Download, 
  Building2, 
  Users, 
  Calendar,
  TrendingUp 
} from "lucide-react";

const mockRelatorios = [
  {
    id: 1,
    titulo: "Demandas por Empresa",
    descricao: "Total de demandas agrupadas por empresa",
    icone: Building2,
    cor: "bg-blue-100 text-blue-700",
  },
  {
    id: 2,
    titulo: "Demandas por Responsável",
    descricao: "Total de demandas por responsável interno",
    icone: Users,
    cor: "bg-green-100 text-green-700",
  },
  {
    id: 3,
    titulo: "Demandas por Período",
    descricao: "Análise de demandas em intervalo de datas",
    icone: Calendar,
    cor: "bg-purple-100 text-purple-700",
  },
  {
    id: 4,
    titulo: "Ranking de Empresas",
    descricao: "Empresas com mais demandas abertas",
    icone: TrendingUp,
    cor: "bg-orange-100 text-orange-700",
  },
];

const mockDadosEmpresa = [
  { empresa: "Tech Solutions LTDA", total: 15, concluidas: 10, pendentes: 5 },
  { empresa: "Comércio ABC", total: 12, concluidas: 8, pendentes: 4 },
  { empresa: "Indústria XYZ", total: 10, concluidas: 7, pendentes: 3 },
  { empresa: "Serviços Gerais ME", total: 8, concluidas: 5, pendentes: 3 },
  { empresa: "Consultoria Premium", total: 5, concluidas: 5, pendentes: 0 },
];

const mockDadosResponsavel = [
  { responsavel: "João Silva", total: 18, concluidas: 12, pendentes: 6 },
  { responsavel: "Maria Santos", total: 15, concluidas: 10, pendentes: 5 },
  { responsavel: "Pedro Oliveira", total: 10, concluidas: 8, pendentes: 2 },
  { responsavel: "Lucas Ferreira", total: 7, concluidas: 5, pendentes: 2 },
];

const Relatorios = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Relatórios</h2>
          <p className="text-muted-foreground">
            Análises e exportações de dados
          </p>
        </div>
        <Select defaultValue="mes">
          <SelectTrigger className="w-48">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semana">Última semana</SelectItem>
            <SelectItem value="mes">Último mês</SelectItem>
            <SelectItem value="trimestre">Último trimestre</SelectItem>
            <SelectItem value="ano">Último ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {mockRelatorios.map((relatorio) => (
          <Card key={relatorio.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className={`w-10 h-10 rounded-lg ${relatorio.cor} flex items-center justify-center mb-2`}>
                <relatorio.icone className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">{relatorio.titulo}</CardTitle>
              <CardDescription className="text-sm">
                {relatorio.descricao}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Demandas por Empresa
            </CardTitle>
            <CardDescription>
              Resumo de demandas por empresa cliente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockDadosEmpresa.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <div className="font-medium">{item.empresa}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.total} demanda(s) total
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                      {item.concluidas} concluídas
                    </Badge>
                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                      {item.pendentes} pendentes
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Demandas por Responsável
            </CardTitle>
            <CardDescription>
              Performance dos responsáveis internos
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mockDadosResponsavel.map((item, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.responsavel}</span>
                    <span className="text-sm text-muted-foreground">
                      {item.total} demandas
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{
                        width: `${(item.concluidas / item.total) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{item.concluidas} concluídas</span>
                    <span>{Math.round((item.concluidas / item.total) * 100)}% de conclusão</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Resumo Geral
          </CardTitle>
          <CardDescription>
            Visão consolidada do período selecionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold text-primary">50</div>
              <div className="text-sm text-muted-foreground">Total de Demandas</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold text-green-600">35</div>
              <div className="text-sm text-muted-foreground">Concluídas</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold text-yellow-600">15</div>
              <div className="text-sm text-muted-foreground">Pendentes</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold text-blue-600">70%</div>
              <div className="text-sm text-muted-foreground">Taxa de Conclusão</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Relatorios;
