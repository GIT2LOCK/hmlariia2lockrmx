import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, UsersRound, Shield, Crown, UserCog, User, Eye, Users } from "lucide-react";
import { usePermissoes, useUsuarios } from "@/hooks/useUsuarios";
import { UserRole } from "@/contexts/UserContext";

const getGrupoIcon = (role: string) => {
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

const getGrupoColor = (role: string) => {
  switch (role) {
    case "SUPERADMIN":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300";
    case "ADMIN":
      return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
    case "USER":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
    case "VIEWER":
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    default:
      return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
  }
};

const Grupos = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGrupo, setSelectedGrupo] = useState<number | null>(null);
  const { permissoes, isLoading, error, refetch } = usePermissoes();
  const { usuarios } = useUsuarios();

  const filteredGrupos = permissoes.filter((grupo) =>
    grupo.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedPermissao = permissoes.find(p => p.permissao_id === selectedGrupo);
  const membrosDoGrupo = usuarios.filter(u => u.permissao_id === selectedGrupo);

  if (error) {
    return (
      <div className="space-y-6">
        <Card className="border-destructive">
          <CardContent className="flex flex-col items-center justify-center py-10">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={refetch}>Tentar novamente</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Grupos</h2>
          <p className="text-muted-foreground">
            Gerenciar grupos de usuários e permissões
          </p>
        </div>
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
                {isLoading ? "Carregando..." : `${filteredGrupos.length} grupo(s) encontrado(s)`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Membros</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-6 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    filteredGrupos.map((grupo) => {
                      const IconComponent = getGrupoIcon(grupo.nome);
                      return (
                        <TableRow
                          key={grupo.permissao_id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            selectedGrupo === grupo.permissao_id ? "bg-muted" : ""
                          }`}
                          onClick={() => setSelectedGrupo(grupo.permissao_id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge className={`${getGrupoColor(grupo.nome)} flex items-center gap-1`}>
                                <IconComponent className="h-3 w-3" />
                                {grupo.nome}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {grupo.descricao || "Sem descrição"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="flex items-center gap-1 w-fit">
                              <Users className="h-3 w-3" />
                              {grupo.membros} usuário(s)
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div>
          {selectedPermissao ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Detalhes do Grupo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {(() => {
                      const IconComponent = getGrupoIcon(selectedPermissao.nome);
                      return (
                        <Badge className={`${getGrupoColor(selectedPermissao.nome)} flex items-center gap-1`}>
                          <IconComponent className="h-4 w-4" />
                          {selectedPermissao.nome}
                        </Badge>
                      );
                    })()}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selectedPermissao.descricao || "Sem descrição"}
                  </p>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Estatísticas</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Membros:</span>
                      <span className="font-medium">{selectedPermissao.membros}</span>
                    </div>
                  </div>
                </div>

                {membrosDoGrupo.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3">Membros do Grupo</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {membrosDoGrupo.map((membro) => (
                        <div 
                          key={membro.user_id} 
                          className="flex items-center justify-between p-2 bg-muted/50 rounded-md"
                        >
                          <div>
                            <p className="text-sm font-medium">{membro.nome}</p>
                            <p className="text-xs text-muted-foreground">{membro.email}</p>
                          </div>
                          <Badge 
                            variant={membro.ativo ? "default" : "secondary"}
                            className={membro.ativo ? "bg-green-100 text-green-700 text-xs" : "text-xs"}
                          >
                            {membro.ativo ? "Ativo" : "Inativo"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
