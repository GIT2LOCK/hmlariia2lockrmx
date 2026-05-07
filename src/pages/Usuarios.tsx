import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser, UserRole } from "@/contexts/UserContext";
import { Search, Shield, Users as UsersIcon, Loader2, KeyRound, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Usuario {
  id: number;
  nome: string;
  email: string;
  permissao: string;
  ativo: boolean;
  avatar_url: string | null;
  criado_em: string | null;
  zabbix_token_z1: string | null;
  zabbix_token_z2: string | null;
}

type TokenStatus = "idle" | "testing" | "ok" | "fail" | "missing";
interface TestResult {
  z1: TokenStatus;
  z2: TokenStatus;
  z1Error?: string;
  z2Error?: string;
}

const roleLabels: Record<string, string> = {
  SUPERADMIN: "Super Administrador",
  ADMIN: "Administrador",
  USER: "Usuário",
  VIEWER: "Visualizador",
};

const roleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (role) {
    case "SUPERADMIN": return "destructive";
    case "ADMIN": return "default";
    case "USER": return "secondary";
    default: return "outline";
  }
};

const Usuarios = () => {
  const { toast } = useToast();
  const { user, hasFullAccess } = useUser();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("usuarios")
      .select("id, nome, email, permissao, ativo, avatar_url, criado_em")
      .order("nome");
    setUsuarios((data as Usuario[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = usuarios.filter((u) =>
    [u.nome, u.email, u.permissao].some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const canEditUser = (targetUser: Usuario): boolean => {
    // SUPERADMIN can edit everyone
    if (hasFullAccess) return true;
    // ADMIN cannot edit SUPERADMIN or other ADMINs
    if (targetUser.permissao === "SUPERADMIN" || targetUser.permissao === "ADMIN") return false;
    // ADMIN can edit USER and VIEWER
    return true;
  };

  const getAvailableRoles = (targetUser: Usuario): UserRole[] => {
    // SUPERADMIN can assign any role
    if (hasFullAccess) return ["SUPERADMIN", "ADMIN", "USER", "VIEWER"];
    // ADMIN can only assign USER and VIEWER
    return ["USER", "VIEWER"];
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("usuarios")
      .update({ permissao: newRole })
      .eq("id", userId);

    if (error) {
      toast({ title: "Erro ao atualizar permissão", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Permissão atualizada com sucesso!" });
      setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, permissao: newRole } : u));
    }
    setEditingId(null);
    setSaving(false);
  };

  const handleToggleActive = async (userId: number, currentActive: boolean) => {
    const targetUser = usuarios.find(u => u.id === userId);
    if (!targetUser || !canEditUser(targetUser)) return;

    const { error } = await supabase
      .from("usuarios")
      .update({ ativo: !currentActive })
      .eq("id", userId);

    if (error) {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    } else {
      toast({ title: !currentActive ? "Usuário ativado" : "Usuário desativado" });
      setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, ativo: !currentActive } : u));
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Usuários</h2>
          <p className="text-muted-foreground">Gerencie os usuários e suas permissões</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar usuário..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Permissão</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Desde</TableHead>
                  <TableHead className="w-32">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const editable = canEditUser(u);
                  const isCurrentUser = u.id === user.id;
                  const availableRoles = getAvailableRoles(u);

                  return (
                    <TableRow key={u.id} className={!u.ativo ? "opacity-50" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={u.avatar_url || ""} />
                            <AvatarFallback className="text-xs">{u.nome?.[0]}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{u.nome}</span>
                          {isCurrentUser && <Badge variant="outline" className="text-xs">Você</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell>
                        {editingId === u.id ? (
                          <Select
                            defaultValue={u.permissao}
                            onValueChange={(v) => handleRoleChange(u.id, v)}
                            disabled={saving}
                          >
                            <SelectTrigger className="w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {availableRoles.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {roleLabels[role] || role}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={roleBadgeVariant(u.permissao)}>
                            {roleLabels[u.permissao] || u.permissao}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.ativo ? "default" : "secondary"}>
                          {u.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(u.criado_em)}</TableCell>
                      <TableCell>
                        {editable && !isCurrentUser && (
                          <div className="flex gap-1">
                            {editingId === u.id ? (
                              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                Cancelar
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setEditingId(u.id)} className="gap-1">
                                  <Shield className="h-3 w-3" /> Cargo
                                </Button>
                                <Button
                                  size="sm"
                                  variant={u.ativo ? "ghost" : "outline"}
                                  onClick={() => handleToggleActive(u.id, u.ativo)}
                                  className="text-xs"
                                >
                                  {u.ativo ? "Desativar" : "Ativar"}
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Usuarios;
