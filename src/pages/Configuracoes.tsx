import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, Shield, Mail, Tag, Building } from "lucide-react";

const mockPermissoes = [
  { id: 1, nome: "Administrador", descricao: "Acesso total ao sistema" },
  { id: 2, nome: "Contador", descricao: "Acesso às demandas e relatórios" },
  { id: 3, nome: "Assistente", descricao: "Acesso limitado às demandas" },
  { id: 4, nome: "Visualizador", descricao: "Apenas visualização" },
];

const mockVias = [
  { id: 1, nome: "Email", descricao: "Demandas recebidas por email" },
  { id: 2, nome: "WhatsApp", descricao: "Demandas recebidas por WhatsApp" },
  { id: 3, nome: "Telefone", descricao: "Demandas recebidas por telefone" },
  { id: 4, nome: "Presencial", descricao: "Demandas recebidas presencialmente" },
];

const mockCategorias = [
  { id: 1, nome: "Tecnologia", cor: "blue" },
  { id: 2, nome: "Comércio", cor: "green" },
  { id: 3, nome: "Indústria", cor: "orange" },
  { id: 4, nome: "Serviços", cor: "purple" },
  { id: 5, nome: "Saúde", cor: "red" },
];

const mockAgencias = [
  { id: 1, nome: "Centro", endereco: "Rua Principal, 100 - Centro" },
  { id: 2, nome: "Zona Sul", endereco: "Av. Sul, 200 - Zona Sul" },
  { id: 3, nome: "Zona Norte", endereco: "Rua Norte, 300 - Zona Norte" },
  { id: 4, nome: "Zona Oeste", endereco: "Av. Oeste, 400 - Zona Oeste" },
];

const getCategoriaColor = (cor: string) => {
  const colors: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    orange: "bg-orange-100 text-orange-700",
    purple: "bg-purple-100 text-purple-700",
    red: "bg-red-100 text-red-700",
  };
  return colors[cor] || "bg-gray-100 text-gray-700";
};

const Configuracoes = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Configurações</h2>
        <p className="text-muted-foreground">
          Gerenciar tabelas de apoio do sistema
        </p>
      </div>

      <Tabs defaultValue="permissoes" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="permissoes" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Permissões
          </TabsTrigger>
          <TabsTrigger value="vias" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Vias
          </TabsTrigger>
          <TabsTrigger value="categorias" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Categorias
          </TabsTrigger>
          <TabsTrigger value="agencias" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Agências
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissoes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Permissões</CardTitle>
                <CardDescription>
                  Níveis de acesso do sistema
                </CardDescription>
              </div>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova Permissão
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockPermissoes.map((permissao) => (
                    <TableRow key={permissao.id}>
                      <TableCell className="font-medium">
                        {permissao.nome}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {permissao.descricao}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vias">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Vias de Comunicação</CardTitle>
                <CardDescription>
                  Canais de recebimento de demandas
                </CardDescription>
              </div>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova Via
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockVias.map((via) => (
                    <TableRow key={via.id}>
                      <TableCell className="font-medium">{via.nome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {via.descricao}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categorias">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Categorias</CardTitle>
                <CardDescription>
                  Categorias de empresas
                </CardDescription>
              </div>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova Categoria
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Cor</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockCategorias.map((categoria) => (
                    <TableRow key={categoria.id}>
                      <TableCell className="font-medium">
                        {categoria.nome}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={getCategoriaColor(categoria.cor)}
                        >
                          {categoria.cor}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agencias">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Agências</CardTitle>
                <CardDescription>
                  Unidades de atendimento
                </CardDescription>
              </div>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova Agência
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockAgencias.map((agencia) => (
                    <TableRow key={agencia.id}>
                      <TableCell className="font-medium">
                        {agencia.nome}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {agencia.endereco}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-red-500">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Configuracoes;
