import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Pessoa {
  id: number;
  nome: string;
  telefone: string | null;
  unidade_id: number;
  unidades?: { nome_unidade: string };
}

interface Unidade { id: number; nome_unidade: string; empresa_id: number; }
interface Empresa { id: number; nome_fantasia: string; }

const emptyForm = { nome: "", telefone: "", empresa_id: "", unidade_id: "" };

const Pessoas = () => {
  const { toast } = useToast();
  const { canEdit, canManageUsers } = useUser();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchPessoas = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pessoas")
      .select("*, unidades(nome_unidade)")
      .order("nome");
    setPessoas((data as any) || []);
    setLoading(false);
  };

  const fetchUnidades = async () => {
    const { data } = await supabase.from("unidades").select("id, nome_unidade").order("nome_unidade");
    setUnidades(data || []);
  };

  useEffect(() => { fetchPessoas(); fetchUnidades(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return pessoas;
    const s = search.toLowerCase();
    return pessoas.filter(p =>
      p.nome.toLowerCase().includes(s) ||
      p.telefone?.toLowerCase().includes(s) ||
      p.unidades?.nome_unidade?.toLowerCase().includes(s)
    );
  }, [pessoas, search]);

  const openNew = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (p: Pessoa) => {
    setEditId(p.id);
    setForm({ nome: p.nome, telefone: p.telefone || "", unidade_id: String(p.unidade_id) });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.unidade_id) {
      toast({ title: "Preencha nome e unidade", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = { nome: form.nome.trim(), telefone: form.telefone.trim() || null, unidade_id: Number(form.unidade_id) };
    
    if (editId) {
      const { error } = await supabase.from("pessoas").update(payload).eq("id", editId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); }
      else { toast({ title: "Pessoa atualizada" }); setDialogOpen(false); fetchPessoas(); }
    } else {
      const { error } = await supabase.from("pessoas").insert(payload);
      if (error) { toast({ title: "Erro ao cadastrar", variant: "destructive" }); }
      else { toast({ title: "Pessoa cadastrada" }); setDialogOpen(false); fetchPessoas(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("pessoas").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); }
    else { toast({ title: "Pessoa excluída" }); fetchPessoas(); }
    setDeleteDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pessoas</h1>
          <p className="text-muted-foreground text-sm">Pessoas vinculadas às unidades</p>
        </div>
        {canManageUsers && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nova Pessoa</Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar pessoa..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Unidade</TableHead>
                  {canEdit && <TableHead className="w-24">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma pessoa encontrada</TableCell></TableRow>
                ) : filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>{p.telefone || "—"}</TableCell>
                    <TableCell>{p.unidades?.nome_unidade || "—"}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                          {canManageUsers && (
                            <Button variant="ghost" size="icon" onClick={() => { setDeleteId(p.id); setDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Editar Pessoa" : "Nova Pessoa"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} />
            </div>
            <div>
              <Label>Unidade *</Label>
              <Select value={form.unidade_id} onValueChange={v => setForm({ ...form, unidade_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                <SelectContent>
                  {unidades.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.nome_unidade}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editId ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Tem certeza que deseja excluir esta pessoa?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pessoas;
