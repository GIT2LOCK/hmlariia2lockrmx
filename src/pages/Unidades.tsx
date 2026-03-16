import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Eye } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";

interface Unidade {
  id: number; empresa_id: number; nome_unidade: string; codigo_unidade: string | null;
  hostname: string | null; telefone: string | null; email: string | null; cidade: string | null; estado: string | null;
  logradouro: string | null; numero: string | null; bairro: string | null; cep: string | null;
  complemento: string | null; nome_antigo: string | null; observacoes: string | null;
  empresas?: { nome_fantasia: string };
}

interface Empresa { id: number; nome_fantasia: string; }

const emptyForm = {
  empresa_id: "", nome_unidade: "", codigo_unidade: "", hostname: "", nome_antigo: "",
  telefone: "", email: "", logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", estado: "", cep: "", observacoes: "",
};

const Unidades = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Unidade | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = async () => {
    setLoading(true);
    const [{ data: u }, { data: e }] = await Promise.all([
      supabase.from("unidades").select("*, empresas(nome_fantasia)").order("nome_unidade"),
      supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia"),
    ]);
    setUnidades((u as any[]) || []);
    setEmpresas((e as Empresa[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = unidades.filter((u) =>
    [u.nome_unidade, u.codigo_unidade, u.cidade, u.estado, (u.empresas as any)?.nome_fantasia].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const openNew = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (u: Unidade) => {
    setEditing(u);
    setForm({
      empresa_id: String(u.empresa_id), nome_unidade: u.nome_unidade,
      codigo_unidade: u.codigo_unidade || "", hostname: u.hostname || "", nome_antigo: u.nome_antigo || "",
      telefone: u.telefone || "", email: u.email || "",
      logradouro: u.logradouro || "", numero: u.numero || "", complemento: u.complemento || "",
      bairro: u.bairro || "", cidade: u.cidade || "", estado: u.estado || "",
      cep: u.cep || "", observacoes: u.observacoes || "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nome_unidade.trim() || !form.empresa_id) {
      toast({ title: "Nome e empresa são obrigatórios", variant: "destructive" }); return;
    }
    const payload = { ...form, empresa_id: Number(form.empresa_id) };
    if (editing) {
      await supabase.from("unidades").update(payload).eq("id", editing.id);
      toast({ title: "Unidade atualizada" });
    } else {
      await supabase.from("unidades").insert(payload);
      toast({ title: "Unidade cadastrada" });
    }
    setModalOpen(false);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("Remover esta unidade?")) return;
    await supabase.from("unidades").delete().eq("id", id);
    toast({ title: "Unidade removida" });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Unidades</h2>
          <p className="text-muted-foreground">Gerencie as unidades cadastradas</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nova Unidade</Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar unidade..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="w-32">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome_unidade}</TableCell>
                  <TableCell>{(u.empresas as any)?.nome_fantasia || "-"}</TableCell>
                  <TableCell>{u.cidade ? `${u.cidade}/${u.estado}` : "-"}</TableCell>
                  <TableCell>{u.telefone || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/dashboard/unidades/${u.id}`)}><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma unidade encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Unidade" : "Nova Unidade"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Empresa *</Label>
              <Select value={form.empresa_id} onValueChange={(v) => setForm({...form, empresa_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{empresas.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nome_fantasia}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nome da Unidade *</Label><Input value={form.nome_unidade} onChange={(e) => setForm({...form, nome_unidade: e.target.value})} /></div>
            <div><Label>Código</Label><Input value={form.codigo_unidade} onChange={(e) => setForm({...form, codigo_unidade: e.target.value})} /></div>
            <div><Label>Hostname (Zabbix)</Label><Input value={form.hostname} onChange={(e) => setForm({...form, hostname: e.target.value})} placeholder="Ex: 200ACL_CLAW1" /></div>
            <div><Label>Nome Antigo</Label><Input value={form.nome_antigo} onChange={(e) => setForm({...form, nome_antigo: e.target.value})} /></div>
            <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => setForm({...form, telefone: e.target.value})} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} /></div>
            <div><Label>CEP</Label><Input value={form.cep} onChange={(e) => setForm({...form, cep: e.target.value})} /></div>
            <div className="md:col-span-2"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setForm({...form, logradouro: e.target.value})} /></div>
            <div><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm({...form, numero: e.target.value})} /></div>
            <div><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setForm({...form, complemento: e.target.value})} /></div>
            <div><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm({...form, bairro: e.target.value})} /></div>
            <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({...form, cidade: e.target.value})} /></div>
            <div><Label>Estado</Label><Input value={form.estado} onChange={(e) => setForm({...form, estado: e.target.value})} maxLength={2} /></div>
            <div className="md:col-span-2"><Label>Observações</Label><Textarea value={form.observacoes} onChange={(e) => setForm({...form, observacoes: e.target.value})} /></div>
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

export default Unidades;
