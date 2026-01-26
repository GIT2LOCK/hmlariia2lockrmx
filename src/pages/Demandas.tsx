import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Filter, Clock, AlertTriangle, Loader2, Mail, MessageSquare, Phone } from "lucide-react";
import { NovaDemandaModal } from "@/components/NovaDemandaModal";
import { VisualizarDemandaModal } from "@/components/VisualizarDemandaModal";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";

interface Demanda {
  dem_id: number;
  titulo_demanda: string;
  descricao_tarefa: string;
  prazo_inicio: string;
  prazo_fim: string;
  user_id: number | null;
  cnpj_cpf_id: number;
  status_id: number;
  prioridade_id: number;
  via_id: number;
  // Dados relacionados
  responsavel_nome?: string;
  empresa_nome?: string;
  empresa_cnpj?: string;
  status_nome?: string;
  prioridade_nome?: string;
  prioridade_nivel?: number;
  tem_email?: boolean;
  tem_whatsapp?: boolean;
}

// Função para calcular tempo restante ou excedido
const calcularTempoRestante = (prazoFim: string): { texto: string; excedido: boolean } => {
  const agora = new Date();
  const prazo = new Date(prazoFim);
  const diff = prazo.getTime() - agora.getTime();
  
  if (diff <= 0) {
    const diffExcedido = Math.abs(diff);
    const minutosExcedidos = Math.floor(diffExcedido / (1000 * 60));
    const horasExcedidas = Math.floor(minutosExcedidos / 60);
    const diasExcedidos = Math.floor(horasExcedidas / 24);
    
    if (diasExcedidos > 0) {
      return { texto: `Excedido há ${diasExcedidos}d ${horasExcedidas % 24}h`, excedido: true };
    } else if (horasExcedidas > 0) {
      return { texto: `Excedido há ${horasExcedidas}h ${minutosExcedidos % 60}min`, excedido: true };
    } else {
      return { texto: `Excedido há ${minutosExcedidos}min`, excedido: true };
    }
  }
  
  const minutosRestantes = Math.floor(diff / (1000 * 60));
  const horasRestantes = Math.floor(minutosRestantes / 60);
  const diasRestantes = Math.floor(horasRestantes / 24);
  
  if (diasRestantes > 0) {
    return { texto: `${diasRestantes}d ${horasRestantes % 24}h restantes`, excedido: false };
  } else if (horasRestantes > 0) {
    return { texto: `${horasRestantes}h ${minutosRestantes % 60}min restantes`, excedido: false };
  } else {
    return { texto: `${minutosRestantes}min restantes`, excedido: false };
  }
};

const getStatusColor = (statusNome: string) => {
  switch (statusNome?.toLowerCase()) {
    case "concluído":
    case "concluido":
      return "bg-green-100 text-green-700";
    case "em andamento":
      return "bg-blue-100 text-blue-700";
    case "pendente":
      return "bg-yellow-100 text-yellow-700";
    case "cancelado":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const getPrioridadeColor = (nivel: number) => {
  switch (nivel) {
    case 1: // Crítica
      return "bg-red-100 text-red-700";
    case 2: // Alta
      return "bg-orange-100 text-orange-700";
    case 3: // Média
      return "bg-yellow-100 text-yellow-700";
    case 4: // Baixa
    case 5: // Muito baixa
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const getViaIcon = (temEmail: boolean, temWhatsapp: boolean) => {
  if (temEmail && temWhatsapp) {
    return <Mail className="h-4 w-4 text-purple-600" />;
  } else if (temEmail) {
    return <Mail className="h-4 w-4 text-purple-600" />;
  } else if (temWhatsapp) {
    return <MessageSquare className="h-4 w-4 text-green-600" />;
  } else {
    return <Phone className="h-4 w-4 text-blue-600" />;
  }
};

const getViaLabel = (temEmail: boolean, temWhatsapp: boolean) => {
  if (temEmail && temWhatsapp) {
    return "Email + WhatsApp";
  } else if (temEmail) {
    return "Email";
  } else if (temWhatsapp) {
    return "WhatsApp";
  } else {
    return "Telefone";
  }
};

const Demandas = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVia, setFilterVia] = useState("todas");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedDemanda, setSelectedDemanda] = useState<Demanda | null>(null);
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useUser();

  const fetchDemandas = async () => {
    setIsLoading(true);
    try {
      // Buscar demandas com dados relacionados
      const { data: demandasData, error: demandasError } = await supabase
        .from("tb_demanda")
        .select(`
          *,
          tb_usuario:user_id(nome),
          tb_status:status_id(status_nome),
          tb_prioridade:prioridade_id(prioridade_nome, prioridade_nivel),
          tb_via:via_id(tem_email, tem_whatsapp),
          tb_cpf_cnpj:cnpj_cpf_id(
            cnpj_id,
            tb_cnpj:cnpj_id(razao_social, cnpj_numero)
          )
        `)
        .order("prazo_fim", { ascending: true });

      if (demandasError) throw demandasError;

      // Mapear dados para formato mais fácil de usar
      const demandasFormatadas = (demandasData || []).map((d: any) => ({
        ...d,
        responsavel_nome: d.tb_usuario?.nome || null,
        status_nome: d.tb_status?.status_nome || "Pendente",
        prioridade_nome: d.tb_prioridade?.prioridade_nome || "Média",
        prioridade_nivel: d.tb_prioridade?.prioridade_nivel || 2,
        tem_email: d.tb_via?.tem_email || false,
        tem_whatsapp: d.tb_via?.tem_whatsapp || false,
        empresa_nome: d.tb_cpf_cnpj?.tb_cnpj?.razao_social || "Não informado",
        empresa_cnpj: d.tb_cpf_cnpj?.tb_cnpj?.cnpj_numero || "",
      }));

      setDemandas(demandasFormatadas);
    } catch (error) {
      console.error("Erro ao buscar demandas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDemandas();
  }, []);

  const filteredDemandas = demandas.filter((demanda) => {
    const matchesSearch =
      demanda.titulo_demanda.toLowerCase().includes(searchTerm.toLowerCase()) ||
      demanda.empresa_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      demanda.empresa_cnpj?.includes(searchTerm);
    
    const viaLabel = getViaLabel(demanda.tem_email || false, demanda.tem_whatsapp || false);
    const matchesVia = filterVia === "todas" || viaLabel === filterVia;
    
    return matchesSearch && matchesVia;
  });

  const minhasDemandas = filteredDemandas.filter(
    (d) => d.responsavel_nome === user?.nome
  );
  const semAtribuicao = filteredDemandas.filter((d) => d.responsavel_nome === null);

  const handleDemandaCriada = () => {
    fetchDemandas();
  };

  const handleDemandaClick = (demanda: Demanda) => {
    setSelectedDemanda(demanda);
    setIsViewModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Demandas</h2>
          <p className="text-muted-foreground">
            Gerencie todas as demandas do escritório
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Demanda
        </Button>
      </div>

      <NovaDemandaModal 
        open={isModalOpen} 
        onOpenChange={setIsModalOpen} 
        onSuccess={handleDemandaCriada}
      />

      <VisualizarDemandaModal
        open={isViewModalOpen}
        onOpenChange={setIsViewModalOpen}
        demanda={selectedDemanda}
        onSuccess={handleDemandaCriada}
      />

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, empresa ou CNPJ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterVia} onValueChange={setFilterVia}>
          <SelectTrigger className="w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Via" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as vias</SelectItem>
            <SelectItem value="Email">Email</SelectItem>
            <SelectItem value="WhatsApp">WhatsApp</SelectItem>
            <SelectItem value="Telefone">Telefone</SelectItem>
            <SelectItem value="Email + WhatsApp">Email + WhatsApp</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="todas" className="w-full">
        <TabsList>
          <TabsTrigger value="todas">
            Todas ({filteredDemandas.length})
          </TabsTrigger>
          <TabsTrigger value="minhas">
            Minhas ({minhasDemandas.length})
          </TabsTrigger>
          <TabsTrigger value="sem-atribuicao">
            Sem atribuição ({semAtribuicao.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="todas">
          <DemandasTable demandas={filteredDemandas} isLoading={isLoading} onDemandaClick={handleDemandaClick} />
        </TabsContent>
        <TabsContent value="minhas">
          <DemandasTable demandas={minhasDemandas} isLoading={isLoading} onDemandaClick={handleDemandaClick} />
        </TabsContent>
        <TabsContent value="sem-atribuicao">
          <DemandasTable demandas={semAtribuicao} isLoading={isLoading} onDemandaClick={handleDemandaClick} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const DemandasTable = ({
  demandas,
  isLoading,
  onDemandaClick,
}: {
  demandas: Demanda[];
  isLoading: boolean;
  onDemandaClick: (demanda: Demanda) => void;
}) => (
  <Card>
    <CardContent className="p-0">
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Carregando demandas...</span>
        </div>
      ) : demandas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <p>Nenhuma demanda encontrada</p>
          <p className="text-sm">Clique em "Nova Demanda" para criar a primeira</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Via</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Prazo</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {demandas.map((demanda) => (
              <TableRow 
                key={demanda.dem_id} 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onDemandaClick(demanda)}
              >
                <TableCell className="font-medium">{demanda.titulo_demanda}</TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{demanda.empresa_nome}</div>
                    <div className="text-sm text-muted-foreground">
                      {demanda.empresa_cnpj}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {demanda.responsavel_nome || (
                    <span className="text-muted-foreground italic">
                      Não atribuído
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getViaIcon(demanda.tem_email || false, demanda.tem_whatsapp || false)}
                    <span className="text-sm">
                      {getViaLabel(demanda.tem_email || false, demanda.tem_whatsapp || false)}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={getPrioridadeColor(demanda.prioridade_nivel || 2)}>
                    {demanda.prioridade_nome}
                  </Badge>
                </TableCell>
                <TableCell>
                  {(() => {
                    const { texto, excedido } = calcularTempoRestante(demanda.prazo_fim);
                    return excedido ? (
                      <div className="flex items-center gap-1 text-red-600 font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        <span>Prazo excedido</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{texto}</span>
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={getStatusColor(demanda.status_nome || "")}
                  >
                    {demanda.status_nome}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);

export default Demandas;
