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
import { Plus, Search, User, Building2 } from "lucide-react";

const mockPessoas = [
  {
    id: 1,
    nome: "Carlos Eduardo Silva",
    cpf: "123.456.789-00",
    email: "carlos@email.com",
    telefone: "(11) 99999-1111",
    vinculos: [
      { cnpj: "12.345.678/0001-90", razao_social: "Tech Solutions LTDA", cargo: "Sócio" },
      { cnpj: "44.555.666/0001-77", razao_social: "Consultoria Premium", cargo: "Diretor" },
    ],
  },
  {
    id: 2,
    nome: "Ana Paula Oliveira",
    cpf: "987.654.321-00",
    email: "ana@email.com",
    telefone: "(11) 99999-2222",
    vinculos: [
      { cnpj: "98.765.432/0001-10", razao_social: "Comércio ABC", cargo: "Proprietária" },
    ],
  },
  {
    id: 3,
    nome: "Roberto Almeida",
    cpf: "456.789.123-00",
    email: "roberto@email.com",
    telefone: "(11) 99999-3333",
    vinculos: [
      { cnpj: "11.222.333/0001-44", razao_social: "Indústria XYZ", cargo: "Sócio" },
    ],
  },
  {
    id: 4,
    nome: "Fernanda Costa",
    cpf: "789.123.456-00",
    email: "fernanda@email.com",
    telefone: "(11) 99999-4444",
    vinculos: [
      { cnpj: "55.666.777/0001-88", razao_social: "Serviços Gerais ME", cargo: "Proprietária" },
    ],
  },
  {
    id: 5,
    nome: "Paulo Henrique Santos",
    cpf: "321.654.987-00",
    email: "paulo@email.com",
    telefone: "(11) 99999-5555",
    vinculos: [
      { cnpj: "12.345.678/0001-90", razao_social: "Tech Solutions LTDA", cargo: "Diretor" },
    ],
  },
];

const Pessoas = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPessoa, setSelectedPessoa] = useState<typeof mockPessoas[0] | null>(null);

  const filteredPessoas = mockPessoas.filter(
    (pessoa) =>
      pessoa.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pessoa.cpf.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Pessoas</h2>
          <p className="text-muted-foreground">
            Gerenciar pessoas e seus vínculos com empresas
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nova Pessoa
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CPF..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Pessoas</CardTitle>
              <CardDescription>
                {filteredPessoas.length} pessoa(s) encontrada(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Vínculos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPessoas.map((pessoa) => (
                    <TableRow
                      key={pessoa.id}
                      className={`cursor-pointer hover:bg-muted/50 ${
                        selectedPessoa?.id === pessoa.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedPessoa(pessoa)}
                    >
                      <TableCell className="font-medium">{pessoa.nome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {pessoa.cpf}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{pessoa.email}</div>
                          <div className="text-muted-foreground">{pessoa.telefone}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {pessoa.vinculos.length} empresa(s)
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
          {selectedPessoa ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Detalhes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{selectedPessoa.nome}</h3>
                  <p className="text-sm text-muted-foreground">
                    CPF: {selectedPessoa.cpf}
                  </p>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p>{selectedPessoa.email}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Telefone:</span>
                    <p>{selectedPessoa.telefone}</p>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Vínculos com Empresas
                  </h4>
                  <div className="space-y-3">
                    {selectedPessoa.vinculos.map((vinculo, index) => (
                      <div
                        key={index}
                        className="p-3 rounded-lg bg-muted/50 text-sm"
                      >
                        <div className="font-medium">{vinculo.razao_social}</div>
                        <div className="text-muted-foreground">
                          {vinculo.cnpj}
                        </div>
                        <Badge variant="outline" className="mt-1">
                          {vinculo.cargo}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <Button className="w-full" variant="outline">
                  Adicionar vínculo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
                Selecione uma pessoa para ver os detalhes
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Pessoas;
