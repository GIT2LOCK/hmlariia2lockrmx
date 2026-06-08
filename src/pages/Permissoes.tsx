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
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Role, ROLE_LABELS } from "@/lib/permissions";
import { Loader2, Search, ShieldCheck, Users as UsersIcon } from "lucide-react";

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

const ROLES_EDITAVEIS: Role[] = ["ADMIN", "USER", "CLIENTE", "VIEWER"];

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
  const { user, hasFullAccess, canManageUsers } = useUser();

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

  const canEditUser = (target: Usuario) => {
    if (target.id === user.id) return false;
    if (hasFullAccess) return true;
    return target.permissao !== "SUPERADMIN" && target.permissao !== "ADMIN";
  };

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
    setSaving(true);
    const payload: any = {
      permissao: editPerfil,
      ativo: editAtivo,
      empresa_id: editPerfil === "CLIENTE" && editEmpresa ? Number(editEmpresa) : null,
    };
    const { error } = await supabase.from("usuarios").update(payload).eq("id", editing.id);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // adicionar a grupo (se informado e não-CLIENTE)
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

    toast({ title: "Permissões atualizadas com sucesso" });
    setEditing(null);
    setSaving(false);
    load();
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
                        {canEditUser(u) && (
                          <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                            Editar
                          </Button>
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
                  {ROLES_EDITAVEIS.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editPerfil === "CLIENTE" && (
              <div className="space-y-2">
                <Label>Empresa vinculada</Label>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2 col-span-2">
                  <Label>Adicionar a equipe</Label>
                  <Select value={editGrupo} onValueChange={setEditGrupo}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma equipe (opcional)" /></SelectTrigger>
                    <SelectContent>
                      {grupos.map((g) => (
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
    </div>
  );
}
