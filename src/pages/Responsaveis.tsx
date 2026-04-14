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

interface Contato {
  id: number;
  nome: string;
  telefone: string | null;
  email: string | null;
  empresa_id: number | null;
  empresas?: { nome_fantasia: string };
}

interface Empresa { id: number; nome_fantasia: string; }

const emptyForm = { nome: "", telefone: "", email: "", empresa_id: "" };

const Responsaveis = () => {
  const { toast } = useToast();
  const { canEdit, canManageUsers } = useUser();
  const [responsaveis, setResponsaveis] = useState<Contato[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetchResponsaveis = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("contatos")
      .select("*, empresas(nome_fantasia)")
      .eq("tipo", "responsavel")
      .order("nome");
    setResponsaveis((data as any) || []);
    setLoading(false);
  };

  const fetchEmpresas = async () => {
    const { data } = await supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia");
    setEmpresas(data || []);
  };

  useEffect(() => { fetchResponsaveis(); fetchEmpresas(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return responsaveis;
    const s = search.toLowerCase();
    return responsaveis.filter(r =>
      r.nome.toLowerCase().includes(s) ||
      r.telefone?.toLowerCase().includes(s) ||
      r.email?.toLowerCase().includes(s) ||
      r.empresas?.nome_fantasia?.toLowerCase().includes(s)
    );
  }, [responsaveis, search]);

  const openNew = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (r: Contato) => {
    setEditId(r.id);
    setForm({ nome: r.nome, telefone: r.telefone || "", email: r.email || "", empresa_id: String(r.empresa_id) });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.empresa_id) {
      toast({ title: "Preencha nome e empresa", variant: "destructive" }); return;
    }
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      empresa_id: Number(form.empresa_id),
      tipo: "responsavel" as const,
    };

    if (editId) {
      const { error } = await supabase.from("contatos").update(payload).eq("id", editId);
      if (error) { toast({ title: "Erro ao atualizar", variant: "destructive" }); }
      else { toast({ title: "Responsável atualizado" }); setDialogOpen(false); fetchResponsaveis(); }
    } else {
      const { error } = await supabase.from("contatos").insert(payload);
      if (error) { toast({ title: "Erro ao cadastrar", variant: "destructive" }); }
      else { toast({ title: "Responsável cadastrado" }); setDialogOpen(false); fetchResponsaveis(); }
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("contatos").delete().eq("id", deleteId);
    if (error) { toast({ title: "Erro ao excluir", variant: "destructive" }); }
    else { toast({ title: "Responsável excluído" }); fetchResponsaveis(); }
    setDeleteDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Responsáveis</h1>
          <p className="text-muted-foreground text-sm">Responsáveis vinculados às empresas</p>
        </div>
        {canManageUsers && (
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Responsável</Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar responsável..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
                  <TableHead>Email</TableHead>
                  <TableHead>Empresa</TableHead>
                  {canEdit && <TableHead className="w-24">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhum responsável encontrado</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell>{r.telefone || "—"}</TableCell>
                    <TableCell>{r.email || "—"}</TableCell>
                    <TableCell>{r.empresas?.nome_fantasia || "—"}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                          {canManageUsers && (
                            <Button variant="ghost" size="icon" onClick={() => { setDeleteId(r.id); setDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
          <DialogHeader><DialogTitle>{editId ? "Editar Responsável" : "Novo Responsável"}</DialogTitle></DialogHeader>
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
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label>Empresa *</Label>
              <Select value={form.empresa_id} onValueChange={v => setForm({ ...form, empresa_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                <SelectContent>
                  {empresas.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.nome_fantasia}</SelectItem>)}
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
          <p className="text-muted-foreground">Tem certeza que deseja excluir este responsável?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Responsaveis;
