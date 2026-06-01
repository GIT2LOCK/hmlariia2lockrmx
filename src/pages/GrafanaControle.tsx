import { Fragment, useEffect, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Plus, Trash2, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";
import { getAuthToken } from "@/services/authService";
import { AutomationsTab } from "@/components/grafana/AutomationsTab";

type Role = "None" | "Viewer" | "Editor" | "Admin";
const ROLES: Role[] = ["None", "Viewer", "Editor", "Admin"];

interface Org { id: number; grafana_org_id: number; name: string; active: boolean; synced_at: string | null; }
interface Usuario { id: number; nome: string; email: string; permissao: string; ativo: boolean; }
interface Group { id: number; name: string; description: string | null; active: boolean; }
interface SyncLog { id: number; usuario_id: number | null; action: string; status: string; error_message: string | null; criado_em: string; }

async function invokeGrafanaFunction<T = unknown>(
  fn: string,
  options: { body?: unknown; method?: "GET" | "POST"; query?: Record<string, string | number> } = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || getAuthToken();
  if (!token) throw new Error("Sessão expirada. Faça login novamente.");

  const search = new URLSearchParams();
  Object.entries(options.query || {}).forEach(([key, value]) => search.set(key, String(value)));
  const params = search.size ? `?${search.toString()}` : "";
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}${params}`,
    {
      method: options.method || "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: options.method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    },
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Edge Function falhou (${res.status})`);
  return json as T;
}

export default function GrafanaControle() {
  const { canManageUsers, isLoading } = useUser();
  if (isLoading) return null;
  if (!canManageUsers) return <Navigate to="/dashboard" replace />;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" /> Controle Grafana
        </h1>
        <p className="text-muted-foreground">Gestão centralizada de acesso ao Grafana via Ariia.</p>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="orgs">Organizações</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
          <TabsTrigger value="automations">Automações</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="orgs"><OrgsTab /></TabsContent>
        <TabsContent value="groups"><GroupsTab /></TabsContent>
        <TabsContent value="automations"><AutomationsTab /></TabsContent>
        <TabsContent value="logs"><LogsTab /></TabsContent>
      </Tabs>
    </div>
  );
}



// -------------------- Organizações --------------------
function OrgsTab() {
  const { toast } = useToast();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [orgUsers, setOrgUsers] = useState<Record<number, Array<{ id: number; nome: string; email: string; role: Role; source: "direct" | "group"; groupName?: string }>>>({});
  const [loadingUsers, setLoadingUsers] = useState<number | null>(null);

  const load = async () => {
    const { data } = await supabase.from("grafana_organizations").select("*").eq("active", true).order("name");
    setOrgs((data as Org[]) || []);
  };
  useEffect(() => { load(); }, []);

  const sync = async () => {
    setBusy(true);
    try {
      await invokeGrafanaFunction("grafana-sync-organizations");
      toast({ title: "Organizações sincronizadas" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const loadOrgUsers = async (orgId: number) => {
    setLoadingUsers(orgId);
    try {
      const rank: Record<string, number> = { None: 0, Viewer: 1, Editor: 2, Admin: 3 };

      const [directRes, groupPermRes, usuariosRes, superRes] = await Promise.all([
        supabase.from("grafana_user_org_permissions").select("usuario_id, role, enabled").eq("grafana_organization_id", orgId),
        supabase.from("grafana_group_org_permissions").select("group_id, role, grafana_access_groups(name)").eq("grafana_organization_id", orgId),
        supabase.from("usuarios").select("id, nome, email, permissao, ativo").eq("ativo", true).order("nome"),
        supabase.from("usuarios").select("id, nome, email").eq("ativo", true).eq("permissao", "SUPERADMIN"),
      ]);

      const usuariosMap = new Map((usuariosRes.data || []).map((u: any) => [u.id, u]));
      const merged = new Map<number, { id: number; nome: string; email: string; role: Role; source: "direct" | "group"; groupName?: string }>();

      // SUPERADMINs (acesso total automático)
      for (const s of (superRes.data || []) as any[]) {
        merged.set(s.id, { id: s.id, nome: s.nome, email: s.email, role: "Admin", source: "direct" });
      }

      // Direct perms
      for (const p of (directRes.data || []) as any[]) {
        if (!p.enabled || p.role === "None") continue;
        const u = usuariosMap.get(p.usuario_id);
        if (!u) continue;
        const existing = merged.get(p.usuario_id);
        if (!existing || rank[p.role] > rank[existing.role]) {
          merged.set(p.usuario_id, { id: u.id, nome: u.nome, email: u.email, role: p.role as Role, source: "direct" });
        }
      }

      // Group perms — resolve members
      const groupRows = (groupPermRes.data || []) as any[];
      if (groupRows.length) {
        const groupIds = groupRows.map((g) => g.group_id);
        const { data: membersData } = await supabase
          .from("grafana_access_group_members")
          .select("group_id, usuario_id")
          .in("group_id", groupIds);
        const byGroup = new Map<number, number[]>();
        for (const m of (membersData || []) as any[]) {
          if (!byGroup.has(m.group_id)) byGroup.set(m.group_id, []);
          byGroup.get(m.group_id)!.push(m.usuario_id);
        }
        for (const gp of groupRows) {
          const userIds = byGroup.get(gp.group_id) || [];
          for (const uid of userIds) {
            const u = usuariosMap.get(uid);
            if (!u) continue;
            const existing = merged.get(uid);
            if (!existing || rank[gp.role] > rank[existing.role]) {
              merged.set(uid, {
                id: u.id, nome: u.nome, email: u.email,
                role: gp.role as Role, source: "group",
                groupName: gp.grafana_access_groups?.name,
              });
            }
          }
        }
      }

      setOrgUsers((prev) => ({ ...prev, [orgId]: Array.from(merged.values()).sort((a, b) => a.nome.localeCompare(b.nome)) }));
    } finally {
      setLoadingUsers(null);
    }
  };

  const toggleExpand = (orgId: number) => {
    if (expanded === orgId) { setExpanded(null); return; }
    setExpanded(orgId);
    if (!orgUsers[orgId]) loadOrgUsers(orgId);
  };

  return (
    <div className="space-y-4 mt-4">
      <Button onClick={sync} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Sincronizar do Grafana
      </Button>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>ID Grafana</TableHead><TableHead>Nome</TableHead>
                <TableHead>Status</TableHead><TableHead>Última sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map(o => {
                const isOpen = expanded === o.id;
                const users = orgUsers[o.id];
                return (
                  <Fragment key={o.id}>
                    <TableRow key={o.id} className="cursor-pointer hover:bg-accent/50" onClick={() => toggleExpand(o.id)}>
                      <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-mono">{o.grafana_org_id}</TableCell>
                      <TableCell>{o.name}</TableCell>
                      <TableCell>{o.active ? <Badge>Ativa</Badge> : <Badge variant="outline">Inativa</Badge>}</TableCell>
                      <TableCell className="text-xs">{o.synced_at ? new Date(o.synced_at).toLocaleString() : "—"}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`${o.id}-detail`}>
                        <TableCell colSpan={5} className="bg-muted/30">
                          {loadingUsers === o.id ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                              <Loader2 className="h-4 w-4 animate-spin" /> Carregando usuários…
                            </div>
                          ) : !users || users.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">Nenhum usuário com acesso a esta organização.</p>
                          ) : (
                            <div className="py-2">
                              <div className="text-xs text-muted-foreground mb-2">{users.length} usuário(s) com acesso</div>
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Origem</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {users.map((u) => (
                                    <TableRow key={u.id}>
                                      <TableCell>{u.nome}</TableCell>
                                      <TableCell className="text-sm">{u.email}</TableCell>
                                      <TableCell><Badge>{u.role}</Badge></TableCell>
                                      <TableCell className="text-xs text-muted-foreground">
                                        {u.source === "group" ? `Grupo: ${u.groupName || "—"}` : "Direto"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
              {orgs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma organização. Clique em "Sincronizar do Grafana".</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------- Grupos --------------------
function GroupsTab() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<number[]>([]);
  const [initialMembers, setInitialMembers] = useState<number[]>([]);
  const [groupPerms, setGroupPerms] = useState<Record<number, Role>>({});
  const [initialPerms, setInitialPerms] = useState<Record<number, Role>>({});
  const [open, setOpen] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: "", description: "" });
  const [memberSearch, setMemberSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [g, u, o] = await Promise.all([
      supabase.from("grafana_access_groups").select("*").order("name"),
      supabase.from("usuarios").select("id, nome, email, permissao, ativo").eq("ativo", true).order("nome"),
      supabase.from("grafana_organizations").select("*").eq("active", true).order("name"),
    ]);
    setGroups((g.data as Group[]) || []);
    setUsuarios((u.data as Usuario[]) || []);
    setOrgs((o.data as Org[]) || []);
  };
  useEffect(() => { load(); }, []);

  const openGroup = async (g: Group) => {
    setSelectedGroup(g);
    setMemberSearch("");
    const [m, p] = await Promise.all([
      supabase.from("grafana_access_group_members").select("usuario_id").eq("group_id", g.id),
      supabase.from("grafana_group_org_permissions").select("grafana_organization_id, role").eq("group_id", g.id),
    ]);
    const ms = (m.data || []).map((x: any) => x.usuario_id);
    setMembers(ms);
    setInitialMembers(ms);
    const map: Record<number, Role> = {};
    (p.data || []).forEach((x: any) => { map[x.grafana_organization_id] = x.role as Role; });
    setGroupPerms(map);
    setInitialPerms(map);
  };

  const createGroup = async () => {
    if (!newGroup.name.trim()) return;
    const { error } = await supabase.from("grafana_access_groups").insert({ name: newGroup.name, description: newGroup.description });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    setOpen(false);
    setNewGroup({ name: "", description: "" });
    await load();
  };

  const toggleMember = (userId: number, on: boolean) => {
    setMembers((prev) => on ? [...prev, userId] : prev.filter((m) => m !== userId));
  };

  const setOrgRole = (orgId: number, role: Role) => {
    setGroupPerms((prev) => {
      const next = { ...prev };
      if (role === "None") delete next[orgId];
      else next[orgId] = role;
      return next;
    });
  };

  const isDirty = (() => {
    if (members.length !== initialMembers.length) return true;
    const im = new Set(initialMembers);
    for (const id of members) if (!im.has(id)) return true;
    const allOrgIds = new Set([...Object.keys(groupPerms), ...Object.keys(initialPerms)]);
    for (const k of allOrgIds) {
      if ((groupPerms[Number(k)] || "None") !== (initialPerms[Number(k)] || "None")) return true;
    }
    return false;
  })();

  const saveGroup = async () => {
    if (!selectedGroup) return;
    setSaving(true);
    try {
      const im = new Set(initialMembers);
      const cm = new Set(members);
      const toAdd = members.filter((id) => !im.has(id));
      const toRemove = initialMembers.filter((id) => !cm.has(id));

      const ops: Array<Promise<any>> = [];
      if (toAdd.length) {
        ops.push(
          Promise.resolve(supabase.from("grafana_access_group_members").insert(
            toAdd.map((uid) => ({ group_id: selectedGroup.id, usuario_id: uid })),
          )),
        );
      }
      if (toRemove.length) {
        ops.push(
          Promise.resolve(supabase.from("grafana_access_group_members")
            .delete()
            .eq("group_id", selectedGroup.id)
            .in("usuario_id", toRemove)),
        );
      }

      const allOrgIds = new Set([...Object.keys(groupPerms), ...Object.keys(initialPerms)].map(Number));
      const upserts: Array<{ group_id: number; grafana_organization_id: number; role: Role; atualizado_em: string }> = [];
      const deletes: number[] = [];
      for (const oid of allOrgIds) {
        const next = groupPerms[oid] || "None";
        const prev = initialPerms[oid] || "None";
        if (next === prev) continue;
        if (next === "None") deletes.push(oid);
        else upserts.push({ group_id: selectedGroup.id, grafana_organization_id: oid, role: next, atualizado_em: new Date().toISOString() });
      }
      if (upserts.length) {
        ops.push(Promise.resolve(supabase.from("grafana_group_org_permissions").upsert(upserts, { onConflict: "group_id,grafana_organization_id" })));
      }
      if (deletes.length) {
        ops.push(
          Promise.resolve(supabase.from("grafana_group_org_permissions")
            .delete()
            .eq("group_id", selectedGroup.id)
            .in("grafana_organization_id", deletes)),
        );
      }

      const results = await Promise.all(ops);
      const failed = results.find((r: any) => r?.error);
      if (failed) throw new Error((failed as any).error.message);

      // Sync affected users (current members ∪ removed members) so Grafana reflects changes
      const affected = Array.from(new Set([...members, ...toRemove]));
      if (affected.length) {
        await Promise.all(
          affected.map((uid) =>
            invokeGrafanaFunction("grafana-sync-user", { body: { usuario_id: uid } }).catch(() => null),
          ),
        );
      }

      setInitialMembers(members);
      setInitialPerms(groupPerms);
      toast({ title: "Grupo salvo", description: `${affected.length} usuário(s) sincronizado(s) com o Grafana.` });
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteGroup = async (id: number) => {
    if (!confirm("Excluir grupo?")) return;
    await supabase.from("grafana_access_groups").delete().eq("id", id);
    setSelectedGroup(null);
    await load();
  };

  const filteredUsuarios = usuarios.filter((u) => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return true;
    return u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4 mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Grupos</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /></Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo grupo</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={newGroup.name} onChange={e => setNewGroup({ ...newGroup, name: e.target.value })} /></div>
                <div><Label>Descrição</Label><Textarea value={newGroup.description} onChange={e => setNewGroup({ ...newGroup, description: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={createGroup}>Criar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-1">
          {groups.map(g => (
            <button key={g.id} onClick={() => openGroup(g)}
              className={`w-full text-left p-2 rounded hover:bg-accent ${selectedGroup?.id === g.id ? "bg-accent" : ""}`}>
              <div className="font-medium">{g.name}</div>
              {g.description && <div className="text-xs text-muted-foreground">{g.description}</div>}
            </button>
          ))}
          {groups.length === 0 && <p className="text-sm text-muted-foreground">Nenhum grupo.</p>}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {selectedGroup ? selectedGroup.name : "Selecione um grupo"}
            {selectedGroup && isDirty && <span className="ml-2 text-xs text-amber-600">• alterações não salvas</span>}
          </CardTitle>
          {selectedGroup && <Button size="sm" variant="ghost" onClick={() => deleteGroup(selectedGroup.id)}><Trash2 className="h-4 w-4" /></Button>}
        </CardHeader>
        <CardContent className="space-y-6">
          {selectedGroup ? (
            <>
              <section>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h3 className="font-semibold">Membros <span className="text-xs text-muted-foreground font-normal">({members.length})</span></h3>
                  <Input
                    placeholder="Buscar usuário…"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    className="h-8 w-56"
                  />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1 border rounded p-2">
                  {filteredUsuarios.map(u => (
                    <label key={u.id} className="flex items-center justify-between gap-2 p-1 hover:bg-accent rounded cursor-pointer">
                      <span className="text-sm">{u.nome} <span className="text-muted-foreground">({u.email})</span></span>
                      <Switch checked={members.includes(u.id)} onCheckedChange={(v) => toggleMember(u.id, v)} />
                    </label>
                  ))}
                  {filteredUsuarios.length === 0 && <p className="text-sm text-muted-foreground p-2">Nenhum usuário.</p>}
                </div>
              </section>
              <section>
                <h3 className="font-semibold mb-2">Permissões por organização</h3>
                <div className="space-y-2 max-h-72 overflow-y-auto border rounded p-2">
                  {orgs.map(o => (
                    <div key={o.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm">{o.name}</span>
                      <Select value={groupPerms[o.id] || "None"} onValueChange={(v) => setOrgRole(o.id, v as Role)}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  ))}
                  {orgs.length === 0 && <p className="text-sm text-muted-foreground">Sincronize organizações primeiro.</p>}
                </div>
              </section>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  variant="ghost"
                  onClick={() => { setMembers(initialMembers); setGroupPerms(initialPerms); }}
                  disabled={!isDirty || saving}
                >
                  Descartar
                </Button>
                <Button onClick={saveGroup} disabled={!isDirty || saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Salvar e sincronizar
                </Button>
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">Escolha um grupo à esquerda.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// -------------------- Usuários --------------------
function UsersTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [permsModal, setPermsModal] = useState<{ user: Usuario; perms: any } | null>(null);
  const [editor, setEditor] = useState<{
    user: Usuario;
    roles: Record<number, Role>;
    initial: Record<number, Role>;
    groupRoles: Record<number, Role>;
    saving: boolean;
  } | null>(null);

  const load = async () => {
    const [usersRes, linksRes, orgsRes] = await Promise.all([
      supabase.from("usuarios").select("id, nome, email, permissao, ativo").order("nome"),
      supabase.from("grafana_user_links").select("*"),
      supabase.from("grafana_organizations").select("*").eq("active", true).order("name"),
    ]);
    const linkMap = new Map((linksRes.data || []).map((l: any) => [l.usuario_id, l]));
    setRows((usersRes.data || []).map((u: any) => ({ ...u, link: linkMap.get(u.id) })));
    setOrgs((orgsRes.data as Org[]) || []);
  };
  useEffect(() => { load(); }, []);

  const syncUser = async (id: number) => {
    setBusy(id);
    try {
      await invokeGrafanaFunction("grafana-sync-user", { body: { usuario_id: id } });
      toast({ title: "Usuário sincronizado" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const viewPerms = async (u: Usuario) => {
    const json = await invokeGrafanaFunction<{ perms: unknown }>("grafana-effective-permissions", {
      method: "GET",
      query: { usuario_id: u.id },
    });
    setPermsModal({ user: u, perms: json.perms });
  };

  const openEditor = async (u: Usuario) => {
    const [direct, groupMembers] = await Promise.all([
      supabase.from("grafana_user_org_permissions").select("grafana_organization_id, role, enabled").eq("usuario_id", u.id),
      supabase.from("grafana_access_group_members").select("group_id").eq("usuario_id", u.id),
    ]);
    const groupIds = (groupMembers.data || []).map((g: any) => g.group_id);
    let groupPerms: any[] = [];
    if (groupIds.length) {
      const { data } = await supabase
        .from("grafana_group_org_permissions")
        .select("grafana_organization_id, role")
        .in("group_id", groupIds);
      groupPerms = data || [];
    }
    const rank: Record<string, number> = { None: 0, Viewer: 1, Editor: 2, Admin: 3 };
    const groupRoles: Record<number, Role> = {};
    for (const p of groupPerms) {
      const prev = groupRoles[p.grafana_organization_id];
      if (!prev || rank[p.role] > rank[prev]) groupRoles[p.grafana_organization_id] = p.role as Role;
    }
    const initial: Record<number, Role> = {};
    for (const o of orgs) initial[o.id] = "None";
    for (const p of (direct.data || []) as any[]) {
      if (p.enabled) initial[p.grafana_organization_id] = p.role as Role;
    }
    setEditor({ user: u, roles: { ...initial }, initial, groupRoles, saving: false });
  };

  const setRole = (orgId: number, role: Role) => {
    if (!editor) return;
    setEditor({ ...editor, roles: { ...editor.roles, [orgId]: role } });
  };

  const bulkApply = (role: Role) => {
    if (!editor) return;
    const next: Record<number, Role> = {};
    for (const o of orgs) next[o.id] = role;
    setEditor({ ...editor, roles: next });
  };

  const saveEditor = async () => {
    if (!editor) return;
    setEditor({ ...editor, saving: true });
    try {
      const ops: Array<Promise<{ error: any }>> = [];
      for (const o of orgs) {
        const next = editor.roles[o.id] || "None";
        const prev = editor.initial[o.id] || "None";
        if (next === prev) continue;
        if (next === "None") {
          ops.push(
            (supabase
              .from("grafana_user_org_permissions")
              .delete()
              .eq("usuario_id", editor.user.id)
              .eq("grafana_organization_id", o.id) as unknown) as Promise<{ error: any }>,
          );
        } else {
          ops.push(
            (supabase.from("grafana_user_org_permissions").upsert(
              {
                usuario_id: editor.user.id,
                grafana_organization_id: o.id,
                role: next,
                enabled: true,
                atualizado_em: new Date().toISOString(),
              },
              { onConflict: "usuario_id,grafana_organization_id" },
            ) as unknown) as Promise<{ error: any }>,
          );
        }
      }
      const results = await Promise.all(ops);
      const failed = results.find((r: any) => r?.error);
      if (failed) throw new Error((failed as any).error.message);

      await invokeGrafanaFunction("grafana-sync-user", { body: { usuario_id: editor.user.id } });
      toast({ title: "Acessos atualizados", description: `${editor.user.nome} sincronizado com o Grafana.` });
      setEditor(null);
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
      setEditor((prev) => prev ? { ...prev, saving: false } : prev);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead><TableHead>Email</TableHead><TableHead>Permissão Ariia</TableHead>
                <TableHead>GrafanaAdmin</TableHead><TableHead>Vinculado</TableHead><TableHead>Última sync</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const isSuper = r.permissao === "SUPERADMIN";
                return (
                  <TableRow key={r.id}>
                    <TableCell>{r.nome}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell><Badge variant={isSuper ? "default" : "outline"}>{r.permissao}</Badge></TableCell>
                    <TableCell>{isSuper ? <Badge>Sim</Badge> : <Badge variant="outline">Não</Badge>}</TableCell>
                    <TableCell className="font-mono text-xs">{r.link?.grafana_user_id || "—"}</TableCell>
                    <TableCell className="text-xs">{r.link?.last_synced_at ? new Date(r.link.last_synced_at).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-right space-x-1 whitespace-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditor(r)}
                        disabled={isSuper}
                        title={isSuper ? "SUPERADMIN tem acesso total automático" : "Gerenciar acessos"}
                      >
                        Gerenciar acessos
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => viewPerms(r)}>Ver</Button>
                      <Button size="sm" onClick={() => syncUser(r.id)} disabled={busy === r.id}>
                        {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!permsModal} onOpenChange={() => setPermsModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Permissões efetivas — {permsModal?.user.nome}</DialogTitle></DialogHeader>
          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">{JSON.stringify(permsModal?.perms, null, 2)}</pre>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editor} onOpenChange={(o) => { if (!o) setEditor(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Acessos ao Grafana — {editor?.user.nome}</DialogTitle>
          </DialogHeader>
          {editor && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Aplicar a todas:</span>
                {ROLES.map((r) => (
                  <Button key={r} size="sm" variant="outline" onClick={() => bulkApply(r)}>{r}</Button>
                ))}
              </div>
              <div className="border rounded max-h-[420px] overflow-y-auto divide-y">
                {orgs.map((o) => {
                  const groupRole = editor.groupRoles[o.id];
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{o.name}</div>
                        <div className="text-xs text-muted-foreground">
                          ID Grafana: {o.grafana_org_id}
                          {groupRole && <> · via grupo: <b>{groupRole}</b></>}
                        </div>
                      </div>
                      <Select value={editor.roles[o.id] || "None"} onValueChange={(v) => setRole(o.id, v as Role)}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  );
                })}
                {orgs.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    Nenhuma organização ativa. Sincronize as organizações primeiro.
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                <b>None</b> remove o acesso direto. Papéis vindos de grupo permanecem (mostrados acima); para sobrescrever, defina um papel direto igual ou superior.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditor(null)} disabled={editor?.saving}>Cancelar</Button>
            <Button onClick={saveEditor} disabled={editor?.saving}>
              {editor?.saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar e sincronizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}




// -------------------- Logs --------------------
function LogsTab() {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    let q = supabase.from("grafana_sync_logs").select("*").order("criado_em", { ascending: false }).limit(100);
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setLogs((data as SyncLog[]) || []);
  };
  useEffect(() => { load(); }, [filter]);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-2 items-center">
        <Label>Status</Label>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="success">Sucesso</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
            <SelectItem value="skipped">Pulado</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Ação</TableHead><TableHead>Usuário</TableHead><TableHead>Status</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader>
            <TableBody>
              {logs.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs font-mono">{new Date(l.criado_em).toLocaleString()}</TableCell>
                  <TableCell>{l.action}</TableCell>
                  <TableCell>{l.usuario_id || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "error" ? "destructive" : l.status === "success" ? "default" : "outline"}>{l.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-destructive">{l.error_message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
