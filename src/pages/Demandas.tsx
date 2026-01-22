import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Search, Filter } from "lucide-react";

const mockDemandas = [
  {
    id: 1,
    titulo: "Revisão de balanço patrimonial",
    empresa: "Tech Solutions LTDA",
    cnpj: "12.345.678/0001-90",
    responsavel: "João Silva",
    via: "Email",
    prazo_fim: "2024-02-15",
    status: "Em andamento",
  },
  {
    id: 2,
    titulo: "Declaração de IR",
    empresa: "Comércio ABC",
    cnpj: "98.765.432/0001-10",
    responsavel: null,
    via: "WhatsApp",
    prazo_fim: "2024-02-10",
    status: "Pendente",
  },
  {
    id: 3,
    titulo: "Emissão de certidão negativa",
    empresa: "Indústria XYZ",
    cnpj: "11.222.333/0001-44",
    responsavel: "Maria Santos",
    via: "Email",
    prazo_fim: "2024-02-20",
    status: "Concluído",
  },
  {
    id: 4,
    titulo: "Regularização fiscal",
    empresa: "Serviços Gerais ME",
    cnpj: "55.666.777/0001-88",
    responsavel: null,
    via: "WhatsApp",
    prazo_fim: "2024-02-08",
    status: "Pendente",
  },
  {
    id: 5,
    titulo: "Atualização cadastral",
    empresa: "Tech Solutions LTDA",
    cnpj: "12.345.678/0001-90",
    responsavel: "João Silva",
    via: "Email",
    prazo_fim: "2024-02-25",
    status: "Em andamento",
  },
];

const getStatusColor = (status: string) => {
  switch (status) {
    case "Concluído":
      return "bg-green-100 text-green-700";
    case "Em andamento":
      return "bg-blue-100 text-blue-700";
    case "Pendente":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const getViaColor = (via: string) => {
  switch (via) {
    case "Email":
      return "bg-purple-100 text-purple-700";
    case "WhatsApp":
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const Demandas = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVia, setFilterVia] = useState("todas");

  const filteredDemandas = mockDemandas.filter((demanda) => {
    const matchesSearch =
      demanda.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      demanda.empresa.toLowerCase().includes(searchTerm.toLowerCase()) ||
      demanda.cnpj.includes(searchTerm);
    const matchesVia = filterVia === "todas" || demanda.via === filterVia;
    return matchesSearch && matchesVia;
  });

  const minhasDemandas = filteredDemandas.filter(
    (d) => d.responsavel === "João Silva"
  );
  const semAtribuicao = filteredDemandas.filter((d) => d.responsavel === null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Demandas</h2>
          <p className="text-muted-foreground">
            Gerencie todas as demandas do escritório
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nova Demanda
        </Button>
      </div>

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
          <DemandasTable demandas={filteredDemandas} />
        </TabsContent>
        <TabsContent value="minhas">
          <DemandasTable demandas={minhasDemandas} />
        </TabsContent>
        <TabsContent value="sem-atribuicao">
          <DemandasTable demandas={semAtribuicao} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const DemandasTable = ({
  demandas,
}: {
  demandas: typeof mockDemandas;
}) => (
  <Card>
    <CardContent className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Título</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Responsável</TableHead>
            <TableHead>Via</TableHead>
            <TableHead>Prazo</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {demandas.map((demanda) => (
            <TableRow key={demanda.id} className="cursor-pointer hover:bg-muted/50">
              <TableCell className="font-medium">{demanda.titulo}</TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{demanda.empresa}</div>
                  <div className="text-sm text-muted-foreground">
                    {demanda.cnpj}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                {demanda.responsavel || (
                  <span className="text-muted-foreground italic">
                    Não atribuído
                  </span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className={getViaColor(demanda.via)}>
                  {demanda.via}
                </Badge>
              </TableCell>
              <TableCell>{demanda.prazo_fim}</TableCell>
              <TableCell>
                <Badge
                  variant="secondary"
                  className={getStatusColor(demanda.status)}
                >
                  {demanda.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
);

export default Demandas;
