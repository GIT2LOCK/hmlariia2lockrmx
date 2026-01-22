import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Building2, Mail, Phone, MapPin } from "lucide-react";

const mockEmpresas = [
  {
    id: 1,
    razao_social: "Tech Solutions LTDA",
    cnpj: "12.345.678/0001-90",
    categoria: "Tecnologia",
    agencia: "Centro",
    email: "contato@techsolutions.com",
    telefone: "(11) 99999-0001",
    endereco: "Rua das Flores, 123 - São Paulo/SP",
    demandas_ativas: 2,
  },
  {
    id: 2,
    razao_social: "Comércio ABC",
    cnpj: "98.765.432/0001-10",
    categoria: "Comércio",
    agencia: "Zona Sul",
    email: "financeiro@comercioabc.com.br",
    telefone: "(11) 99999-0002",
    endereco: "Av. Paulista, 1000 - São Paulo/SP",
    demandas_ativas: 1,
  },
  {
    id: 3,
    razao_social: "Indústria XYZ",
    cnpj: "11.222.333/0001-44",
    categoria: "Indústria",
    agencia: "Zona Norte",
    email: "contabil@industriaxyz.com",
    telefone: "(11) 99999-0003",
    endereco: "Rua Industrial, 500 - Guarulhos/SP",
    demandas_ativas: 1,
  },
  {
    id: 4,
    razao_social: "Serviços Gerais ME",
    cnpj: "55.666.777/0001-88",
    categoria: "Serviços",
    agencia: "Centro",
    email: "admin@servicosgerais.com",
    telefone: "(11) 99999-0004",
    endereco: "Rua do Comércio, 50 - São Paulo/SP",
    demandas_ativas: 1,
  },
  {
    id: 5,
    razao_social: "Consultoria Premium",
    cnpj: "44.555.666/0001-77",
    categoria: "Serviços",
    agencia: "Zona Oeste",
    email: "contato@consultoriapremium.com",
    telefone: "(11) 99999-0005",
    endereco: "Av. Brasil, 2000 - São Paulo/SP",
    demandas_ativas: 0,
  },
];

const getCategoriaColor = (categoria: string) => {
  switch (categoria) {
    case "Tecnologia":
      return "bg-blue-100 text-blue-700";
    case "Comércio":
      return "bg-green-100 text-green-700";
    case "Indústria":
      return "bg-orange-100 text-orange-700";
    case "Serviços":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const Empresas = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmpresa, setSelectedEmpresa] = useState<typeof mockEmpresas[0] | null>(null);

  const filteredEmpresas = mockEmpresas.filter(
    (empresa) =>
      empresa.razao_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empresa.cnpj.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Empresas</h2>
          <p className="text-muted-foreground">
            Cadastro e consulta de empresas/clientes
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nova Empresa
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por razão social ou CNPJ..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Empresas</CardTitle>
              <CardDescription>
                {filteredEmpresas.length} empresa(s) encontrada(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Agência</TableHead>
                    <TableHead>Demandas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmpresas.map((empresa) => (
                    <TableRow
                      key={empresa.id}
                      className={`cursor-pointer hover:bg-muted/50 ${
                        selectedEmpresa?.id === empresa.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedEmpresa(empresa)}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{empresa.razao_social}</div>
                          <div className="text-sm text-muted-foreground">
                            {empresa.cnpj}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getCategoriaColor(empresa.categoria)}
                        >
                          {empresa.categoria}
                        </Badge>
                      </TableCell>
                      <TableCell>{empresa.agencia}</TableCell>
                      <TableCell>
                        <Badge variant={empresa.demandas_ativas > 0 ? "default" : "secondary"}>
                          {empresa.demandas_ativas} ativa(s)
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div>
          {selectedEmpresa ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Detalhes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    {selectedEmpresa.razao_social}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedEmpresa.cnpj}
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEmpresa.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{selectedEmpresa.telefone}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span>{selectedEmpresa.endereco}</span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Informações</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Categoria:</span>
                      <Badge
                        variant="secondary"
                        className={getCategoriaColor(selectedEmpresa.categoria)}
                      >
                        {selectedEmpresa.categoria}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Agência:</span>
                      <span>{selectedEmpresa.agencia}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Demandas ativas:</span>
                      <span>{selectedEmpresa.demandas_ativas}</span>
                    </div>
                  </div>
                </div>

                <Button className="w-full" variant="outline">
                  Ver demandas desta empresa
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
                Selecione uma empresa para ver os detalhes
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Empresas;
