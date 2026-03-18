import { useEffect, useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Plus, Pencil, Trash2, Search, Eye, Loader2, Phone, Upload } from "lucide-react";
import { ImportUnidadesModal } from "@/components/ImportUnidadesModal";
import { useCepLookup } from "@/hooks/useCepLookup";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { UnidadeLinkSection } from "@/components/UnidadeLinkSection";
import { LinkFormData, emptyLinkData, emptyChamadoData, generateLinkHostname } from "@/lib/operadoras";
import { AbrirChamadoModal } from "@/components/AbrirChamadoModal";

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
interface Operadora { id: number; nome: string; telefone?: string | null; }

const emptyForm = {
  empresa_id: "", nome_unidade: "", codigo_unidade: "",
  antiga_razao: "", contato_nome: "",
  telefone: "", email: "", email_regional: "",
  logradouro: "", numero: "", complemento: "",
  bairro: "", cidade: "", estado: "", cep: "",
  rede_default: "", wifi_antenas: false, observacoes: "",
};

const Unidades = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { canEdit, canManageUsers } = useUser();
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Unidade | null>(null);
  const [form, setForm] = useState(emptyForm);

  // Link state
  const [hostnamePrefix, setHostnamePrefix] = useState("");
  const [link1, setLink1] = useState<LinkFormData>(emptyLinkData);
  const [link2, setLink2] = useState<LinkFormData | null>(null);

  // Chamado modal state
  const [chamadoModalOpen, setChamadoModalOpen] = useState(false);
  const [chamadoUnidadeId, setChamadoUnidadeId] = useState<number | null>(null);

  // CEP lookup
  const { isLoading: cepLoading, fetchCep } = useCepLookup();

  const handleCepChange = useCallback(async (rawCep: string) => {
    const digits = rawCep.replace(/\D/g, "");
    const masked = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5, 8)}` : digits;
    setForm((prev) => ({ ...prev, cep: masked }));

    if (digits.length === 8) {
      const data = await fetchCep(digits);
      if (data) {
        setForm((prev) => ({
          ...prev,
          logradouro: data.street || prev.logradouro,
          bairro: data.neighborhood || prev.bairro,
          cidade: data.city || prev.cidade,
          estado: data.state || prev.estado,
        }));
      }
    }
  }, [fetchCep]);

  const operadorasMap = useMemo(() => {
    const map: Record<string, string> = {};
    operadoras.forEach((op) => { map[String(op.id)] = op.nome; });
    return map;
  }, [operadoras]);

  const hostname1 = useMemo(
    () => generateLinkHostname(hostnamePrefix, link1, 1, operadorasMap),
    [hostnamePrefix, link1, operadorasMap]
  );

  const hostname2 = useMemo(
    () => link2 ? generateLinkHostname(hostnamePrefix, link2, 2, operadorasMap) : "",
    [hostnamePrefix, link2, operadorasMap]
  );

  const load = async () => {
    setLoading(true);
    const [{ data: u }, { data: e }, { data: o }] = await Promise.all([
      supabase.from("unidades").select("*, empresas(nome_fantasia)").order("nome_unidade"),
      supabase.from("empresas").select("id, nome_fantasia, razao_social, cnpj").order("nome_fantasia"),
      supabase.from("operadoras").select("id, nome, telefone").order("nome"),
    ]);
    setUnidades((u as any[]) || []);
    setEmpresas((e as Empresa[]) || []);
    setOperadoras((o as Operadora[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = unidades.filter((u) =>
    [u.nome_unidade, u.codigo_unidade, u.hostname, u.cidade, u.estado, (u.empresas as any)?.nome_fantasia].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const resetLinkState = () => {
    setHostnamePrefix("");
    setLink1(emptyLinkData);
    setLink2(null);
  };

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    resetLinkState();
    setModalOpen(true);
  };

  const buildLinkFromDb = (link: any, chamadoData: any): LinkFormData => ({
    operadora_id: String(link.operadora_id),
    config_rede: link.tipo_autenticacao || "",
    tipo_link: link.tipo_link || "",
    smart_sigma: link.smart_sigma || false,
    pppoe_usuario: link.pppoe_usuario || "",
    pppoe_senha: link.pppoe_senha || "",
    ddns_enabled: !!link.ddns,
    ddns: link.ddns || "",
    ip_estatico: link.ip_estatico || "",
    mascara: link.mascara || "",
    gateway: link.gateway || "",
    chamado: {
      identificador_tipo: chamadoData?.designacao ? "designacao" : chamadoData?.cnpj_abertura ? "cnpj" : "",
      designacao: chamadoData?.designacao || "",
      cnpj_abertura: chamadoData?.cnpj_abertura || "",
    },
  });

  const openEdit = async (u: Unidade) => {
    setEditing(u);
    setForm({
      empresa_id: String(u.empresa_id), nome_unidade: u.nome_unidade,
      codigo_unidade: u.codigo_unidade || "",
      antiga_razao: u.antiga_razao || "", contato_nome: u.contato_nome || "",
      telefone: u.telefone || "", email: u.email || "", email_regional: u.email_regional || "",
      logradouro: u.logradouro || "", numero: u.numero || "", complemento: u.complemento || "",
      bairro: u.bairro || "", cidade: u.cidade || "", estado: u.estado || "",
      cep: u.cep || "", rede_default: u.rede_default || "",
      wifi_antenas: u.wifi_antenas || false, observacoes: u.observacoes || "",
    });

    // Load existing links with chamado data
    const { data: links } = await supabase
      .from("links_internet")
      .select("*, dados_abertura_chamado(*)")
      .eq("unidade_id", u.id)
      .order("id");

    if (links && links.length > 0) {
      const hostname = u.hostname || "";
      const underscoreIdx = hostname.indexOf("_");
      setHostnamePrefix(underscoreIdx > 0 ? hostname.substring(0, underscoreIdx) : hostname);

      const chamado1 = (links[0] as any).dados_abertura_chamado?.[0];
      setLink1(buildLinkFromDb(links[0], chamado1));

      if (links.length > 1) {
        const chamado2 = (links[1] as any).dados_abertura_chamado?.[0];
        setLink2(buildLinkFromDb(links[1], chamado2));
      } else {
        setLink2(null);
      }
    } else {
      resetLinkState();
    }

    setModalOpen(true);
  };

  const saveLinkAndChamado = async (linkData: LinkFormData, unitId: number) => {
    const linkPayload = {
      unidade_id: unitId,
      operadora_id: Number(linkData.operadora_id),
      tipo_autenticacao: linkData.config_rede || null,
      tipo_link: (linkData.tipo_link as any) || null,
      smart_sigma: linkData.smart_sigma,
      pppoe_usuario: linkData.config_rede === "bridge_pppoe" ? (linkData.pppoe_usuario || null) : null,
      pppoe_senha: linkData.config_rede === "bridge_pppoe" ? (linkData.pppoe_senha || null) : null,
      ddns: linkData.ddns_enabled ? (linkData.ddns || null) : null,
      ip_estatico: linkData.config_rede === "estatico" ? (linkData.ip_estatico || null) : null,
      mascara: linkData.config_rede === "estatico" ? (linkData.mascara || null) : null,
      gateway: linkData.config_rede === "estatico" ? (linkData.gateway || null) : null,
    };
    const { data: inserted } = await supabase.from("links_internet").insert(linkPayload).select("id").single();

    if (inserted && (linkData.chamado.cnpj_abertura || linkData.chamado.designacao)) {
      await supabase.from("dados_abertura_chamado").insert({
        link_id: inserted.id,
        cnpj_abertura: linkData.chamado.cnpj_abertura || null,
        designacao: linkData.chamado.designacao || null,
      });
    }
  };

  const save = async () => {
    if (!form.nome_unidade.trim() || !form.empresa_id) {
      toast({ title: "Nome e empresa são obrigatórios", variant: "destructive" }); return;
    }
    if (!link1.operadora_id) {
      toast({ title: "Link 1 (operadora) é obrigatório", variant: "destructive" }); return;
    }
    const checkIpGateway = (linkData: LinkFormData, label: string) => {
      if (linkData.config_rede === "estatico" && linkData.ip_estatico && linkData.gateway && linkData.ip_estatico.trim() === linkData.gateway.trim()) {
        toast({ title: `${label}: O IP não pode ser igual ao Gateway`, variant: "destructive" }); return false;
      }
      return true;
    };
    if (!checkIpGateway(link1, "Link 1")) return;
    if (link2 && !checkIpGateway(link2, "Link 2")) return;

    const unitPayload = {
      ...form,
      empresa_id: Number(form.empresa_id),
      hostname: hostname1 || null,
    };

    let unitId: number;

    if (editing) {
      await supabase.from("unidades").update(unitPayload).eq("id", editing.id);
      unitId = editing.id;

      // Delete existing chamado data and links
      const { data: existingLinks } = await supabase.from("links_internet").select("id").eq("unidade_id", editing.id);
      if (existingLinks) {
        for (const l of existingLinks) {
          await supabase.from("dados_abertura_chamado").delete().eq("link_id", l.id);
        }
      }
      await supabase.from("links_internet").delete().eq("unidade_id", editing.id);

      toast({ title: "Unidade atualizada" });
    } else {
      const { data: inserted, error } = await supabase.from("unidades").insert(unitPayload).select("id").single();
      if (error || !inserted) {
        toast({ title: "Erro ao cadastrar unidade", description: error?.message, variant: "destructive" }); return;
      }
      unitId = inserted.id;
      toast({ title: "Unidade cadastrada" });
    }

    // Save link 1 + chamado
    await saveLinkAndChamado(link1, unitId);

    // Save link 2 + chamado if present
    if (link2 && link2.operadora_id) {
      await saveLinkAndChamado(link2, unitId);
    }

    setModalOpen(false);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("Remover esta unidade?")) return;
    const { data: existingLinks } = await supabase.from("links_internet").select("id").eq("unidade_id", id);
    if (existingLinks) {
      for (const l of existingLinks) {
        await supabase.from("dados_abertura_chamado").delete().eq("link_id", l.id);
      }
    }
    await supabase.from("links_internet").delete().eq("unidade_id", id);
    await supabase.from("unidades").delete().eq("id", id);
    toast({ title: "Unidade removida" });
    load();
  };

  const openChamado = (unidadeId: number) => {
    setChamadoUnidadeId(unidadeId);
    setChamadoModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Unidades</h2>
          <p className="text-muted-foreground">Gerencie as unidades cadastradas</p>
        </div>
        {canEdit && (
          <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nova Unidade</Button>
        )}
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
                <TableHead className="w-40">Ações</TableHead>
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
                      <Button size="icon" variant="ghost" title="Abrir Chamado" onClick={() => openChamado(u.id)}>
                        <Phone className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => navigate(`/dashboard/unidades/${u.id}`)}><Eye className="h-4 w-4" /></Button>
                      {canEdit && (
                        <Button size="icon" variant="ghost" onClick={() => openEdit(u)}><Pencil className="h-4 w-4" /></Button>
                      )}
                      {canManageUsers && (
                        <Button size="icon" variant="ghost" onClick={() => remove(u.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      )}
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

            {/* Links de Internet */}
            <UnidadeLinkSection
              hostnamePrefix={hostnamePrefix}
              onHostnamePrefixChange={setHostnamePrefix}
              link1={link1}
              onLink1Change={setLink1}
              link2={link2}
              onLink2Change={setLink2}
              operadoras={operadoras}
              hostname1={hostname1}
              hostname2={hostname2}
            />

            <Separator />

            {/* Endereço */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">ENDEREÇO</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label>CEP</Label>
                  <div className="relative">
                    <Input
                      value={form.cep}
                      onChange={(e) => handleCepChange(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    {cepLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="md:col-span-2"><Label>Logradouro</Label><Input value={form.logradouro} onChange={(e) => setForm({...form, logradouro: e.target.value})} placeholder="Ex: Av. Lins de Vasconcelos, 1794" /></div>
                <div><Label>Número</Label><Input value={form.numero} onChange={(e) => setForm({...form, numero: e.target.value})} /></div>
                <div><Label>Complemento</Label><Input value={form.complemento} onChange={(e) => setForm({...form, complemento: e.target.value})} /></div>
                <div><Label>Bairro</Label><Input value={form.bairro} onChange={(e) => setForm({...form, bairro: e.target.value})} /></div>
                <div><Label>Cidade</Label><Input value={form.cidade} onChange={(e) => setForm({...form, cidade: e.target.value})} /></div>
                <div><Label>Estado</Label><Input value={form.estado} onChange={(e) => setForm({...form, estado: e.target.value.toUpperCase()})} maxLength={2} /></div>
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

      <AbrirChamadoModal
        open={chamadoModalOpen}
        onOpenChange={setChamadoModalOpen}
        unidadeId={chamadoUnidadeId}
      />
    </div>
  );
};

export default Unidades;
