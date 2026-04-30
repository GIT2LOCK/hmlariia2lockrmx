import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Contato {
  id: number;
  nome: string;
  telefone: string | null;
  contato_unidades?: { unidade_id: number; unidades?: { id: number; nome_unidade: string; empresa_id: number } }[];
}

interface Unidade { id: number; nome_unidade: string; empresa_id: number; }
interface Empresa { id: number; nome_fantasia: string; }

const emptyForm = { nome: "", telefone: "", empresa_id: "", unidade_ids: [] as number[] };

const Pessoas = () => {
  const { toast } = useToast();
  const { canEdit, canManageUsers } = useUser();
  const [pessoas, setPessoas] = useState<Contato[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
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
      .from("contatos")
      .select("*, contato_unidades(unidade_id, unidades(id, nome_unidade, empresa_id))")
      .eq("tipo", "pessoa")
      .order("nome");
    setPessoas((data as any) || []);
    setLoading(false);
  };

  const fetchUnidades = async () => {
    const { data } = await supabase.from("unidades").select("id, nome_unidade, empresa_id").order("nome_unidade");
    setUnidades(data || []);
  };

  const fetchEmpresas = async () => {
    const { data } = await supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia");
    setEmpresas(data || []);
  };

  useEffect(() => { fetchPessoas(); fetchUnidades(); fetchEmpresas(); }, []);

  const filteredUnidades = useMemo(() => {
    if (!form.empresa_id) return [];
    return unidades.filter(u => u.empresa_id === Number(form.empresa_id));
  }, [unidades, form.empresa_id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return pessoas;
    const s = search.toLowerCase();
    return pessoas.filter(p =>
      p.nome.toLowerCase().includes(s) ||
      p.telefone?.toLowerCase().includes(s) ||
      p.contato_unidades?.some(cu => cu.unidades?.nome_unidade?.toLowerCase().includes(s))
    );
  }, [pessoas, search]);

  const openNew = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (p: Contato) => {
    setEditId(p.id);
    const links = p.contato_unidades || [];
    const empresaId = links[0]?.unidades?.empresa_id;
    setForm({
      nome: p.nome,
      telefone: p.telefone || "",
      empresa_id: empresaId ? String(empresaId) : "",
      unidade_ids: links.map(l => l.unidade_id),
    });
    setDialogOpen(true);
  };

  const toggleUnidade = (id: number) => {
    setForm(f => ({
      ...f,
      unidade_ids: f.unidade_ids.includes(id) ? f.unidade_ids.filter(x => x !== id) : [...f.unidade_ids, id],
    }));
  };

  const toggleAllUnidades = () => {
    const allIds = filteredUnidades.map(u => u.id);
    const allSelected = allIds.every(id => form.unidade_ids.includes(id));
    setForm(f => ({ ...f, unidade_ids: allSelected ? [] : allIds }));
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.empresa_id || form.unidade_ids.length === 0) {
      toast({ title: "Preencha nome, empresa e ao menos uma unidade", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload: any = {
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      unidade_id: form.unidade_ids[0], // legacy primary
      tipo: "pessoa" as const,
    };

    let contatoId = editId;
    if (editId) {
      const { error } = await supabase.from("contatos").update(payload).eq("id", editId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("contatos").insert(payload).select("id").single();
      if (error || !data) { toast({ title: "Erro ao cadastrar", variant: "destructive" }); setSaving(false); return; }
      contatoId = data.id;
    }

    // Sync contato_unidades
    await supabase.from("contato_unidades").delete().eq("contato_id", contatoId!);
    if (form.unidade_ids.length) {
      await supabase.from("contato_unidades").insert(
        form.unidade_ids.map(uid => ({ contato_id: contatoId!, unidade_id: uid }))
      );
    }

    toast({ title: editId ? "Pessoa atualizada" : "Pessoa cadastrada" });
    setDialogOpen(false);
    fetchPessoas();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("contatos").delete().eq("id", deleteId);
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
                  <TableHead>Unidades</TableHead>
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
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(p.contato_unidades || []).length === 0 ? "—" : p.contato_unidades!.map(cu => (
                          <Badge key={cu.unidade_id} variant="secondary">{cu.unidades?.nome_unidade}</Badge>
                        ))}
                      </div>
                    </TableCell>
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
        <DialogContent className="max-w-lg">
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
              <Label>Empresa *</Label>
              <Select value={form.empresa_id} onValueChange={v => setForm({ ...form, empresa_id: v, unidade_ids: [] })}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                <SelectContent>
                  {empresas.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.nome_fantasia}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.empresa_id && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Unidades * ({form.unidade_ids.length} selecionada{form.unidade_ids.length === 1 ? "" : "s"})</Label>
                  {filteredUnidades.length > 0 && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={toggleAllUnidades}>
                      {filteredUnidades.every(u => form.unidade_ids.includes(u.id)) ? "Limpar" : "Selecionar todas"}
                    </Button>
                  )}
                </div>
                <ScrollArea className="h-48 border rounded-md p-2">
                  {filteredUnidades.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">Nenhuma unidade nesta empresa</p>
                  ) : filteredUnidades.map(u => (
                    <label key={u.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded cursor-pointer">
                      <Checkbox checked={form.unidade_ids.includes(u.id)} onCheckedChange={() => toggleUnidade(u.id)} />
                      <span className="text-sm">{u.nome_unidade}</span>
                    </label>
                  ))}
                </ScrollArea>
              </div>
            )}
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
