import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Empresa {
  id: number;
  nome_fantasia: string;
}

const Empresas = () => {
  const { toast } = useToast();
  const { canEdit, canManageUsers } = useUser();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Empresa | null>(null);
  const [nome, setNome] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia");
    setEmpresas((data as Empresa[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = empresas.filter((e) =>
    e.nome_fantasia.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditing(null); setNome(""); setModalOpen(true); };
  const openEdit = (e: Empresa) => { setEditing(e); setNome(e.nome_fantasia); setModalOpen(true); };

  const save = async () => {
    if (!nome.trim()) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    if (editing) {
      await supabase.from("empresas").update({ nome_fantasia: nome.trim() }).eq("id", editing.id);
      toast({ title: "Empresa atualizada" });
    } else {
      await supabase.from("empresas").insert({ nome_fantasia: nome.trim() });
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
        {canManageUsers && (
          <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nova Empresa</Button>
        )}
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
                <TableHead>Nome</TableHead>
                {canEdit && <TableHead className="w-24">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.nome_fantasia}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-1">
                        {canManageUsers && (
                          <Button size="icon" variant="ghost" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button>
                        )}
                        {canManageUsers && (
                          <Button size="icon" variant="ghost" onClick={() => remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={canEdit ? 2 : 1} className="text-center text-muted-foreground py-8">Nenhuma empresa encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar Empresa" : "Nova Empresa"}</DialogTitle></DialogHeader>
          <div>
            <Label>Nome da Empresa *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Good Storage"
              onKeyDown={(e) => { if (e.key === "Enter") save(); }} autoFocus />
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
