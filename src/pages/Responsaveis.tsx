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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  cobre_empresa_inteira: boolean;
  empresas?: { nome_fantasia: string };
  contato_unidades?: { unidade_id: number; unidades?: { id: number; nome_unidade: string } }[];
}

interface Empresa { id: number; nome_fantasia: string; }
interface Unidade { id: number; nome_unidade: string; empresa_id: number; }

const emptyForm = {
  nome: "",
  telefone: "",
  email: "",
  empresa_id: "",
  escopo: "empresa" as "empresa" | "unidades",
  unidade_ids: [] as number[],
};

const Responsaveis = () => {
  const { toast } = useToast();
  const { canEdit, canManageUsers } = useUser();
  const [responsaveis, setResponsaveis] = useState<Contato[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
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
      .select("*, empresas(nome_fantasia), contato_unidades(unidade_id, unidades(id, nome_unidade))")
      .eq("tipo", "responsavel")
      .order("nome");
    setResponsaveis((data as any) || []);
    setLoading(false);
  };

  const fetchEmpresas = async () => {
    const { data } = await supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia");
    setEmpresas(data || []);
  };

  const fetchUnidades = async () => {
    const { data } = await supabase.from("unidades").select("id, nome_unidade, empresa_id").order("nome_unidade");
    setUnidades(data || []);
  };

  useEffect(() => { fetchResponsaveis(); fetchEmpresas(); fetchUnidades(); }, []);

  const filteredUnidadesEmpresa = useMemo(() => {
    if (!form.empresa_id) return [];
    return unidades.filter(u => u.empresa_id === Number(form.empresa_id));
  }, [unidades, form.empresa_id]);

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
    setForm({
      nome: r.nome,
      telefone: r.telefone || "",
      email: r.email || "",
      empresa_id: String(r.empresa_id),
      escopo: r.cobre_empresa_inteira ? "empresa" : "unidades",
      unidade_ids: (r.contato_unidades || []).map(cu => cu.unidade_id),
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
    const allIds = filteredUnidadesEmpresa.map(u => u.id);
    const allSelected = allIds.every(id => form.unidade_ids.includes(id));
    setForm(f => ({ ...f, unidade_ids: allSelected ? [] : allIds }));
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.empresa_id) {
      toast({ title: "Preencha nome e empresa", variant: "destructive" }); return;
    }
    if (form.escopo === "unidades" && form.unidade_ids.length === 0) {
      toast({ title: "Selecione ao menos uma unidade", variant: "destructive" }); return;
    }
    setSaving(true);

    const payload: any = {
      nome: form.nome.trim(),
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      empresa_id: Number(form.empresa_id),
      cobre_empresa_inteira: form.escopo === "empresa",
      tipo: "responsavel" as const,
      unidade_id: form.escopo === "unidades" ? form.unidade_ids[0] : null,
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

    await supabase.from("contato_unidades").delete().eq("contato_id", contatoId!);
    if (form.escopo === "unidades" && form.unidade_ids.length) {
      await supabase.from("contato_unidades").insert(
        form.unidade_ids.map(uid => ({ contato_id: contatoId!, unidade_id: uid }))
      );
    }

    toast({ title: editId ? "Responsável atualizado" : "Responsável cadastrado" });
    setDialogOpen(false);
    fetchResponsaveis();
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
                  <TableHead>Escopo</TableHead>
                  {canEdit && <TableHead className="w-24">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum responsável encontrado</TableCell></TableRow>
                ) : filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.nome}</TableCell>
                    <TableCell>{r.telefone || "—"}</TableCell>
                    <TableCell>{r.email || "—"}</TableCell>
                    <TableCell>{r.empresas?.nome_fantasia || "—"}</TableCell>
                    <TableCell>
                      {r.cobre_empresa_inteira ? (
                        <Badge>Empresa inteira</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(r.contato_unidades || []).map(cu => (
                            <Badge key={cu.unidade_id} variant="secondary">{cu.unidades?.nome_unidade}</Badge>
                          ))}
                          {(r.contato_unidades || []).length === 0 && "—"}
                        </div>
                      )}
                    </TableCell>
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
        <DialogContent className="max-w-lg">
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
              <Select value={form.empresa_id} onValueChange={v => setForm({ ...form, empresa_id: v, unidade_ids: [] })}>
                <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                <SelectContent>
                  {empresas.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.nome_fantasia}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.empresa_id && (
              <div>
                <Label className="mb-2 block">Escopo de cobertura *</Label>
                <RadioGroup value={form.escopo} onValueChange={(v: any) => setForm({ ...form, escopo: v })} className="space-y-2">
                  <label className="flex items-start gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="empresa" id="escopo-empresa" className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Empresa inteira</div>
                      <div className="text-xs text-muted-foreground">Cobre todas as unidades atuais e futuras desta empresa</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 p-3 border rounded-md cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value="unidades" id="escopo-unidades" className="mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">Apenas unidades específicas</div>
                      <div className="text-xs text-muted-foreground">Selecione as unidades cobertas</div>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            )}
            {form.empresa_id && form.escopo === "unidades" && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Unidades * ({form.unidade_ids.length})</Label>
                  {filteredUnidadesEmpresa.length > 0 && (
                    <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={toggleAllUnidades}>
                      {filteredUnidadesEmpresa.every(u => form.unidade_ids.includes(u.id)) ? "Limpar" : "Selecionar todas"}
                    </Button>
                  )}
                </div>
                <ScrollArea className="h-48 border rounded-md p-2">
                  {filteredUnidadesEmpresa.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-2">Nenhuma unidade nesta empresa</p>
                  ) : filteredUnidadesEmpresa.map(u => (
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
