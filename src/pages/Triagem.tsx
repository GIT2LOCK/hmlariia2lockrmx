import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { AlertCircle, UserPlus, RefreshCw } from "lucide-react";

const mockDemandasSemAtribuicao = [
  {
    id: 1,
    titulo: "Declaração de IR",
    empresa: "Comércio ABC",
    cnpj: "98.765.432/0001-10",
    via: "WhatsApp",
    prazo_fim: "2024-02-10",
    criado_em: "2024-02-01",
  },
  {
    id: 2,
    titulo: "Regularização fiscal",
    empresa: "Serviços Gerais ME",
    cnpj: "55.666.777/0001-88",
    via: "WhatsApp",
    prazo_fim: "2024-02-08",
    criado_em: "2024-02-02",
  },
  {
    id: 3,
    titulo: "Análise de balanço",
    empresa: "Indústria XYZ",
    cnpj: "11.222.333/0001-44",
    via: "Email",
    prazo_fim: "2024-02-12",
    criado_em: "2024-02-03",
  },
  {
    id: 4,
    titulo: "Emissão de guias",
    empresa: "Tech Solutions",
    cnpj: "12.345.678/0001-90",
    via: "Email",
    prazo_fim: "2024-02-15",
    criado_em: "2024-02-04",
  },
];

const mockUsuarios = [
  { id: 1, nome: "João Silva" },
  { id: 2, nome: "Maria Santos" },
  { id: 3, nome: "Pedro Oliveira" },
  { id: 4, nome: "Lucas Ferreira" },
];

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

const Triagem = () => {
  const [demandas, setDemandas] = useState(mockDemandasSemAtribuicao);
  const [atribuicoes, setAtribuicoes] = useState<Record<number, string>>({});

  const handleAtribuicaoChange = (demandaId: number, usuarioId: string) => {
    setAtribuicoes((prev) => ({
      ...prev,
      [demandaId]: usuarioId,
    }));
  };

  const handleAtribuir = (demandaId: number) => {
    const usuarioId = atribuicoes[demandaId];
    if (usuarioId) {
      setDemandas((prev) => prev.filter((d) => d.id !== demandaId));
      setAtribuicoes((prev) => {
        const newAtribuicoes = { ...prev };
        delete newAtribuicoes[demandaId];
        return newAtribuicoes;
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Triagem / Fila</h2>
          <p className="text-muted-foreground">
            Demandas aguardando atribuição de responsável
          </p>
        </div>
        <Button variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aguardando Atribuição
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{demandas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Via Email
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {demandas.filter((d) => d.via === "Email").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Via WhatsApp
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {demandas.filter((d) => d.via === "WhatsApp").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Demandas Sem Responsável
          </CardTitle>
          <CardDescription>
            Atribua um responsável para cada demanda
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {demandas.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              Todas as demandas foram atribuídas! 🎉
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Demanda</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Via</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Atribuir para</TableHead>
                  <TableHead className="w-24">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demandas.map((demanda) => (
                  <TableRow key={demanda.id}>
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
                      <Badge variant="secondary" className={getViaColor(demanda.via)}>
                        {demanda.via}
                      </Badge>
                    </TableCell>
                    <TableCell>{demanda.prazo_fim}</TableCell>
                    <TableCell>
                      <Select
                        value={atribuicoes[demanda.id] || ""}
                        onValueChange={(value) =>
                          handleAtribuicaoChange(demanda.id, value)
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Selecionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          {mockUsuarios.map((usuario) => (
                            <SelectItem
                              key={usuario.id}
                              value={usuario.id.toString()}
                            >
                              {usuario.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        disabled={!atribuicoes[demanda.id]}
                        onClick={() => handleAtribuir(demanda.id)}
                      >
                        <UserPlus className="h-4 w-4 mr-1" />
                        Atribuir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Triagem;
