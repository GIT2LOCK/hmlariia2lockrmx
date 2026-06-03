import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, Users, UserPlus2, X } from "lucide-react";
import { useUser } from "@/contexts/UserContext";

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

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("support_groups")
      .select("*")
      .order("nome");
    setGroups((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const remove = async (g: Group) => {
    if (!confirm(`Excluir a equipe "${g.nome}"?`)) return;
    await supabase.from("support_group_members").delete().eq("group_id", g.id);
    const { error } = await supabase.from("support_groups").delete().eq("id", g.id);
    if (error) return toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    toast({ title: "Equipe excluída" });
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Equipes de Atendimento</h1>
          <p className="text-sm text-muted-foreground">Grupos operacionais usados nos chamados (atribuição, transferência, escalonamento).</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpenForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova equipe
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Equipes</CardTitle></CardHeader>
        <CardContent className="p-0">
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
              {!loading && groups.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Nenhuma equipe cadastrada.</TableCell></TableRow>
              )}
              {groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.nome}</TableCell>
                  <TableCell>{g.nivel ? <Badge variant="secondary">{g.nivel}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{g.descricao || "—"}</TableCell>
                  <TableCell>
                    {g.ativo ? <Badge>Ativa</Badge> : <Badge variant="outline">Inativa</Badge>}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => setOpenMembers(g)}>
                      <UserPlus2 className="h-4 w-4 mr-1" /> Membros
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(g); setOpenForm(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(g)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

  useEffect(() => {
    if (open) {
      setNome(initial?.nome || "");
      setDescricao(initial?.descricao || "");
      setNivel(initial?.nivel || "");
      setAtivo(initial?.ativo ?? true);
    }
  }, [open, initial]);

  const submit = async () => {
    if (!nome.trim()) return toast({ title: "Informe o nome", variant: "destructive" });
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
    if (error) return toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    toast({ title: initial ? "Equipe atualizada" : "Equipe criada" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? "Editar equipe" : "Nova equipe"}</DialogTitle>
          <DialogDescription>Equipes são usadas para atribuir, transferir e escalonar chamados.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <Label>Nível padrão</Label>
            <Select value={nivel} onValueChange={setNivel}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="N1">N1</SelectItem>
                <SelectItem value="N2">N2</SelectItem>
                <SelectItem value="N3">N3</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={ativo} onCheckedChange={setAtivo} />
            <Label>Equipe ativa</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>Salvar</Button>
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

  const load = async () => {
    const { data } = await supabase
      .from("support_group_members")
      .select("id,group_id,usuario_id,role_in_group,ativo,usuarios:usuario_id(nome)")
      .eq("group_id", group.id);
    setMembers(((data || []) as any[]).map((m) => ({ ...m, usuario_nome: m.usuarios?.nome })));
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Membros · {group.nome}</DialogTitle>
          <DialogDescription>Defina quem participa da equipe e o papel de cada um.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_180px_auto] gap-2 items-end">
          <div>
            <Label>Usuário</Label>
            <Select value={novoUserId} onValueChange={setNovoUserId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {availableUsers.map((u) => <SelectItem key={u.id} value={u.id.toString()}>{u.nome}</SelectItem>)}
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
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>

        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 && (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Sem membros.</TableCell></TableRow>
              )}
              {members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.usuario_nome || `#${m.usuario_id}`}</TableCell>
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
                    <Button size="sm" variant="ghost" onClick={() => remove(m)}>
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
