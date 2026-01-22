import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Search, UserCog, Crown, User, Eye, Trash2, Shield, ShieldCheck, Mail, Loader2 } from "lucide-react";
import { useUsuarios, usePermissoes } from "@/hooks/useUsuarios";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/contexts/UserContext";

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
      return User;
  }
};

const Usuarios = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const { usuarios, isLoading, error, toggleUsuarioAtivo, updateUsuarioPermissao, deleteUsuario, refetch } = useUsuarios();
  const { permissoes } = usePermissoes();
  const { toast } = useToast();

  const filteredUsuarios = usuarios.filter(
    (usuario) =>
      usuario.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.cpf.includes(searchTerm)
  );

  const handleToggleAtivo = async (userId: number, currentStatus: boolean) => {
    setUpdatingUserId(userId);
    const result = await toggleUsuarioAtivo(userId, !currentStatus);
    setUpdatingUserId(null);
    
    if (result.success) {
      toast({
        title: currentStatus ? "Usuário desativado" : "Usuário ativado",
        description: `Status atualizado com sucesso.`,
      });
    } else {
      toast({
        title: "Erro",
        description: result.error || "Erro ao atualizar status",
        variant: "destructive",
      });
    }
  };

  const handlePermissaoChange = async (userId: number, permissaoId: string) => {
    setUpdatingUserId(userId);
    const result = await updateUsuarioPermissao(userId, parseInt(permissaoId));
    setUpdatingUserId(null);
    
    if (result.success) {
      toast({
        title: "Permissão atualizada",
        description: "Grupo do usuário alterado com sucesso.",
      });
    } else {
      toast({
        title: "Erro",
        description: result.error || "Erro ao atualizar permissão",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUsuario = async (userId: number, userName: string) => {
    const result = await deleteUsuario(userId);
    
    if (result.success) {
      toast({
        title: "Usuário excluído",
        description: `${userName} foi removido do sistema.`,
      });
    } else {
      toast({
        title: "Erro",
        description: result.error || "Erro ao excluir usuário",
        variant: "destructive",
      });
    }
  };

  const totalAtivos = usuarios.filter((u) => u.ativo).length;
  const totalInativos = usuarios.filter((u) => !u.ativo).length;

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
            {isLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <div className="text-3xl font-bold">{usuarios.length}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Usuários Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <div className="text-3xl font-bold text-green-600">{totalAtivos}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Usuários Inativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <div className="text-3xl font-bold text-red-600">{totalInativos}</div>
            )}
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
            {isLoading ? "Carregando..." : `${filteredUsuarios.length} usuário(s) encontrado(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Verificações</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="w-16">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : filteredUsuarios.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    Nenhum usuário encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsuarios.map((usuario) => {
                  const IconComponent = getGrupoIcon(usuario.permissao_nome);
                  const isUpdating = updatingUserId === usuario.user_id;
                  
                  return (
                    <TableRow key={usuario.user_id}>
                      <TableCell className="font-medium">{usuario.nome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {usuario.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {usuario.cpf}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={usuario.permissao_id.toString()}
                          onValueChange={(value) => handlePermissaoChange(usuario.user_id, value)}
                          disabled={isUpdating}
                        >
                          <SelectTrigger className={`w-[140px] h-8 ${getGrupoColor(usuario.permissao_nome)}`}>
                            <div className="flex items-center gap-1">
                              <IconComponent className="h-3 w-3" />
                              <SelectValue />
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            {permissoes.map((perm) => {
                              const PermIcon = getGrupoIcon(perm.nome);
                              return (
                                <SelectItem key={perm.permissao_id} value={perm.permissao_id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <PermIcon className="h-3 w-3" />
                                    {perm.nome}
                                  </div>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Badge 
                            variant="outline" 
                            className={usuario.email_verificado ? "border-green-500 text-green-600" : "border-muted text-muted-foreground"}
                            title={usuario.email_verificado ? "E-mail verificado" : "E-mail não verificado"}
                          >
                            <Mail className="h-3 w-3" />
                          </Badge>
                          <Badge 
                            variant="outline" 
                            className={usuario.totp_enabled ? "border-green-500 text-green-600" : "border-muted text-muted-foreground"}
                            title={usuario.totp_enabled ? "2FA ativo" : "2FA inativo"}
                          >
                            <Shield className="h-3 w-3" />
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={usuario.ativo ? "default" : "secondary"}
                          className={usuario.ativo ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}
                        >
                          {usuario.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={usuario.ativo}
                          onCheckedChange={() => handleToggleAtivo(usuario.user_id, usuario.ativo)}
                          disabled={isUpdating}
                        />
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir usuário?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tem certeza que deseja excluir <strong>{usuario.nome}</strong>? 
                                Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteUsuario(usuario.user_id, usuario.nome)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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
  );
};

export default Usuarios;
