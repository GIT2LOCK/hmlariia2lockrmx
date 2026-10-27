import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, UserPlus2, X, Search, RefreshCw, LoaderCircle } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { filterTeams, filterPeople } from "@/lib/teamFilters";

type Nivel = "N1" | "N2" | "N3";
type RoleGrp = "MEMBRO" | "COORDENADOR" | "GESTOR";

interface Group {
  id: number;
  nome: string;
  descricao: string | null;
  nivel: Nivel | null;
  ativo: boolean;
}
interface Member {
  id: number;
  group_id: number;
  usuario_id: number;
  role_in_group: RoleGrp;
  ativo: boolean;
  usuario_nome?: string;
}

export default function Equipes() {
  const { canManageUsers } = useUser();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Group | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [openMembers, setOpenMembers] = useState<Group | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [loadError, setLoadError] = useState(false);
  const filteredGroups = filterTeams(groups, search, statusFilter, levelFilter);
  const hasFilters = Boolean(search || statusFilter !== "all" || levelFilter !== "all");
  const clearFilters = () => { setSearch(""); setStatusFilter("all"); setLevelFilter("all"); };

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("support_groups")
      .select("*")
      .order("nome");
    setLoadError(Boolean(error));
    if (!error) setGroups((data as Group[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (g: Group) => {
    if (!confirm(`Excluir a fila / equipe "${g.nome}"?`)) return;
    await supabase.from("support_group_members").delete().eq("group_id", g.id);
    const { error } = await supabase.from("support_groups").delete().eq("id", g.id);
    if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    toast({ title: "Fila / equipe excluída" });
    load();
  };

  if (!canManageUsers) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-muted-foreground">Acesso restrito a administradores.</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Filas e Equipes de Atendimento</h1>
        </div>
        <Button onClick={() => { setEditing(null); setOpenForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova fila / equipe
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-y py-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 sm:min-w-64 sm:flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Pesquisar filas e equipes" placeholder="Buscar nome ou descrição..." className="pl-9 pr-10" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" aria-label="Limpar busca" title="Limpar busca" onClick={() => setSearch("")}><X className="h-4 w-4" /></Button>}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-40" aria-label="Filtrar status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem><SelectItem value="active">Ativas</SelectItem><SelectItem value="inactive">Inativas</SelectItem></SelectContent></Select>
        <Select value={levelFilter} onValueChange={setLevelFilter}><SelectTrigger className="w-full sm:w-40" aria-label="Filtrar nível"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os níveis</SelectItem><SelectItem value="N1">N1</SelectItem><SelectItem value="N2">N2</SelectItem><SelectItem value="N3">N3</SelectItem><SelectItem value="none">Sem nível</SelectItem></SelectContent></Select>
        {hasFilters && <Button variant="ghost" onClick={clearFilters}><X className="mr-1 h-4 w-4" />Limpar filtros</Button>}
        <Button variant="outline" size="icon" disabled={loading} onClick={() => void load()} aria-label="Atualizar filas e equipes" title="Atualizar filas e equipes"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground" aria-live="polite">
        <span>{filteredGroups.length} de {groups.length} filas / equipes</span>
        <span>{groups.filter(g => g.ativo).length} ativas · {groups.filter(g => !g.ativo).length} inativas</span>
      </div>
      {loadError && <div role="alert" className="flex items-center justify-between gap-3 text-sm text-destructive"><span>Não foi possível atualizar as filas e equipes.</span><Button variant="outline" onClick={() => void load()}>Tentar novamente</Button></div>}
      <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Carregando…</TableCell></TableRow>}
              {!loading && !loadError && filteredGroups.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{hasFilters ? "Nenhuma fila / equipe encontrada." : "Nenhuma fila / equipe cadastrada."}{hasFilters && <Button variant="link" onClick={clearFilters} className="block mx-auto">Limpar filtros</Button>}</TableCell></TableRow>
              )}
              {!loading && filteredGroups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.nome}</TableCell>
                  <TableCell>{g.nivel ? <Badge variant="secondary">{g.nivel}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs"><span className="line-clamp-2 break-words" title={g.descricao || undefined}>{g.descricao || "—"}</span></TableCell>
                  <TableCell>
                    {g.ativo ? <Badge>Ativa</Badge> : <Badge variant="outline">Inativa</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" aria-label={`Membros de ${g.nome}`} onClick={() => setOpenMembers(g)}>
                      <UserPlus2 className="h-4 w-4 mr-1" /> Membros
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Editar ${g.nome}`} title="Editar fila / equipe" onClick={() => { setEditing(g); setOpenForm(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" aria-label={`Excluir ${g.nome}`} title="Excluir fila / equipe" onClick={() => remove(g)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
      </div>

      <GroupForm
        open={openForm}
        onClose={() => setOpenForm(false)}
        initial={editing}
        onSaved={() => { setOpenForm(false); load(); }}
      />
      {openMembers && (
        <MembersDialog
          open={!!openMembers}
          group={openMembers}
          onClose={() => setOpenMembers(null)}
        />
      )}
    </div>
  );
}

function GroupForm({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial: Group | null; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [nivel, setNivel] = useState<string>("");
  const [ativo, setAtivo] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setNome(initial?.nome || "");
      setDescricao(initial?.descricao || "");
      setNivel(initial?.nivel || "");
      setAtivo(initial?.ativo ?? true);
    }
  }, [open, initial]);

  const submit = async () => {
    if (saving) return;
    if (!nome.trim()) return toast({ title: "Informe o nome", variant: "destructive" });
    setSaving(true);
    const payload: any = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      nivel: nivel || null,
      ativo,
    };
    const op = initial
      ? supabase.from("support_groups").update(payload).eq("id", initial.id)
      : supabase.from("support_groups").insert(payload);
    const { error } = await op;
    setSaving(false);
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: initial ? "Fila / equipe atualizada" : "Fila / equipe criada" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar fila / equipe" : "Nova fila / equipe"}</DialogTitle>
        </DialogHeader>
        <form id="team-form" onSubmit={e => { e.preventDefault(); void submit(); }}><fieldset disabled={saving} className="space-y-3">
          <div>
            <Label htmlFor="team-name">Nome *</Label>
            <Input id="team-name" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Nível padrão</Label>
            <Select disabled={saving} value={nivel || "none"} onValueChange={v => setNivel(v === "none" ? "" : v)}>
              <SelectTrigger aria-label="Nível padrão"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem nível</SelectItem>
                <SelectItem value="N1">N1</SelectItem>
                <SelectItem value="N2">N2</SelectItem>
                <SelectItem value="N3">N3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="team-description">Descrição</Label>
            <Textarea id="team-description" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="team-active" disabled={saving} checked={ativo} onCheckedChange={setAtivo} />
            <Label htmlFor="team-active">Fila / equipe ativa</Label>
          </div>
        </fieldset></form>
        <DialogFooter>
          <Button variant="ghost" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="team-form" disabled={saving || !nome.trim()}>{saving && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{saving ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersDialog({ open, group, onClose }: { open: boolean; group: Group; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [usuarios, setUsuarios] = useState<{ id: number; nome: string }[]>([]);
  const [novoUserId, setNovoUserId] = useState<string>("");
  const [novoRole, setNovoRole] = useState<RoleGrp>("MEMBRO");
  const [loading, setLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("support_group_members")
      .select("id,group_id,usuario_id,role_in_group,ativo")
      .eq("group_id", group.id);
    const list = (rows || []) as any[];
    const ids = Array.from(new Set(list.map((m) => m.usuario_id)));
    let nameMap: Record<number, string> = {};
    if (ids.length) {
      const { data: us } = await supabase.from("usuarios").select("id,nome").in("id", ids);
      nameMap = Object.fromEntries(((us as any[]) || []).map((u) => [u.id, u.nome]));
    }
    setMembers(list.map((m) => ({ ...m, usuario_nome: nameMap[m.usuario_id] })));
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      load();
      supabase.from("usuarios").select("id,nome").eq("ativo", true).order("nome").then(({ data }) => setUsuarios((data as any) || []));
    }
  }, [open, group.id]);

  const add = async () => {
    if (!novoUserId) return;
    const { error } = await supabase.from("support_group_members").insert({
      group_id: group.id,
      usuario_id: Number(novoUserId),
      role_in_group: novoRole,
      ativo: true,
    });
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setNovoUserId("");
    setNovoRole("MEMBRO");
    load();
  };

  const updateRole = async (m: Member, role: RoleGrp) => {
    await supabase.from("support_group_members").update({ role_in_group: role }).eq("id", m.id);
    load();
  };
  const remove = async (m: Member) => {
    await supabase.from("support_group_members").delete().eq("id", m.id);
    load();
  };

  const availableUsers = usuarios.filter((u) => !members.some((m) => m.usuario_id === u.id));
  const visibleUsers = filterPeople(availableUsers, userSearch);
  const visibleMembers = filterPeople(members.map(m => ({ ...m, nome: m.usuario_nome || `#${m.usuario_id}` })), memberSearch).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Membros · {group.nome}</DialogTitle>
          <DialogDescription>{members.length} membros · {group.nivel || "Sem nível"} · {group.ativo ? "Ativa" : "Inativa"}</DialogDescription>
        </DialogHeader>

        <Input aria-label="Pesquisar usuários disponíveis" placeholder="Buscar usuário para adicionar..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px_auto] gap-2 items-end">
          <div>
            <Label>Usuário</Label>
            <Select disabled={loading || !availableUsers.length} value={novoUserId} onValueChange={setNovoUserId}>
              <SelectTrigger aria-label="Usuário a adicionar"><SelectValue placeholder={availableUsers.length ? "Selecione" : "Nenhum usuário disponível"} /></SelectTrigger>
              <SelectContent>
                {visibleUsers.length === 0 && <div className="p-2 text-sm text-muted-foreground">Nenhum usuário encontrado</div>}
                {availableUsers.filter(u => visibleUsers.some(v => v.id === u.id) || u.id.toString() === novoUserId).map((u) => <SelectItem key={u.id} value={u.id.toString()}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Papel</Label>
            <Select value={novoRole} onValueChange={(v) => setNovoRole(v as RoleGrp)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBRO">Membro</SelectItem>
                <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                <SelectItem value="GESTOR">Gestor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button disabled={!novoUserId || loading} onClick={add}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>

        <Input aria-label="Pesquisar membros" placeholder="Buscar membro da equipe..." value={memberSearch} onChange={e => setMemberSearch(e.target.value)} />
        <div className="border rounded-md max-h-80 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Carregando membros...</TableCell></TableRow>}
              {!loading && visibleMembers.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">{memberSearch ? "Nenhum membro encontrado." : "Sem membros."}</TableCell></TableRow>
              )}
              {!loading && visibleMembers.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="break-words">{m.nome}{!m.ativo && <Badge className="ml-2" variant="outline">Inativo</Badge>}</TableCell>
                  <TableCell>
                    <Select value={m.role_in_group} onValueChange={(v) => updateRole(m, v as RoleGrp)}>
                      <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MEMBRO">Membro</SelectItem>
                        <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                        <SelectItem value="GESTOR">Gestor</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" aria-label={`Remover ${m.nome} da equipe`} title="Remover da equipe" onClick={() => remove(m)}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
