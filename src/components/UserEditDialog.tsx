import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, RefreshCw } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { getAuthToken } from "@/services/authService";

type AccessScope = "ARIIA_ONLY" | "GRAFANA_ONLY" | "ARIIA_AND_GRAFANA" | "BLOCKED";
type GRole = "None" | "Viewer" | "Editor" | "Admin";

const SCOPE_LABELS: Record<AccessScope, string> = {
  ARIIA_AND_GRAFANA: "Ariia + Grafana",
  ARIIA_ONLY: "Somente Ariia",
  GRAFANA_ONLY: "Somente Grafana",
  BLOCKED: "Bloqueado",
};

const TAB_DEFS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "chamados", label: "Chamados" },
  { key: "atendimento", label: "Dashboard Atendimento" },
  { key: "empresas", label: "Empresas" },
  { key: "unidades", label: "Unidades" },
  { key: "operadoras", label: "Operadoras" },
  { key: "pessoas", label: "Pessoas" },
  { key: "responsaveis", label: "Responsáveis" },
  { key: "base_conhecimento", label: "Base de Conhecimento" },
  { key: "relatorios", label: "Relatórios" },
  { key: "equipes", label: "Equipes" },
  { key: "zabbix", label: "Monitoramento Zabbix" },
  { key: "usuarios", label: "Usuários" },
  { key: "permissoes", label: "Permissões" },
  { key: "grafana", label: "Controle Grafana" },
];

interface Empresa { id: number; nome_fantasia: string | null; razao_social: string | null }
interface Org { id: number; grafana_org_id: number; name: string }
interface Group { id: number; name: string }
interface AuditRow { id: number; acao: string; criado_em?: string; created_at: string; detalhe: any; actor_usuario_id: number | null }

interface UsuarioMin {
  id: number;
  nome: string;
  email: string;
  permissao: string;
  ativo: boolean;
  avatar_url: string | null;
  telefone?: string | null;
  empresa_id?: number | null;
  access_scope?: AccessScope;
}

interface Props {
  open: boolean;
  onClose: () => void;
  usuario: UsuarioMin | null;
  onSaved?: () => void;
}

async function invokeGrafanaFunction(fn: string, body: any) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || getAuthToken();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Edge Function falhou (${res.status})`);
  return json;
}

export function UserEditDialog({ open, onClose, usuario, onSaved }: Props) {
  const { toast } = useToast();
  const { hasFullAccess } = useUser();
  const [tab, setTab] = useState("dados");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dados
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [ativo, setAtivo] = useState(true);
  // Empresa & Perfil
  const [empresaId, setEmpresaId] = useState<string>("");
  const [permissao, setPermissao] = useState("VIEWER");
  // Escopo
  const [scope, setScope] = useState<AccessScope>("ARIIA_AND_GRAFANA");
  // Abas
  const [allowedTabs, setAllowedTabs] = useState<Set<string>>(new Set());
  // Grupos
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [userGroups, setUserGroups] = useState<Set<number>>(new Set());
  // Grafana orgs
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgRoles, setOrgRoles] = useState<Record<number, GRole>>({});
  const [syncing, setSyncing] = useState(false);
  // Histórico
  const [audit, setAudit] = useState<AuditRow[]>([]);
  // Lists
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  const availableRoles = hasFullAccess
    ? ["SUPERADMIN", "ADMIN", "USER", "VIEWER", "CLIENTE"]
    : ["USER", "VIEWER", "CLIENTE"];

  useEffect(() => {
    if (!open || !usuario) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // fetch full user row
        const { data: u } = await supabase
          .from("usuarios")
          .select("id, nome, email, telefone, ativo, permissao, empresa_id, access_scope")
          .eq("id", usuario.id)
          .single();
        if (cancelled) return;
        const row: any = u || usuario;
        setNome(row.nome || "");
        setEmail(row.email || "");
        setTelefone(row.telefone || "");
        setAtivo(Boolean(row.ativo));
        setEmpresaId(row.empresa_id ? String(row.empresa_id) : "");
        setPermissao(row.permissao || "VIEWER");
        setScope((row.access_scope as AccessScope) || "ARIIA_AND_GRAFANA");

        // empresas
        const { data: emp } = await supabase
          .from("empresas")
          .select("id, razao_social")
          .order("razao_social");
        setEmpresas((emp as Empresa[]) || []);

        // tabs
        const { data: tabsRows } = await supabase
          .from("user_tab_permissions")
          .select("tab_key, allowed")
          .eq("usuario_id", usuario.id);
        const set = new Set<string>();
        (tabsRows || []).forEach((r: any) => { if (r.allowed) set.add(r.tab_key); });
        if ((tabsRows || []).length === 0) {
          if (row.permissao === "CLIENTE") set.add("chamados");
          else TAB_DEFS.forEach((t) => set.add(t.key));
        }
        setAllowedTabs(set);

        // groups
        const { data: gAll } = await supabase
          .from("grafana_access_groups")
          .select("id, name")
          .eq("active", true)
          .order("name");
        setAllGroups((gAll as Group[]) || []);
        const { data: gMine } = await supabase
          .from("grafana_access_group_members")
          .select("group_id")
          .eq("usuario_id", usuario.id);
        setUserGroups(new Set((gMine || []).map((r: any) => r.group_id)));

        // orgs
        const { data: orgsAll } = await supabase
          .from("grafana_organizations")
          .select("id, grafana_org_id, name")
          .eq("active", true)
          .order("name");
        const orgsList = (orgsAll as Org[]) || [];
        setOrgs(orgsList);
        const { data: perms } = await supabase
          .from("grafana_user_org_permissions")
          .select("grafana_organization_id, role, enabled")
          .eq("usuario_id", usuario.id);
        const roleMap: Record<number, GRole> = {};
        orgsList.forEach((o) => { roleMap[o.id] = "None"; });
        (perms || []).forEach((p: any) => {
          if (p.enabled) roleMap[p.grafana_organization_id] = p.role as GRole;
        });
        setOrgRoles(roleMap);

        // audit
        const { data: aud } = await supabase
          .from("user_audit_log")
          .select("id, acao, created_at, detalhe, actor_usuario_id")
          .eq("usuario_id", usuario.id)
          .order("created_at", { ascending: false })
          .limit(50);
        setAudit((aud as AuditRow[]) || []);
      } catch (e: any) {
        toast({ title: "Erro ao carregar", description: e?.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, usuario?.id]);

  const saveAll = async () => {
    if (!usuario) return;
    setSaving(true);
    try {
      // 1) Dados + Empresa + Perfil + Escopo (uma só UPDATE)
      const { error: upErr } = await supabase
        .from("usuarios")
        .update({
          nome: nome.trim(),
          telefone: telefone.trim() || null,
          ativo,
          empresa_id: empresaId ? Number(empresaId) : null,
          permissao,
          permissao_manual: true,
          access_scope: scope,
        })
        .eq("id", usuario.id);
      if (upErr) throw upErr;

      // 2) Abas
      await supabase.from("user_tab_permissions").delete().eq("usuario_id", usuario.id);
      const tabRows = TAB_DEFS.map((t) => ({
        usuario_id: usuario.id, tab_key: t.key, allowed: allowedTabs.has(t.key),
      }));
      await supabase.from("user_tab_permissions").insert(tabRows);

      // 3) Grupos
      await supabase.from("grafana_access_group_members").delete().eq("usuario_id", usuario.id);
      const groupRows = Array.from(userGroups).map((gid) => ({
        usuario_id: usuario.id, group_id: gid,
      }));
      if (groupRows.length > 0) {
        await supabase.from("grafana_access_group_members").insert(groupRows);
      }

      // 4) Grafana orgs (direct perms)
      await supabase.from("grafana_user_org_permissions").delete().eq("usuario_id", usuario.id);
      const orgRows = Object.entries(orgRoles)
        .filter(([, role]) => role !== "None")
        .map(([orgId, role]) => ({
          usuario_id: usuario.id,
          grafana_organization_id: Number(orgId),
          role: role as GRole,
          enabled: true,
        }));
      if (orgRows.length > 0) {
        await supabase.from("grafana_user_org_permissions").insert(orgRows);
      }

      // 5) Sincroniza com Grafana automaticamente (auto-aplicação)
      const needsGrafanaSync = scope === "ARIIA_AND_GRAFANA" || scope === "GRAFANA_ONLY" || scope === "BLOCKED";
      if (needsGrafanaSync) {
        try {
          await invokeGrafanaFunction("grafana-sync-user", { usuario_id: usuario.id });
          toast({ title: "Usuário salvo e sincronizado com Grafana" });
        } catch (syncErr: any) {
          toast({
            title: "Salvo no banco, mas falhou no Grafana",
            description: syncErr?.message || "Sincronização não concluída",
            variant: "destructive",
          });
        }
      } else {
        toast({ title: "Usuário salvo com sucesso" });
      }
      onSaved?.();
      onClose();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const syncGrafana = async () => {
    if (!usuario) return;
    setSyncing(true);
    try {
      await invokeGrafanaFunction("grafana-sync-user", { usuario_id: usuario.id });
      toast({ title: "Sincronização Grafana concluída" });
    } catch (e: any) {
      toast({ title: "Falha na sincronização", description: e?.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const toggleTab = (k: string) => setAllowedTabs(p => {
    const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n;
  });
  const toggleGroup = (id: number) => setUserGroups(p => {
    const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Editar usuário — {usuario?.nome}</DialogTitle>
          <DialogDescription>{usuario?.email}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="grid grid-cols-7 w-full">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="empresa">Empresa & Perfil</TabsTrigger>
              <TabsTrigger value="escopo">Escopo</TabsTrigger>
              <TabsTrigger value="abas">Abas</TabsTrigger>
              <TabsTrigger value="grupos">Grupos</TabsTrigger>
              <TabsTrigger value="grafana">Grafana</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <div className="overflow-y-auto flex-1 mt-4 pr-1">
              <TabsContent value="dados" className="space-y-3 mt-0">
                <div className="space-y-1">
                  <Label>Nome</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>E-mail</Label>
                  <Input value={email} readOnly disabled />
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={ativo} onCheckedChange={setAtivo} />
                  <Label className="cursor-pointer">Usuário ativo</Label>
                </div>
              </TabsContent>

              <TabsContent value="empresa" className="space-y-3 mt-0">
                <div className="space-y-1">
                  <Label>Empresa</Label>
                  <Select value={empresaId || "none"} onValueChange={(v) => setEmpresaId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Sem empresa" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem empresa —</SelectItem>
                      {empresas.map(e => (
                        <SelectItem key={e.id} value={String(e.id)}>{e.razao_social}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Obrigatório para perfil CLIENTE — restringe chamados à empresa.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>Perfil (cargo)</Label>
                  <Select value={permissao} onValueChange={setPermissao}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {availableRoles.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="escopo" className="space-y-3 mt-0">
                <Label>Escopo de acesso</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as AccessScope)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SCOPE_LABELS) as AccessScope[]).map(s => (
                      <SelectItem key={s} value={s}>{SCOPE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                  <p><strong>Ariia + Grafana:</strong> acesso a tudo conforme perfil.</p>
                  <p><strong>Somente Ariia:</strong> nenhuma permissão Grafana é sincronizada.</p>
                  <p><strong>Somente Grafana:</strong> ao logar, vai direto para o painel kiosk.</p>
                  <p><strong>Bloqueado:</strong> usuário não consegue acessar nada.</p>
                </div>
              </TabsContent>

              <TabsContent value="abas" className="mt-0">
                {(permissao === "SUPERADMIN" || permissao === "ADMIN") ? (
                  <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    SUPERADMIN/ADMIN têm acesso a todas as abas automaticamente.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {TAB_DEFS.map(t => (
                      <label key={t.key} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
                        <Checkbox checked={allowedTabs.has(t.key)} onCheckedChange={() => toggleTab(t.key)} />
                        <span className="text-sm">{t.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="grupos" className="mt-0">
                {allGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum grupo configurado.</p>
                ) : (
                  <div className="space-y-2">
                    {allGroups.map(g => (
                      <label key={g.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 cursor-pointer hover:bg-muted/40">
                        <Checkbox checked={userGroups.has(g.id)} onCheckedChange={() => toggleGroup(g.id)} />
                        <span className="text-sm">{g.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="grafana" className="space-y-3 mt-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Defina o papel direto do usuário em cada organização Grafana.
                  </p>
                  <Button size="sm" variant="outline" onClick={syncGrafana} disabled={syncing} className="gap-1">
                    {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    Sincronizar agora
                  </Button>
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {orgs.map(o => (
                    <div key={o.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{o.name}</span>
                        <span className="text-xs text-muted-foreground">orgId={o.grafana_org_id}</span>
                      </div>
                      <Select
                        value={orgRoles[o.id] || "None"}
                        onValueChange={(v) => setOrgRoles(p => ({ ...p, [o.id]: v as GRole }))}
                      >
                        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(["None","Viewer","Editor","Admin"] as GRole[]).map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="historico" className="mt-0">
                {audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem alterações registradas.</p>
                ) : (
                  <div className="space-y-2">
                    {audit.map(a => (
                      <div key={a.id} className="rounded-md border border-border p-2 text-xs">
                        <div className="flex justify-between">
                          <Badge variant="outline">{a.acao}</Badge>
                          <span className="text-muted-foreground">
                            {new Date(a.created_at).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        {a.detalhe && (
                          <pre className="mt-1 overflow-x-auto text-[10px] text-muted-foreground">
                            {JSON.stringify(a.detalhe, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={saveAll} disabled={saving || loading} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar tudo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
