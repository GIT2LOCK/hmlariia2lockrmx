import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Eye } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";

interface Unidade {
  id: number; empresa_id: number; nome_unidade: string; codigo_unidade: string | null;
  hostname: string | null; abreviacao: string | null; nome_antigo: string | null; antiga_razao: string | null;
  telefone: string | null; email: string | null; email_regional: string | null; contato_nome: string | null;
  cidade: string | null; estado: string | null; logradouro: string | null; numero: string | null;
  bairro: string | null; cep: string | null; complemento: string | null;
  rede_default: string | null; wifi_antenas: boolean | null; observacoes: string | null;
  empresas?: { nome_fantasia: string };
}

interface Empresa { id: number; nome_fantasia: string; razao_social: string | null; cnpj: string | null; }

const emptyForm = {
  empresa_id: "", nome_unidade: "", codigo_unidade: "", hostname: "",
  antiga_razao: "", contato_nome: "",
  telefone: "", email: "", email_regional: "",
  logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", estado: "", cep: "",
  rede_default: "", wifi_antenas: false, observacoes: "",
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
      supabase.from("empresas").select("id, nome_fantasia, razao_social, cnpj").order("nome_fantasia"),
    ]);
    setUnidades((u as any[]) || []);
    setEmpresas((e as Empresa[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = unidades.filter((u) =>
    [u.nome_unidade, u.codigo_unidade, u.hostname, u.abreviacao, u.cidade, u.estado, (u.empresas as any)?.nome_fantasia].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const openNew = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (u: Unidade) => {
    setEditing(u);
    setForm({
      empresa_id: String(u.empresa_id), nome_unidade: u.nome_unidade,
      codigo_unidade: u.codigo_unidade || "", hostname: u.hostname || "",
      antiga_razao: u.antiga_razao || "", contato_nome: u.contato_nome || "",
      telefone: u.telefone || "", email: u.email || "", email_regional: u.email_regional || "",
      logradouro: u.logradouro || "", numero: u.numero || "", complemento: u.complemento || "",
      bairro: u.bairro || "", cidade: u.cidade || "", estado: u.estado || "",
      cep: u.cep || "", rede_default: u.rede_default || "",
      wifi_antenas: u.wifi_antenas || false, observacoes: u.observacoes || "",
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
                <TableHead>UDM</TableHead>
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
                  <TableCell className="font-mono text-xs">{u.codigo_unidade || "-"}</TableCell>
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
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma unidade encontrada</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar Unidade" : "Nova Unidade"}</DialogTitle></DialogHeader>
          <div className="space-y-6">
            {/* Identificação */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">IDENTIFICAÇÃO</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="md:col-span-2 lg:col-span-3">
                  <Label>Empresa *</Label>
                  <Select value={form.empresa_id} onValueChange={(v) => setForm({...form, empresa_id: v})}>
                    <SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger>
                    <SelectContent>{empresas.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.nome_fantasia} {e.cnpj ? `(${e.cnpj})` : ""}
                      </SelectItem>
                    ))}</SelectContent>
                  </Select>
                </div>
                <div><Label>UDM (Código) *</Label><Input value={form.codigo_unidade} onChange={(e) => setForm({...form, codigo_unidade: e.target.value})} placeholder="Ex: GS-UDM-ACLIMACAO" /></div>
                <div><Label>Nome da Unidade *</Label><Input value={form.nome_unidade} onChange={(e) => setForm({...form, nome_unidade: e.target.value})} placeholder="Ex: ACLIMAÇÃO" /></div>
                <div><Label>Razão Social</Label><Input value={form.antiga_razao} onChange={(e) => setForm({...form, antiga_razao: e.target.value})} /></div>
                
              </div>
            </div>

            <Separator />

            {/* Endereço */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">ENDEREÇO</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><Label>CEP</Label><Input value={form.cep} onChange={(e) => setForm({...form, cep: e.target.value})} /></div>
                <div className="md:col-span-2"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setForm({...form, logradouro: e.target.value})} placeholder="Ex: Av. Lins de Vasconcelos, 1794" /></div>
                <div><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm({...form, numero: e.target.value})} /></div>
                <div><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setForm({...form, complemento: e.target.value})} /></div>
                <div><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm({...form, bairro: e.target.value})} /></div>
                <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({...form, cidade: e.target.value})} /></div>
                <div><Label>Estado</Label><Input value={form.estado} onChange={(e) => setForm({...form, estado: e.target.value.toUpperCase()})} maxLength={2} /></div>
              </div>
            </div>

            <Separator />

            {/* Rede & Infra */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">REDE & INFRAESTRUTURA</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><Label>Rede Default</Label><Input value={form.rede_default} onChange={(e) => setForm({...form, rede_default: e.target.value})} placeholder="Ex: 10.156.100.0/23" /></div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch checked={form.wifi_antenas as boolean} onCheckedChange={(v) => setForm({...form, wifi_antenas: v})} />
                  <Label>Wi-Fi / Antenas</Label>
                </div>
              </div>
            </div>

            <Separator />

            {/* Contato */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">CONTATO</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div><Label>Nome do Contato</Label><Input value={form.contato_nome} onChange={(e) => setForm({...form, contato_nome: e.target.value})} /></div>
                <div><Label>Telefone / Celular</Label><Input value={form.telefone} onChange={(e) => setForm({...form, telefone: e.target.value})} placeholder="Ex: 551150804663" /></div>
                <div><Label>E-mail</Label><Input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} placeholder="Ex: aclimacao@goodstorage.com.br" /></div>
                <div><Label>E-mail Regional</Label><Input value={form.email_regional} onChange={(e) => setForm({...form, email_regional: e.target.value})} /></div>
              </div>
            </div>

            <Separator />

            {/* Observações */}
            <div>
              <Label>Observações</Label>
              <Textarea value={form.observacoes} onChange={(e) => setForm({...form, observacoes: e.target.value})} rows={3} />
            </div>
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
