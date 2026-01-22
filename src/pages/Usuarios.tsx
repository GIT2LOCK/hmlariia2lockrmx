import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, UserCog, Shield } from "lucide-react";

const mockUsuarios = [
  {
    id: 1,
    nome: "João Silva",
    email: "joao.silva@escritorio.com",
    cpf: "111.222.333-44",
    permissao: "SUPERADMIN",
    ativo: true,
    demandas_atribuidas: 3,
  },
  {
    id: 2,
    nome: "Maria Santos",
    email: "maria.santos@escritorio.com",
    cpf: "222.333.444-55",
    permissao: "ADMIN",
    ativo: true,
    demandas_atribuidas: 5,
  },
  {
    id: 3,
    nome: "Pedro Oliveira",
    email: "pedro.oliveira@escritorio.com",
    cpf: "333.444.555-66",
    permissao: "USER",
    ativo: true,
    demandas_atribuidas: 2,
  },
  {
    id: 4,
    nome: "Ana Costa",
    email: "ana.costa@escritorio.com",
    cpf: "444.555.666-77",
    permissao: "VIEWER",
    ativo: false,
    demandas_atribuidas: 0,
  },
  {
    id: 5,
    nome: "Lucas Ferreira",
    email: "lucas.ferreira@escritorio.com",
    cpf: "555.666.777-88",
    permissao: "USER",
    ativo: true,
    demandas_atribuidas: 4,
  },
];

const getPermissaoColor = (permissao: string) => {
  switch (permissao) {
    case "SUPERADMIN":
      return "bg-purple-100 text-purple-700";
    case "ADMIN":
      return "bg-red-100 text-red-700";
    case "USER":
      return "bg-blue-100 text-blue-700";
    case "VIEWER":
      return "bg-gray-100 text-gray-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const Usuarios = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [usuarios, setUsuarios] = useState(mockUsuarios);

  const filteredUsuarios = usuarios.filter(
    (usuario) =>
      usuario.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.cpf.includes(searchTerm)
  );

  const toggleAtivo = (id: number) => {
    setUsuarios(
      usuarios.map((u) =>
        u.id === id ? { ...u, ativo: !u.ativo } : u
      )
    );
  };

  const totalAtivos = usuarios.filter((u) => u.ativo).length;
  const totalInativos = usuarios.filter((u) => !u.ativo).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Usuários</h2>
          <p className="text-muted-foreground">
            Gerenciar usuários internos do sistema
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Usuário
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Usuários
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{usuarios.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Usuários Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{totalAtivos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Usuários Inativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{totalInativos}</div>
          </CardContent>
        </Card>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, email ou CPF..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            Lista de Usuários
          </CardTitle>
          <CardDescription>
            {filteredUsuarios.length} usuário(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Permissão</TableHead>
                <TableHead>Demandas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ativo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsuarios.map((usuario) => (
                <TableRow key={usuario.id}>
                  <TableCell className="font-medium">{usuario.nome}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {usuario.email}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {usuario.cpf}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`${getPermissaoColor(usuario.permissao)} flex items-center gap-1 w-fit`}
                    >
                      <Shield className="h-3 w-3" />
                      {usuario.permissao}
                    </Badge>
                  </TableCell>
                  <TableCell>{usuario.demandas_atribuidas}</TableCell>
                  <TableCell>
                    <Badge
                      variant={usuario.ativo ? "default" : "secondary"}
                      className={usuario.ativo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}
                    >
                      {usuario.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={usuario.ativo}
                      onCheckedChange={() => toggleAtivo(usuario.id)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Usuarios;
