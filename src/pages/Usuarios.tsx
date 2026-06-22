import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import {
  Search, Loader2, KeyRound, CheckCircle2, XCircle, MinusCircle, Trash2,
  Pencil, ChevronLeft, ChevronRight,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserEditDialog } from "@/components/UserEditDialog";

type AccessScope = "ARIIA_ONLY" | "GRAFANA_ONLY" | "ARIIA_AND_GRAFANA" | "BLOCKED";

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
  empresa_id: number | null;
  access_scope: AccessScope;
}

interface Empresa { id: number; razao_social: string }

type TokenStatus = "idle" | "testing" | "ok" | "fail" | "missing";
interface TestResult { z1: TokenStatus; z2: TokenStatus; z1Error?: string; z2Error?: string }

const roleLabels: Record<string, string> = {
  SUPERADMIN: "Super Admin", ADMIN: "Administrador", USER: "Usuário",
  VIEWER: "Visualizador", CLIENTE: "Cliente",
};
const scopeLabels: Record<AccessScope, string> = {
  ARIIA_AND_GRAFANA: "Ariia + Grafana", ARIIA_ONLY: "Só Ariia",
  GRAFANA_ONLY: "Só Grafana", BLOCKED: "Bloqueado",
};
const scopeBadge = (s: AccessScope): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "BLOCKED") return "destructive";
  if (s === "GRAFANA_ONLY") return "outline";
  if (s === "ARIIA_ONLY") return "secondary";
  return "default";
};
const roleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (role) {
    case "SUPERADMIN": return "destructive";
    case "ADMIN": return "default";
    case "USER": return "secondary";
    default: return "outline";
  }
};

const PAGE_SIZE = 20;

const Usuarios = () => {
  const { toast } = useToast();
  const { user, hasFullAccess } = useUser();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterEmpresa, setFilterEmpresa] = useState<string>("all");
  const [filterPerfil, setFilterPerfil] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterScope, setFilterScope] = useState<string>("all");
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<Record<number, TestResult>>({});
  const [testingAll, setTestingAll] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Usuario | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<Usuario | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: us }, { data: emps }] = await Promise.all([
      supabase.from("usuarios")
        .select("id, nome, email, permissao, ativo, avatar_url, criado_em, zabbix_token_z1, zabbix_token_z2, empresa_id, access_scope")
        .order("nome"),
      supabase.from("empresas").select("id, razao_social").order("razao_social"),
    ]);
    const list = (us as Usuario[]) || [];
    setUsuarios(list);
    setEmpresas((emps as Empresa[]) || []);
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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const ariiaToken = localStorage.getItem("auth_token");
      const { data, error } = await supabase.functions.invoke("delete-usuario", {
        body: { usuario_id: deleteTarget.id },
        headers: ariiaToken ? { "x-ariia-token": ariiaToken } : undefined,
      });
      if (error || (data as any)?.error) {
        toast({ title: "Falha ao excluir", description: error?.message || (data as any)?.error, variant: "destructive" });
        return;
      }
      toast({ title: "Usuário excluído" });
      await load();
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: "Erro inesperado", description: e?.message, variant: "destructive" });
    } finally { setDeleting(false); }
  };

  const testToken = async (userId: number, source: "z1" | "z2", token: string | null) => {
    if (!token?.trim()) {
      setResults(r => ({ ...r, [userId]: { ...r[userId], [source]: "missing" } }));
      return;
    }
    setResults(r => ({ ...r, [userId]: { ...r[userId], [source]: "testing" } }));
    try {
      const { data, error } = await supabase.functions.invoke("zabbix-dashboard", {
        body: { action: "test_token", token, source },
      });
      if (error) throw error;
      const ok = (data as any)?.ok;
      setResults(r => ({ ...r, [userId]: { ...r[userId], [source]: ok ? "ok" : "fail", [`${source}Error`]: ok ? undefined : (data as any)?.error } as TestResult }));
    } catch (e: any) {
      setResults(r => ({ ...r, [userId]: { ...r[userId], [source]: "fail", [`${source}Error`]: e?.message } as TestResult }));
    }
  };

  const testAll = async () => {
    setTestingAll(true);
    await Promise.all(usuarios.flatMap(u => [testToken(u.id, "z1", u.zabbix_token_z1), testToken(u.id, "z2", u.zabbix_token_z2)]));
    setTestingAll(false);
    toast({ title: "Teste de tokens concluído" });
  };

  const canEditUser = (u: Usuario) => {
    if (hasFullAccess) return true;
    if (u.permissao === "SUPERADMIN" || u.permissao === "ADMIN") return false;
    return true;
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return usuarios.filter(u => {
      if (term && ![u.nome, u.email, u.permissao].some(v => v?.toLowerCase().includes(term))) return false;
      if (filterEmpresa !== "all") {
        if (filterEmpresa === "none" ? u.empresa_id !== null : String(u.empresa_id) !== filterEmpresa) return false;
      }
      if (filterPerfil !== "all" && u.permissao !== filterPerfil) return false;
      if (filterStatus !== "all" && String(u.ativo) !== filterStatus) return false;
      if (filterScope !== "all" && u.access_scope !== filterScope) return false;
      return true;
    });
  }, [usuarios, search, filterEmpresa, filterPerfil, filterStatus, filterScope]);

  useEffect(() => { setPage(1); }, [search, filterEmpresa, filterPerfil, filterStatus, filterScope]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const empresaName = (id: number | null) =>
    id ? (empresas.find(e => e.id === id)?.razao_social || `#${id}`) : "—";

  const formatDate = (date: string | null) => date ? new Date(date).toLocaleDateString("pt-BR") : "-";

  const renderTokenBadge = (status: TokenStatus, label: string, error?: string) => {
    const base = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border";
    let cls = "bg-muted/50 text-muted-foreground border-border";
    let Icon: any = KeyRound;
    if (status === "ok") { cls = "bg-primary/10 text-primary border-primary/30"; Icon = CheckCircle2; }
    else if (status === "fail") { cls = "bg-destructive/10 text-destructive border-destructive/30"; Icon = XCircle; }
    else if (status === "testing") { cls = "bg-muted text-muted-foreground border-border"; Icon = Loader2; }
    else if (status === "missing") { Icon = MinusCircle; }
    const node = <span className={`${base} ${cls}`}><Icon className={`h-3 w-3 ${status === "testing" ? "animate-spin" : ""}`} />{label}</span>;
    if (status === "fail" && error) {
      return (
        <TooltipProvider><Tooltip>
          <TooltipTrigger asChild>{node}</TooltipTrigger>
          <TooltipContent className="max-w-xs">{error}</TooltipContent>
        </Tooltip></TooltipProvider>
      );
    }
    return node;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Usuários</h2>
          <p className="text-muted-foreground">Gerencie usuários, perfis, escopo e permissões</p>
        </div>
        <Button onClick={testAll} disabled={testingAll || loading} className="gap-2">
          {testingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Testar tokens Zabbix
        </Button>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar nome, e-mail ou perfil..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
              <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas empresas</SelectItem>
                <SelectItem value="none">Sem empresa</SelectItem>
                {empresas.map(e => (<SelectItem key={e.id} value={String(e.id)}>{e.razao_social}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterPerfil} onValueChange={setFilterPerfil}>
              <SelectTrigger><SelectValue placeholder="Perfil" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos perfis</SelectItem>
                {Object.keys(roleLabels).map(r => (<SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="true">Ativos</SelectItem>
                <SelectItem value="false">Inativos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterScope} onValueChange={setFilterScope}>
              <SelectTrigger><SelectValue placeholder="Escopo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos escopos</SelectItem>
                {(Object.keys(scopeLabels) as AccessScope[]).map(s => (
                  <SelectItem key={s} value={s}>{scopeLabels[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead className="hidden md:table-cell">E-mail</TableHead>
                      <TableHead className="hidden md:table-cell">Empresa</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Escopo</TableHead>
                      <TableHead className="hidden lg:table-cell">Tokens</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden xl:table-cell">Desde</TableHead>
                      <TableHead className="w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageItems.map((u) => {
                      const editable = canEditUser(u);
                      const isCurrentUser = u.id === user.id;
                      return (
                        <TableRow key={u.id} className={!u.ativo ? "opacity-60" : ""}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={u.avatar_url || ""} />
                                <AvatarFallback className="text-xs">{u.nome?.[0]}</AvatarFallback>
                              </Avatar>
                              <div className="flex flex-col">
                                <span className="font-medium text-sm">{u.nome}</span>
                                <span className="text-xs text-muted-foreground md:hidden">{u.email}</span>
                              </div>
                              {isCurrentUser && <Badge variant="outline" className="text-xs">Você</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm hidden md:table-cell">{u.email}</TableCell>
                          <TableCell className="text-sm hidden md:table-cell">{empresaName(u.empresa_id)}</TableCell>
                          <TableCell>
                            <Badge variant={roleBadgeVariant(u.permissao)}>{roleLabels[u.permissao] || u.permissao}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={scopeBadge(u.access_scope)}>{scopeLabels[u.access_scope]}</Badge>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="flex flex-col gap-1">
                              {renderTokenBadge(results[u.id]?.z1 ?? "missing", "Z1", results[u.id]?.z1Error)}
                              {renderTokenBadge(results[u.id]?.z2 ?? "missing", "Z2", results[u.id]?.z2Error)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.ativo ? "default" : "secondary"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground hidden xl:table-cell">{formatDate(u.criado_em)}</TableCell>
                          <TableCell>
                            {editable && !isCurrentUser && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" onClick={() => setEditTarget(u)} className="gap-1">
                                  <Pencil className="h-3 w-3" /> Editar
                                </Button>
                                {hasFullAccess && (
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(u)} title="Excluir">
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pageItems.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum usuário encontrado</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <span>{filtered.length} usuário(s) — página {page} de {totalPages}</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deleteTarget?.nome}</strong> ({deleteTarget?.email})?
              Esta ação é permanente e remove vínculos com equipes e Grafana.
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

      <UserEditDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        usuario={editTarget}
        onSaved={load}
      />
    </div>
  );
};

export default Usuarios;
