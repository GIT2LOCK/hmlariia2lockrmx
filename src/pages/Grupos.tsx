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
import { Plus, Search, UsersRound, Pencil, Trash2, Shield, Crown, UserCog, User, Eye } from "lucide-react";
import { UserRole } from "@/contexts/UserContext";

export interface Grupo {
  id: number;
  nome: string;
  descricao: string;
  role: UserRole;
  membros: number;
}

const getGrupoIcon = (role: UserRole) => {
  switch (role) {
    case "SUPERADMIN":
      return Crown;
    case "ADMIN":
      return UserCog;
    case "USER":
      return User;
    case "VIEWER":
      return Eye;
    default:
      return Shield;
  }
};

const getGrupoColor = (role: UserRole) => {
  switch (role) {
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

export const mockGrupos: Grupo[] = [
  {
    id: 1,
    nome: "SUPERADMIN",
    descricao: "Controle total e irrestrito do sistema",
    role: "SUPERADMIN",
    membros: 1,
  },
  {
    id: 2,
    nome: "ADMIN",
    descricao: "Gestão administrativa (exceto sobre Superadmins)",
    role: "ADMIN",
    membros: 2,
  },
  {
    id: 3,
    nome: "USER",
    descricao: "Operacional focado em demandas próprias",
    role: "USER",
    membros: 5,
  },
  {
    id: 4,
    nome: "VIEWER",
    descricao: "Somente visualização",
    role: "VIEWER",
    membros: 3,
  },
];

const Grupos = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrupo, setSelectedGrupo] = useState<typeof mockGrupos[0] | null>(null);

  const filteredGrupos = mockGrupos.filter((grupo) =>
    grupo.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Grupos</h2>
          <p className="text-muted-foreground">
            Gerenciar grupos de usuários e permissões
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Novo Grupo
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar grupos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="h-5 w-5" />
                Lista de Grupos
              </CardTitle>
              <CardDescription>
                {filteredGrupos.length} grupo(s) encontrado(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Membros</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGrupos.map((grupo) => {
                    const IconComponent = getGrupoIcon(grupo.role);
                    return (
                      <TableRow
                        key={grupo.id}
                        className={`cursor-pointer hover:bg-muted/50 ${
                          selectedGrupo?.id === grupo.id ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedGrupo(grupo)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge className={`${getGrupoColor(grupo.role)} flex items-center gap-1`}>
                              <IconComponent className="h-3 w-3" />
                              {grupo.nome}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {grupo.descricao}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{grupo.membros} usuário(s)</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div>
          {selectedGrupo ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Detalhes do Grupo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{selectedGrupo.nome}</h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedGrupo.descricao}
                  </p>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-3">Nível de Acesso</h4>
                  <Badge className={`${getGrupoColor(selectedGrupo.role)} flex items-center gap-1 w-fit`}>
                    {(() => {
                      const IconComponent = getGrupoIcon(selectedGrupo.role);
                      return <IconComponent className="h-3 w-3" />;
                    })()}
                    {selectedGrupo.role}
                  </Badge>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Estatísticas</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Membros:</span>
                      <span>{selectedGrupo.membros}</span>
                    </div>
                  </div>
                </div>

                <Button className="w-full" variant="outline">
                  Gerenciar Membros
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
                Selecione um grupo para ver os detalhes
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Grupos;
