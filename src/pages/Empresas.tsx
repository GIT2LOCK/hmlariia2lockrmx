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

interface Empresa {
  id: number;
  nome_fantasia: string;
  razao_social: string | null;
  cnpj: string | null;
  observacoes: string | null;
}

const emptyForm = { nome_fantasia: "", razao_social: "", cnpj: "", observacoes: "" };

const Empresas = () => {
  const { toast } = useToast();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Empresa | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("empresas").select("*").order("nome_fantasia");
    setEmpresas((data as Empresa[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = empresas.filter((e) =>
    [e.nome_fantasia, e.razao_social, e.cnpj].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const openNew = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (e: Empresa) => {
    setEditing(e);
    setForm({ nome_fantasia: e.nome_fantasia, razao_social: e.razao_social || "", cnpj: e.cnpj || "", observacoes: e.observacoes || "" });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nome_fantasia.trim()) { toast({ title: "Nome fantasia é obrigatório", variant: "destructive" }); return; }
    if (editing) {
      await supabase.from("empresas").update(form).eq("id", editing.id);
      toast({ title: "Empresa atualizada" });
    } else {
      await supabase.from("empresas").insert(form);
      toast({ title: "Empresa cadastrada" });
    }
    setModalOpen(false);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("Remover esta empresa e todas suas unidades?")) return;
    await supabase.from("empresas").delete().eq("id", id);
    toast({ title: "Empresa removida" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Empresas</h2>
          <p className="text-muted-foreground">Gerencie as empresas cadastradas</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nova Empresa</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empresa..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome Fantasia</TableHead>
                <TableHead>Razão Social</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead className="w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.nome_fantasia}</TableCell>
                  <TableCell>{e.razao_social || "-"}</TableCell>
                  <TableCell>{e.cnpj || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Nenhuma empresa encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar Empresa" : "Nova Empresa"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome Fantasia *</Label><Input value={form.nome_fantasia} onChange={(e) => setForm({...form, nome_fantasia: e.target.value})} /></div>
            <div><Label>Razão Social</Label><Input value={form.razao_social} onChange={(e) => setForm({...form, razao_social: e.target.value})} /></div>
            <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({...form, cnpj: e.target.value})} /></div>
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

export default Empresas;
