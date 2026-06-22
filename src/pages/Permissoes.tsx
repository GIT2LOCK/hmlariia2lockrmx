import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Role, ROLE_LABELS } from "@/lib/permissions";
import { Loader2, Search, ShieldCheck, Users as UsersIcon, X } from "lucide-react";

interface Usuario {
  id: number;
  nome: string;
  email: string;
  permissao: Role;
  ativo: boolean;
  avatar_url: string | null;
  empresa_id: number | null;
}
interface Empresa { id: number; nome_fantasia: string; }
interface Grupo { id: number; nome: string; }
interface Membership {
  group_id: number;
  role_in_group: "MEMBRO" | "COORDENADOR" | "GESTOR";
  ativo: boolean;
}

// Hierarquia (maior = mais poder). Usuário só pode editar/promover para níveis ESTRITAMENTE menores que o seu.
const ROLE_RANK: Record<Role, number> = {
  SUPERADMIN: 100,
  ADMIN: 80,
  USER: 50,
  CLIENTE: 20,
  VIEWER: 10,
  TV_VIEW: 5,
};

const roleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (role) {
    case "SUPERADMIN": return "destructive";
    case "ADMIN": return "default";
    case "USER": return "secondary";
    case "CLIENTE": return "outline";
    default: return "outline";
  }
};

export default function Permissoes() {
  const { toast } = useToast();
  const { user, canManageUsers } = useUser();

  const myRank = ROLE_RANK[user.role] ?? 0;

  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [memberships, setMemberships] = useState<Record<number, Membership[]>>({});

  const [search, setSearch] = useState("");
  const [filtroPerfil, setFiltroPerfil] = useState<string>("all");
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>("all");
  const [filtroStatus, setFiltroStatus] = useState<string>("all");

  const [editing, setEditing] = useState<Usuario | null>(null);
  const [editPerfil, setEditPerfil] = useState<Role>("USER");
  const [editEmpresa, setEditEmpresa] = useState<string>("");
  const [editAtivo, setEditAtivo] = useState(true);
  const [editGrupo, setEditGrupo] = useState<string>("");
  const [editPapel, setEditPapel] = useState<"MEMBRO" | "COORDENADOR" | "GESTOR">("MEMBRO");
  const [saving, setSaving] = useState(false);

  // Grafana sync foi movida para a aba "Grafana". Esta página agora cuida apenas
  // de perfis, vínculos com empresa e equipes (sem efeitos colaterais no Grafana).



  const [removeTarget, setRemoveTarget] = useState<{ groupId: number; nome: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [u, e, g, m] = await Promise.all([
      supabase.from("usuarios")
        .select("id, nome, email, permissao, ativo, avatar_url, empresa_id")
        .order("nome"),
      supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia"),
      supabase.from("support_groups").select("id, nome").eq("ativo", true).order("nome"),
      supabase.from("support_group_members").select("usuario_id, group_id, role_in_group, ativo"),
    ]);
    setUsuarios((u.data as Usuario[]) || []);
    setEmpresas((e.data as Empresa[]) || []);
    setGrupos((g.data as Grupo[]) || []);
    const map: Record<number, Membership[]> = {};
    ((m.data as any[]) || []).forEach((row) => {
      if (!map[row.usuario_id]) map[row.usuario_id] = [];
      map[row.usuario_id].push(row);
    });
    setMemberships(map);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return usuarios.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        if (!`${u.nome} ${u.email}`.toLowerCase().includes(q)) return false;
      }
      if (filtroPerfil !== "all" && u.permissao !== filtroPerfil) return false;
      if (filtroEmpresa !== "all" && String(u.empresa_id ?? "") !== filtroEmpresa) return false;
      if (filtroStatus === "ativos" && !u.ativo) return false;
      if (filtroStatus === "inativos" && u.ativo) return false;
      return true;
    });
  }, [usuarios, search, filtroPerfil, filtroEmpresa, filtroStatus]);

  // Regra central: pode editar quem está ESTRITAMENTE abaixo do meu nível. Nunca a si mesmo.
  const canEditUser = (target: Usuario) => {
    if (target.id === user.id) return false;
    const targetRank = ROLE_RANK[target.permissao] ?? 0;
    return myRank > targetRank;
  };

  // Perfis que posso atribuir: somente os ESTRITAMENTE abaixo do meu nível.
  const assignableRoles = useMemo<Role[]>(() => {
    return (["ADMIN", "USER", "CLIENTE", "VIEWER"] as Role[])
      .filter((r) => (ROLE_RANK[r] ?? 0) < myRank);
  }, [myRank]);

  const openEdit = (u: Usuario) => {
    setEditing(u);
    setEditPerfil(u.permissao);
    setEditEmpresa(u.empresa_id ? String(u.empresa_id) : "");
    setEditAtivo(u.ativo);
    setEditGrupo("");
    setEditPapel("MEMBRO");
  };

  const handleSave = async () => {
    if (!editing) return;

    // Defesa em profundidade: bloquear promoção para nível >= ao meu
    const newRank = ROLE_RANK[editPerfil] ?? 0;
    if (newRank >= myRank) {
      toast({
        title: "Operação não permitida",
        description: "Você não pode atribuir um perfil de nível igual ou superior ao seu.",
        variant: "destructive",
      });
      return;
    }
    if (editPerfil === "CLIENTE" && !editEmpresa) {
      toast({ title: "Selecione a empresa do cliente", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload: any = {
      permissao: editPerfil,
      ativo: editAtivo,
      empresa_id: editPerfil === "CLIENTE" && editEmpresa ? Number(editEmpresa) : null,
      permissao_manual: true,
    };
    const { error } = await supabase.from("usuarios").update(payload).eq("id", editing.id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Re-read to confirm persistence (RLS, triggers etc. could silently revert)
    const { data: confirm } = await supabase
      .from("usuarios")
      .select("permissao, ativo, empresa_id")
      .eq("id", editing.id)
      .maybeSingle();

    if (
      !confirm ||
      confirm.permissao !== payload.permissao ||
      confirm.ativo !== payload.ativo ||
      (confirm.empresa_id ?? null) !== (payload.empresa_id ?? null)
    ) {
      toast({
        title: "Alteração não persistida",
        description:
          "O banco não confirmou as mudanças. Verifique as políticas RLS / constraints e tente novamente.",
        variant: "destructive",
      });
      setSaving(false);
      load();
      return;
    }

    if (editPerfil !== "CLIENTE" && editGrupo) {
      const existing = (memberships[editing.id] || []).find((m) => m.group_id === Number(editGrupo));
      if (existing) {
        await supabase.from("support_group_members")
          .update({ role_in_group: editPapel, ativo: true })
          .eq("usuario_id", editing.id)
          .eq("group_id", Number(editGrupo));
      } else {
        await supabase.from("support_group_members").insert({
          usuario_id: editing.id,
          group_id: Number(editGrupo),
          role_in_group: editPapel,
          ativo: true,
        } as any);
      }
    }

    // Sincroniza com Grafana — só mostra sucesso se a sync confirmar
    let syncOk = true;
    let syncErrorMsg: string | null = null;
    try {
      const ariiaToken = localStorage.getItem("auth_token");
      const { data: syncData, error: syncErr } = await supabase.functions.invoke(
        "grafana-sync-user",
        {
          body: { usuario_id: editing.id },
          headers: ariiaToken ? { "x-ariia-token": ariiaToken } : undefined,
        },
      );
      if (syncErr || (syncData as any)?.error) {
        syncOk = false;
        syncErrorMsg = syncErr?.message || (syncData as any)?.error || "Falha desconhecida";
      }
    } catch (e: any) {
      syncOk = false;
      syncErrorMsg = e?.message ?? String(e);
    }

    if (syncOk) {
      toast({ title: "Permissões atualizadas e sincronizadas com o Grafana" });
    } else {
      toast({
        title: "Alteração salva no banco, mas Grafana não foi sincronizado",
        description: syncErrorMsg ?? undefined,
        variant: "destructive",
      });
    }
    setEditing(null);
    setSaving(false);
    load();
  };


  const handleRemoveGroup = async () => {
    if (!editing || !removeTarget) return;
    const { error } = await supabase
      .from("support_group_members")
      .delete()
      .eq("usuario_id", editing.id)
      .eq("group_id", removeTarget.groupId);
    if (error) {
      toast({ title: "Erro ao remover do grupo", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Usuário removido do grupo" });
      // Atualiza memberships local sem fechar modal
      setMemberships((prev) => ({
        ...prev,
        [editing.id]: (prev[editing.id] || []).filter((m) => m.group_id !== removeTarget.groupId),
      }));
    }
    setRemoveTarget(null);
  };

  if (!canManageUsers) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-2">
            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground" />
            <h3 className="font-semibold">Acesso negado</h3>
            <p className="text-sm text-muted-foreground">
              Apenas administradores podem gerenciar permissões.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const editingMemberships = editing ? (memberships[editing.id] || []) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="h-6 w-6 text-primary" />
            Controle de Permissões
          </h2>
          <p className="text-muted-foreground">
            Gerencie perfis, equipes, vínculo com empresa e status dos usuários.
          </p>
        </div>
        <Button onClick={handleResyncAll} disabled={syncingAll} variant="outline">
          {syncingAll ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Ressincronizar Grafana (todos)
        </Button>
      </div>


      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[220px]">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filtroPerfil} onValueChange={setFiltroPerfil}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Perfil" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os perfis</SelectItem>
                <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
                <SelectItem value="USER">Técnico / Supervisor</SelectItem>
                <SelectItem value="CLIENTE">Cliente</SelectItem>
                <SelectItem value="VIEWER">Visualizador</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas empresas</SelectItem>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>{e.nome_fantasia}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativos">Ativos</SelectItem>
                <SelectItem value="inativos">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Equipes</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => {
                  const ms = memberships[u.id] || [];
                  const emp = empresas.find((e) => e.id === u.empresa_id);
                  return (
                    <TableRow key={u.id} className={!u.ativo ? "opacity-60" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={u.avatar_url || ""} />
                            <AvatarFallback className="text-xs">{u.nome?.[0]}</AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{u.nome}</span>
                          {u.id === user.id && <Badge variant="outline" className="text-xs">Você</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariant(u.permissao)}>
                          {ROLE_LABELS[u.permissao] || u.permissao}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {ms.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {ms.map((m) => {
                              const g = grupos.find((x) => x.id === m.group_id);
                              return (
                                <Badge key={m.group_id} variant="outline" className="text-xs">
                                  {g?.nome ?? `#${m.group_id}`}
                                  {m.role_in_group !== "MEMBRO" && ` · ${m.role_in_group}`}
                                </Badge>
                              );
                            })}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {u.permissao === "CLIENTE"
                          ? (emp?.nome_fantasia ?? <span className="text-destructive">não vinculado</span>)
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.ativo ? "default" : "secondary"}>
                          {u.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canEditUser(u) ? (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                              Editar
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              title="Ressincronizar com Grafana"
                              onClick={() => handleResyncOne(u)}
                              disabled={syncingId === u.id}
                            >
                              {syncingId === u.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <RefreshCw className="h-4 w-4" />}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      Nenhum usuário encontrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar permissões</DialogTitle>
            <DialogDescription>
              {editing?.nome} · {editing?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Perfil</Label>
              <Select value={editPerfil} onValueChange={(v) => setEditPerfil(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assignableRoles.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Você só pode atribuir perfis abaixo do seu nível.
              </p>
            </div>

            {editPerfil === "CLIENTE" && (
              <div className="space-y-2">
                <Label>Empresa vinculada *</Label>
                <Select value={editEmpresa} onValueChange={setEditEmpresa}>
                  <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                  <SelectContent>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>{e.nome_fantasia}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cliente verá apenas chamados desta empresa.
                </p>
              </div>
            )}

            {editPerfil !== "CLIENTE" && (
              <>
                {editingMemberships.length > 0 && (
                  <div className="space-y-2">
                    <Label>Equipes atuais</Label>
                    <div className="flex flex-wrap gap-2 rounded-md border p-2">
                      {editingMemberships.map((m) => {
                        const g = grupos.find((x) => x.id === m.group_id);
                        return (
                          <Badge key={m.group_id} variant="secondary" className="gap-1 pr-1">
                            <span>
                              {g?.nome ?? `#${m.group_id}`}
                              {m.role_in_group !== "MEMBRO" && ` · ${m.role_in_group}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => setRemoveTarget({ groupId: m.group_id, nome: g?.nome ?? `#${m.group_id}` })}
                              className="ml-1 rounded-sm hover:bg-destructive/20 p-0.5"
                              aria-label={`Remover de ${g?.nome ?? "grupo"}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2 col-span-2">
                    <Label>Adicionar a equipe</Label>
                    <Select value={editGrupo} onValueChange={setEditGrupo}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma equipe (opcional)" /></SelectTrigger>
                      <SelectContent>
                        {grupos
                          .filter((g) => !editingMemberships.some((m) => m.group_id === g.id))
                          .map((g) => (
                            <SelectItem key={g.id} value={String(g.id)}>{g.nome}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {editGrupo && (
                    <div className="space-y-2 col-span-2">
                      <Label>Papel na equipe</Label>
                      <Select value={editPapel} onValueChange={(v) => setEditPapel(v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEMBRO">Técnico (Membro)</SelectItem>
                          <SelectItem value="COORDENADOR">Supervisor (Coordenador)</SelectItem>
                          <SelectItem value="GESTOR">Gestor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Usuário ativo</Label>
                <p className="text-xs text-muted-foreground">Desative para bloquear o acesso.</p>
              </div>
              <Switch checked={editAtivo} onCheckedChange={setEditAtivo} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover do grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{editing?.nome}</strong> do grupo{" "}
              <strong>{removeTarget?.nome}</strong>? O usuário e o grupo continuam existindo —
              apenas o vínculo será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveGroup} className="bg-destructive hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
