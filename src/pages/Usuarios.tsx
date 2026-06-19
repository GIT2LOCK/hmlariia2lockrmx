import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser, UserRole } from "@/contexts/UserContext";
import { Search, Shield, Users as UsersIcon, Loader2, KeyRound, CheckCircle2, XCircle, MinusCircle, Trash2, LayoutGrid } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserTabPermissionsDialog } from "@/components/UserTabPermissionsDialog";

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
  CLIENTE: "Cliente",
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
  const [results, setResults] = useState<Record<number, TestResult>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [tabsTarget, setTabsTarget] = useState<Usuario | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const ariiaToken = localStorage.getItem("auth_token");
      const { data, error } = await supabase.functions.invoke("delete-usuario", {
        body: { usuario_id: deleteTarget.id },
        headers: ariiaToken ? { "x-ariia-token": ariiaToken } : undefined,
      });
      const steps = (data as any)?.steps as Record<string, { ok: boolean; error?: string }> | undefined;

      if (error || (data as any)?.error) {
        const detail = steps
          ? Object.entries(steps)
              .filter(([, v]) => !v.ok)
              .map(([k, v]) => `${k}: ${v.error}`)
              .join(" · ")
          : (error?.message ?? (data as any)?.error);
        toast({ title: "Falha ao excluir usuário", description: detail, variant: "destructive" });
        return;
      }

      const allOk = steps ? Object.values(steps).every((s) => s.ok) : true;
      if (!allOk && steps) {
        const detail = Object.entries(steps)
          .filter(([, v]) => !v.ok)
          .map(([k, v]) => `${k}: ${v.error}`)
          .join(" · ");
        toast({
          title: "Usuário excluído parcialmente",
          description: `Algumas etapas falharam — ${detail}`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Usuário excluído com sucesso" });
      }

      // Refresh from DB instead of optimistic removal
      await load();
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: "Erro inesperado", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("usuarios")
      .select("id, nome, email, permissao, ativo, avatar_url, criado_em, zabbix_token_z1, zabbix_token_z2")
      .order("nome");
    const list = (data as Usuario[]) || [];
    setUsuarios(list);
    const init: Record<number, TestResult> = {};
    list.forEach((u) => {
      init[u.id] = {
        z1: u.zabbix_token_z1?.trim() ? "idle" : "missing",
        z2: u.zabbix_token_z2?.trim() ? "idle" : "missing",
      };
    });
    setResults(init);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const testToken = async (userId: number, source: "z1" | "z2", token: string | null) => {
    if (!token?.trim()) {
      setResults((r) => ({ ...r, [userId]: { ...r[userId], [source]: "missing" } }));
      return;
    }
    setResults((r) => ({ ...r, [userId]: { ...r[userId], [source]: "testing" } }));
    try {
      const { data, error } = await supabase.functions.invoke("zabbix-dashboard", {
        body: { action: "test_token", token, source },
      });
      if (error) throw error;
      const ok = (data as any)?.ok;
      setResults((r) => ({
        ...r,
        [userId]: {
          ...r[userId],
          [source]: ok ? "ok" : "fail",
          [`${source}Error`]: ok ? undefined : (data as any)?.error,
        } as TestResult,
      }));
    } catch (e: any) {
      setResults((r) => ({
        ...r,
        [userId]: { ...r[userId], [source]: "fail", [`${source}Error`]: e?.message } as TestResult,
      }));
    }
  };

  const testAll = async () => {
    setTestingAll(true);
    await Promise.all(
      usuarios.flatMap((u) => [
        testToken(u.id, "z1", u.zabbix_token_z1),
        testToken(u.id, "z2", u.zabbix_token_z2),
      ])
    );
    setTestingAll(false);
    toast({ title: "Teste de tokens concluído" });
  };

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
    // SUPERADMIN can assign any role (inclui CLIENTE)
    if (hasFullAccess) return ["SUPERADMIN", "ADMIN", "USER", "VIEWER", "CLIENTE"] as any;
    // ADMIN can only assign USER, VIEWER, CLIENTE
    return ["USER", "VIEWER", "CLIENTE"] as any;
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    setSaving(true);
    // Re-read primeiro para garantir que o usuário existe (corrige "banco ainda não reconheceu")
    const { data: fresh } = await supabase.from("usuarios").select("id").eq("id", userId).maybeSingle();
    if (!fresh) {
      await load();
      toast({ title: "Usuário não encontrado", description: "Atualizando lista…", variant: "destructive" });
      setSaving(false); setEditingId(null); return;
    }

    const { data, error } = await supabase
      .from("usuarios")
      .update({ permissao: newRole, permissao_manual: true })
      .eq("id", userId)
      .select("id, nome, email, permissao, ativo, avatar_url, criado_em, zabbix_token_z1, zabbix_token_z2")
      .single();

    if (error) {
      toast({ title: "Erro ao atualizar permissão", description: error.message, variant: "destructive" });
    } else if (data) {
      toast({ title: "Permissão atualizada com sucesso!" });
      setUsuarios(prev => prev.map(u => u.id === userId ? (data as any) : u));
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

  const renderTokenBadge = (status: TokenStatus, label: string, error?: string) => {
    const base = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border";
    let cls = "";
    let Icon = MinusCircle;
    let text = label;
    if (status === "ok") { cls = "bg-primary/10 text-primary border-primary/30"; Icon = CheckCircle2; }
    else if (status === "fail") { cls = "bg-destructive/10 text-destructive border-destructive/30"; Icon = XCircle; }
    else if (status === "testing") { cls = "bg-muted text-muted-foreground border-border"; Icon = Loader2; }
    else if (status === "missing") { cls = "bg-muted/50 text-muted-foreground border-border"; Icon = MinusCircle; }
    else { cls = "bg-muted/50 text-muted-foreground border-border"; Icon = KeyRound; }
    const node = (
      <span className={`${base} ${cls}`}>
        <Icon className={`h-3 w-3 ${status === "testing" ? "animate-spin" : ""}`} />
        {text}
      </span>
    );
    if (status === "fail" && error) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{node}</TooltipTrigger>
            <TooltipContent className="max-w-xs">{error}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    return node;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Usuários</h2>
          <p className="text-muted-foreground">Gerencie os usuários e suas permissões</p>
        </div>
        <Button onClick={testAll} disabled={testingAll || loading} className="gap-2">
          {testingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Testar tokens Zabbix
        </Button>
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
                  <TableHead>Tokens Zabbix</TableHead>
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
                        <div className="flex flex-col gap-1">
                          {renderTokenBadge(results[u.id]?.z1 ?? "missing", "Z1 Brava", results[u.id]?.z1Error)}
                          {renderTokenBadge(results[u.id]?.z2 ?? "missing", "Z2 2lock", results[u.id]?.z2Error)}
                        </div>
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
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setTabsTarget(u)}
                                  title="Abas permitidas"
                                  className="gap-1"
                                >
                                  <LayoutGrid className="h-3 w-3" /> Abas
                                </Button>
                                {hasFullAccess && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setDeleteTarget(u)}
                                    title="Excluir usuário"
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
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
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.nome}</strong> ({deleteTarget?.email})?
              Esta ação é permanente e remove o usuário, seus vínculos com equipes e suas permissões do Grafana.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UserTabPermissionsDialog
        open={!!tabsTarget}
        onClose={() => setTabsTarget(null)}
        usuario={tabsTarget}
      />
    </div>
  );
};

export default Usuarios;
