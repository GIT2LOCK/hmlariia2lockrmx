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
import { Plus, Search, UsersRound, Pencil, Trash2, Shield } from "lucide-react";

const mockGrupos = [
  {
    id: 1,
    nome: "Administradores",
    descricao: "Acesso total ao sistema",
    membros: 2,
    permissoes: ["Criar", "Editar", "Excluir", "Visualizar"],
  },
  {
    id: 2,
    nome: "Contadores",
    descricao: "Acesso às demandas e relatórios",
    membros: 5,
    permissoes: ["Editar", "Visualizar"],
  },
  {
    id: 3,
    nome: "Assistentes",
    descricao: "Acesso limitado às demandas",
    membros: 8,
    permissoes: ["Visualizar"],
  },
  {
    id: 4,
    nome: "Financeiro",
    descricao: "Acesso aos relatórios financeiros",
    membros: 3,
    permissoes: ["Visualizar", "Exportar"],
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
                  {filteredGrupos.map((grupo) => (
                    <TableRow
                      key={grupo.id}
                      className={`cursor-pointer hover:bg-muted/50 ${
                        selectedGrupo?.id === grupo.id ? "bg-muted" : ""
                      }`}
                      onClick={() => setSelectedGrupo(grupo)}
                    >
                      <TableCell className="font-medium">{grupo.nome}</TableCell>
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
                  ))}
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
                  <h4 className="font-medium mb-3">Permissões</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedGrupo.permissoes.map((permissao, index) => (
                      <Badge key={index} variant="outline">
                        {permissao}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Estatísticas</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Membros:</span>
                      <span>{selectedGrupo.membros}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Permissões:</span>
                      <span>{selectedGrupo.permissoes.length}</span>
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
