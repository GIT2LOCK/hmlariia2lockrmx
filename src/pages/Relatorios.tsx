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
  FileSpreadsheet
} from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "@/hooks/use-toast";

interface Demanda {
  dem_id: number;
  titulo_demanda: string;
  descricao_tarefa: string;
  prazo_inicio: string;
  prazo_fim: string;
  user_id: number | null;
  tb_usuario: { nome: string } | null;
  tb_status: { status_nome: string } | null;
  tb_prioridade: { prioridade_nome: string } | null;
  tb_via: { tem_email: boolean; tem_whatsapp: boolean } | null;
  tb_cpf_cnpj: {
    cnpj_id: number;
    tb_cnpj: { razao_social: string; cnpj_numero: string } | null;
  } | null;
}

const Relatorios = () => {
  const { user } = useUser();
  const canViewByResponsavel = user.role === "SUPERADMIN" || user.role === "ADMIN";
  const [periodo, setPeriodo] = useState("mes");

  const { data: demandas, isLoading } = useQuery({
    queryKey: ["relatorios-demandas", periodo],
    queryFn: async () => {
      let dateFilter = new Date();
      
      switch (periodo) {
        case "semana":
          dateFilter.setDate(dateFilter.getDate() - 7);
          break;
        case "mes":
          dateFilter.setMonth(dateFilter.getMonth() - 1);
          break;
        case "trimestre":
          dateFilter.setMonth(dateFilter.getMonth() - 3);
          break;
        case "ano":
          dateFilter.setFullYear(dateFilter.getFullYear() - 1);
          break;
      }

      const { data, error } = await supabase
        .from("tb_demanda")
        .select(`
          dem_id,
          titulo_demanda,
          descricao_tarefa,
          prazo_inicio,
          prazo_fim,
          user_id,
          tb_usuario:user_id(nome),
          tb_status:status_id(status_nome),
          tb_prioridade:prioridade_id(prioridade_nome),
          tb_via:via_id(tem_email, tem_whatsapp),
          tb_cpf_cnpj:cnpj_cpf_id(
            cnpj_id,
            tb_cnpj:cnpj_id(razao_social, cnpj_numero)
          )
        `)
        .gte("prazo_inicio", dateFilter.toISOString())
        .order("prazo_fim", { ascending: true });

      if (error) throw error;
      return data as Demanda[];
    },
  });

  // Calcular dados por empresa
  const dadosEmpresa = demandas?.reduce((acc, demanda) => {
    const empresa = demanda.tb_cpf_cnpj?.tb_cnpj?.razao_social || "Não informada";
    if (!acc[empresa]) {
      acc[empresa] = { total: 0, concluidas: 0, pendentes: 0 };
    }
    acc[empresa].total++;
    if (demanda.tb_status?.status_nome?.toLowerCase().includes("conclu")) {
      acc[empresa].concluidas++;
    } else {
      acc[empresa].pendentes++;
    }
    return acc;
  }, {} as Record<string, { total: number; concluidas: number; pendentes: number }>) || {};

  // Calcular dados por responsável
  const dadosResponsavel = demandas?.reduce((acc, demanda) => {
    const responsavel = demanda.tb_usuario?.nome || "Não atribuído";
    if (!acc[responsavel]) {
      acc[responsavel] = { total: 0, concluidas: 0, pendentes: 0 };
    }
    acc[responsavel].total++;
    if (demanda.tb_status?.status_nome?.toLowerCase().includes("conclu")) {
      acc[responsavel].concluidas++;
    } else {
      acc[responsavel].pendentes++;
    }
    return acc;
  }, {} as Record<string, { total: number; concluidas: number; pendentes: number }>) || {};

  // Estatísticas gerais
  const totalDemandas = demandas?.length || 0;
  const concluidas = demandas?.filter(d => d.tb_status?.status_nome?.toLowerCase().includes("conclu")).length || 0;
  const pendentes = totalDemandas - concluidas;
  const taxaConclusao = totalDemandas > 0 ? Math.round((concluidas / totalDemandas) * 100) : 0;

  const getViaLabel = (via: { tem_email: boolean; tem_whatsapp: boolean } | null) => {
    if (!via) return "N/A";
    if (via.tem_whatsapp) return "WhatsApp";
    if (via.tem_email) return "Email";
    return "Outro";
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  const exportToExcel = (data: unknown[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dados");
    XLSX.writeFile(workbook, `${filename}.xlsx`);
    toast({
      title: "Exportação concluída",
      description: `Arquivo ${filename}.xlsx baixado com sucesso.`,
    });
  };

  const exportDemandasPorEmpresa = () => {
    const data = Object.entries(dadosEmpresa).map(([empresa, dados]) => ({
      Empresa: empresa,
      "Total de Demandas": dados.total,
      Concluídas: dados.concluidas,
      Pendentes: dados.pendentes,
      "Taxa de Conclusão (%)": dados.total > 0 ? Math.round((dados.concluidas / dados.total) * 100) : 0,
    }));
    exportToExcel(data, "demandas-por-empresa");
  };

  const exportDemandasPorResponsavel = () => {
    const data = Object.entries(dadosResponsavel).map(([responsavel, dados]) => ({
      Responsável: responsavel,
      "Total de Demandas": dados.total,
      Concluídas: dados.concluidas,
      Pendentes: dados.pendentes,
      "Taxa de Conclusão (%)": dados.total > 0 ? Math.round((dados.concluidas / dados.total) * 100) : 0,
    }));
    exportToExcel(data, "demandas-por-responsavel");
  };

  const exportDemandasPorPeriodo = () => {
    const data = demandas?.map(d => ({
      ID: d.dem_id,
      Título: d.titulo_demanda,
      Empresa: d.tb_cpf_cnpj?.tb_cnpj?.razao_social || "Não informada",
      Responsável: d.tb_usuario?.nome || "Não atribuído",
      Status: d.tb_status?.status_nome || "N/A",
      Prioridade: d.tb_prioridade?.prioridade_nome || "N/A",
      Via: getViaLabel(d.tb_via),
      "Data Início": formatDate(d.prazo_inicio),
      "Data Fim": formatDate(d.prazo_fim),
    })) || [];
    exportToExcel(data, "demandas-por-periodo");
  };

  const exportTodasDemandas = () => {
    const data = demandas?.map(d => ({
      ID: d.dem_id,
      Título: d.titulo_demanda,
      Descrição: d.descricao_tarefa,
      Empresa: d.tb_cpf_cnpj?.tb_cnpj?.razao_social || "Não informada",
      CNPJ: d.tb_cpf_cnpj?.tb_cnpj?.cnpj_numero || "N/A",
      Responsável: d.tb_usuario?.nome || "Não atribuído",
      Status: d.tb_status?.status_nome || "N/A",
      Prioridade: d.tb_prioridade?.prioridade_nome || "N/A",
      Via: getViaLabel(d.tb_via),
      "Data Início": formatDate(d.prazo_inicio),
      "Data Fim": formatDate(d.prazo_fim),
    })) || [];
    exportToExcel(data, "todas-demandas");
  };

  const mockRelatorios = [
    {
      id: 1,
      titulo: "Demandas por Empresa",
      descricao: "Total de demandas agrupadas por empresa",
      icone: Building2,
      cor: "bg-blue-100 text-blue-700",
      visible: true,
      onExport: exportDemandasPorEmpresa,
    },
    {
      id: 2,
      titulo: "Demandas por Responsável",
      descricao: "Total de demandas por responsável interno",
      icone: Users,
      cor: "bg-green-100 text-green-700",
      visible: canViewByResponsavel,
      onExport: exportDemandasPorResponsavel,
    },
    {
      id: 3,
      titulo: "Demandas por Período",
      descricao: "Análise de demandas em intervalo de datas",
      icone: Calendar,
      cor: "bg-purple-100 text-purple-700",
      visible: true,
      onExport: exportDemandasPorPeriodo,
    },
    {
      id: 4,
      titulo: "Exportar Todas Demandas",
      descricao: "Exportar planilha completa com todas as demandas",
      icone: FileSpreadsheet,
      cor: "bg-orange-100 text-orange-700",
      visible: true,
      onExport: exportTodasDemandas,
    },
  ].filter(r => r.visible);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Relatórios</h2>
            <p className="text-muted-foreground">Análises e exportações de dados</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-4 w-32 mt-2" />
                <Skeleton className="h-3 w-48 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Relatórios</h2>
          <p className="text-muted-foreground">
            Análises e exportações de dados
          </p>
        </div>
        <Select value={periodo} onValueChange={setPeriodo}>
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
              <Button variant="outline" size="sm" className="w-full" onClick={relatorio.onExport}>
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
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
            {Object.keys(dadosEmpresa).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma demanda no período</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(dadosEmpresa).slice(0, 5).map(([empresa, dados], index) => (
                  <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <div className="font-medium">{empresa}</div>
                      <div className="text-sm text-muted-foreground">
                        {dados.total} demanda(s) total
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        {dados.concluidas} concluídas
                      </Badge>
                      <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                        {dados.pendentes} pendentes
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {canViewByResponsavel && (
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
              {Object.keys(dadosResponsavel).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma demanda no período</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(dadosResponsavel).slice(0, 5).map(([responsavel, dados], index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{responsavel}</span>
                        <span className="text-sm text-muted-foreground">
                          {dados.total} demandas
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-primary h-2 rounded-full"
                          style={{
                            width: `${dados.total > 0 ? (dados.concluidas / dados.total) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{dados.concluidas} concluídas</span>
                        <span>{dados.total > 0 ? Math.round((dados.concluidas / dados.total) * 100) : 0}% de conclusão</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
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
              <div className="text-3xl font-bold text-primary">{totalDemandas}</div>
              <div className="text-sm text-muted-foreground">Total de Demandas</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold text-green-600">{concluidas}</div>
              <div className="text-sm text-muted-foreground">Concluídas</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold text-yellow-600">{pendentes}</div>
              <div className="text-sm text-muted-foreground">Pendentes</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <div className="text-3xl font-bold text-blue-600">{taxaConclusao}%</div>
              <div className="text-sm text-muted-foreground">Taxa de Conclusão</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Relatorios;
