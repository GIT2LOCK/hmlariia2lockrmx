import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Operadora {
  id: number; nome: string; telefone: string | null; email: string | null; observacoes: string | null;
}

const emptyForm = { nome: "", telefone: "", email: "", observacoes: "" };

const Operadoras = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<Operadora[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Operadora | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("operadoras").select("*").order("nome");
    setItems((data as Operadora[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter((o) =>
    [o.nome, o.telefone, o.email].some((v) => v?.toLowerCase().includes(search.toLowerCase()))
  );

  const openNew = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (o: Operadora) => {
    setEditing(o);
    setForm({ nome: o.nome, telefone: o.telefone || "", email: o.email || "", observacoes: o.observacoes || "" });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    if (editing) {
      await supabase.from("operadoras").update(form).eq("id", editing.id);
      toast({ title: "Operadora atualizada" });
    } else {
      await supabase.from("operadoras").insert(form);
      toast({ title: "Operadora cadastrada" });
    }
    setModalOpen(false);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("Remover esta operadora?")) return;
    const { error } = await supabase.from("operadoras").delete().eq("id", id);
    if (error) { toast({ title: "Erro: operadora vinculada a links", variant: "destructive" }); return; }
    toast({ title: "Operadora removida" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Operadoras</h2>
          <p className="text-muted-foreground">Gerencie as operadoras de internet</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nova Operadora</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar operadora..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.nome}</TableCell>
                  <TableCell>{o.telefone || "-"}</TableCell>
                  <TableCell>{o.email || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(o)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma operadora encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Operadora" : "Nova Operadora"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input value={form.nome} onChange={(e) => setForm({...form, nome: e.target.value})} /></div>
            <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({...form, telefone: e.target.value})} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} /></div>
            <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({...form, observacoes: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Operadoras;
