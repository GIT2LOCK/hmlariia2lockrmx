import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Pencil, Trash2, Wifi, Phone, FileText, MapPin } from "lucide-react";

interface LinkInternet {
  id: number; unidade_id: number; operadora_id: number; nome_link: string | null;
  finalidade: string | null; tipo_link: string | null;
  velocidade_download: string | null; velocidade_upload: string | null;
  ip_tipo: string | null; ip_visibilidade: string | null;
  ddns: string | null; bridge: boolean | null;
  canal_atendimento: string | null; telefone_operadora: string | null;
  observacoes: string | null;
  operadoras?: { nome: string };
  dados_abertura_chamado?: DadosChamado[];
}

interface DadosChamado {
  id: number; link_id: number;
  razao_social_abertura: string | null; cnpj_abertura: string | null;
  numero_contrato: string | null; numero_cliente: string | null;
  telefone_abertura: string | null; email_abertura: string | null;
  observacoes_abertura: string | null;
}

interface Cobertura {
  id: number; unidade_id: number; tipo: string | null; descricao: string | null;
}

interface Operadora { id: number; nome: string; }

const emptyLinkForm = {
  operadora_id: "", nome_link: "", finalidade: "", tipo_link: "", tipo_autenticacao: "",
  pppoe_usuario: "", pppoe_senha: "",
  velocidade_download: "", velocidade_upload: "", ip_tipo: "", ip_visibilidade: "",
  ddns: "", bridge: false, canal_atendimento: "", telefone_operadora: "", observacoes: "",
};

const emptyChamadoForm = {
  razao_social_abertura: "", cnpj_abertura: "", numero_contrato: "",
  numero_cliente: "", telefone_abertura: "", email_abertura: "", observacoes_abertura: "",
};

const emptyCoberturaForm = { tipo: "", descricao: "" };

const tipoLinkLabels: Record<string, string> = {
  banda_larga: "Banda Larga", link_dedicado: "Link Dedicado", "4g": "4G", mpls: "MPLS",
};

const UnidadeDetalhe = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [unidade, setUnidade] = useState<any>(null);
  const [links, setLinks] = useState<LinkInternet[]>([]);
  const [coberturas, setCoberturas] = useState<Cobertura[]>([]);
  const [operadoras, setOperadoras] = useState<Operadora[]>([]);
  const [loading, setLoading] = useState(true);

  // Link modal
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkInternet | null>(null);
  const [linkForm, setLinkForm] = useState(emptyLinkForm);

  // Chamado modal
  const [chamadoModalOpen, setChamadoModalOpen] = useState(false);
  const [editingChamado, setEditingChamado] = useState<DadosChamado | null>(null);
  const [chamadoLinkId, setChamadoLinkId] = useState<number>(0);
  const [chamadoForm, setChamadoForm] = useState(emptyChamadoForm);

  // Cobertura modal
  const [coberturaModalOpen, setCoberturaModalOpen] = useState(false);
  const [editingCobertura, setEditingCobertura] = useState<Cobertura | null>(null);
  const [coberturaForm, setCoberturaForm] = useState(emptyCoberturaForm);

  const load = async () => {
    setLoading(true);
    const [{ data: u }, { data: l }, { data: c }, { data: o }] = await Promise.all([
      supabase.from("unidades").select("*, empresas(nome_fantasia, cnpj)").eq("id", Number(id)).single(),
      supabase.from("links_internet").select("*, operadoras(nome), dados_abertura_chamado(*)").eq("unidade_id", Number(id)).order("id"),
      supabase.from("cobertura_unidade").select("*").eq("unidade_id", Number(id)),
      supabase.from("operadoras").select("id, nome").order("nome"),
    ]);
    setUnidade(u);
    setLinks((l as any[]) || []);
    setCoberturas((c as Cobertura[]) || []);
    setOperadoras((o as Operadora[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // --- Link CRUD ---
  const openNewLink = () => { setEditingLink(null); setLinkForm(emptyLinkForm); setLinkModalOpen(true); };
  const openEditLink = (l: LinkInternet) => {
    setEditingLink(l);
    setLinkForm({
      operadora_id: String(l.operadora_id), nome_link: l.nome_link || "",
      finalidade: l.finalidade || "", tipo_link: l.tipo_link || "",
      tipo_autenticacao: (l as any).tipo_autenticacao || "",
      pppoe_usuario: (l as any).pppoe_usuario || "", pppoe_senha: (l as any).pppoe_senha || "",
      velocidade_download: l.velocidade_download || "", velocidade_upload: l.velocidade_upload || "",
      ip_tipo: l.ip_tipo || "", ip_visibilidade: l.ip_visibilidade || "",
      ddns: l.ddns || "", bridge: l.bridge || false,
      canal_atendimento: l.canal_atendimento || "", telefone_operadora: l.telefone_operadora || "",
      observacoes: l.observacoes || "",
    });
    setLinkModalOpen(true);
  };

  const saveLink = async () => {
    if (!linkForm.operadora_id) { toast({ title: "Selecione a operadora", variant: "destructive" }); return; }
    const payload: any = {
      nome_link: linkForm.nome_link, velocidade_download: linkForm.velocidade_download,
      velocidade_upload: linkForm.velocidade_upload, ddns: linkForm.ddns,
      canal_atendimento: linkForm.canal_atendimento, telefone_operadora: linkForm.telefone_operadora,
      observacoes: linkForm.observacoes, unidade_id: Number(id),
      operadora_id: Number(linkForm.operadora_id), bridge: linkForm.bridge,
      finalidade: linkForm.finalidade || null, tipo_link: linkForm.tipo_link || null,
      tipo_autenticacao: linkForm.tipo_autenticacao || null,
      pppoe_usuario: linkForm.tipo_autenticacao === "PPPoE" ? (linkForm.pppoe_usuario || null) : null,
      pppoe_senha: linkForm.tipo_autenticacao === "PPPoE" ? (linkForm.pppoe_senha || null) : null,
      ip_tipo: linkForm.ip_tipo || null, ip_visibilidade: linkForm.ip_visibilidade || null,
    };
    if (editingLink) {
      await supabase.from("links_internet").update(payload).eq("id", editingLink.id);
      toast({ title: "Link atualizado" });
    } else {
      await supabase.from("links_internet").insert(payload);
      toast({ title: "Link cadastrado" });
    }
    setLinkModalOpen(false); load();
  };

  const removeLink = async (linkId: number) => {
    if (!confirm("Remover este link?")) return;
    await supabase.from("links_internet").delete().eq("id", linkId);
    toast({ title: "Link removido" }); load();
  };

  // --- Chamado CRUD ---
  const openNewChamado = (linkId: number) => {
    setEditingChamado(null); setChamadoLinkId(linkId); setChamadoForm(emptyChamadoForm); setChamadoModalOpen(true);
  };
  const openEditChamado = (c: DadosChamado) => {
    setEditingChamado(c); setChamadoLinkId(c.link_id);
    setChamadoForm({
      razao_social_abertura: c.razao_social_abertura || "", cnpj_abertura: c.cnpj_abertura || "",
      numero_contrato: c.numero_contrato || "", numero_cliente: c.numero_cliente || "",
      telefone_abertura: c.telefone_abertura || "", email_abertura: c.email_abertura || "",
      observacoes_abertura: c.observacoes_abertura || "",
    });
    setChamadoModalOpen(true);
  };

  const saveChamado = async () => {
    const payload = { ...chamadoForm, link_id: chamadoLinkId };
    if (editingChamado) {
      await supabase.from("dados_abertura_chamado").update(payload).eq("id", editingChamado.id);
      toast({ title: "Dados atualizados" });
    } else {
      await supabase.from("dados_abertura_chamado").insert(payload);
      toast({ title: "Dados cadastrados" });
    }
    setChamadoModalOpen(false); load();
  };

  const removeChamado = async (chamadoId: number) => {
    if (!confirm("Remover dados de abertura?")) return;
    await supabase.from("dados_abertura_chamado").delete().eq("id", chamadoId);
    toast({ title: "Dados removidos" }); load();
  };

  // --- Cobertura CRUD ---
  const openNewCobertura = () => { setEditingCobertura(null); setCoberturaForm(emptyCoberturaForm); setCoberturaModalOpen(true); };
  const openEditCobertura = (c: Cobertura) => {
    setEditingCobertura(c);
    setCoberturaForm({ tipo: c.tipo || "", descricao: c.descricao || "" });
    setCoberturaModalOpen(true);
  };
  const saveCobertura = async () => {
    const payload = { ...coberturaForm, unidade_id: Number(id) };
    if (editingCobertura) {
      await supabase.from("cobertura_unidade").update(payload).eq("id", editingCobertura.id);
    } else {
      await supabase.from("cobertura_unidade").insert(payload);
    }
    toast({ title: "Cobertura salva" }); setCoberturaModalOpen(false); load();
  };
  const removeCobertura = async (cId: number) => {
    if (!confirm("Remover?")) return;
    await supabase.from("cobertura_unidade").delete().eq("id", cId);
    toast({ title: "Removida" }); load();
  };

  if (loading) return <div className="p-6">Carregando...</div>;
  if (!unidade) return <div className="p-6">Unidade não encontrada.</div>;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/dashboard/unidades")} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{unidade.nome_unidade}</h1>
        <p className="text-muted-foreground">{unidade.empresas?.nome_fantasia} {unidade.empresas?.cnpj ? `• CNPJ: ${unidade.empresas.cnpj}` : ""}</p>
      </div>

      {/* Dados da Unidade */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Dados da Unidade</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            {unidade.codigo_unidade && <div><span className="font-medium text-muted-foreground">UDM:</span> {unidade.codigo_unidade}</div>}
            {unidade.abreviacao && <div><span className="font-medium text-muted-foreground">Abreviação:</span> {unidade.abreviacao}</div>}
            {unidade.hostname && <div><span className="font-medium text-muted-foreground">Hostname (Zabbix):</span> <code className="bg-muted px-1 rounded font-mono text-xs">{unidade.hostname}</code></div>}
            {unidade.nome_antigo && <div><span className="font-medium text-muted-foreground">Nome Antigo:</span> {unidade.nome_antigo}</div>}
            {unidade.antiga_razao && <div><span className="font-medium text-muted-foreground">Antiga Razão:</span> {unidade.antiga_razao}</div>}
            {unidade.rede_default && <div><span className="font-medium text-muted-foreground">Rede Default:</span> <code className="bg-muted px-1 rounded font-mono text-xs">{unidade.rede_default}</code></div>}
            {unidade.wifi_antenas && <div><span className="font-medium text-muted-foreground">Wi-Fi/Antenas:</span> Sim</div>}
            {unidade.contato_nome && <div><span className="font-medium text-muted-foreground">Contato:</span> {unidade.contato_nome}</div>}
            {unidade.telefone && <div><span className="font-medium text-muted-foreground">Telefone:</span> {unidade.telefone}</div>}
            {unidade.email && <div><span className="font-medium text-muted-foreground">Email:</span> {unidade.email}</div>}
            {unidade.email_regional && <div><span className="font-medium text-muted-foreground">Email Regional:</span> {unidade.email_regional}</div>}
          </div>
          {(unidade.logradouro || unidade.cidade) && (
            <div className="mt-4 p-3 bg-muted/50 rounded-md text-sm">
              <span className="font-medium">Endereço: </span>
              {[unidade.logradouro, unidade.numero, unidade.complemento, unidade.bairro].filter(Boolean).join(", ")}
              {unidade.cidade && ` - ${unidade.cidade}/${unidade.estado}`}
              {unidade.cep && ` • CEP: ${unidade.cep}`}
            </div>
          )}
          {unidade.observacoes && <p className="mt-3 text-sm text-muted-foreground">{unidade.observacoes}</p>}
        </CardContent>
      </Card>

      {/* Cobertura / Ruas atendidas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Ruas / Cobertura Atendida</CardTitle>
          <Button size="sm" onClick={openNewCobertura} className="gap-1"><Plus className="h-3 w-3" /> Adicionar</Button>
        </CardHeader>
        <CardContent>
          {coberturas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma cobertura cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {coberturas.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-2 border rounded">
                  <div><Badge variant="secondary">{c.tipo || "Geral"}</Badge> <span className="ml-2 text-sm">{c.descricao}</span></div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEditCobertura(c)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => removeCobertura(c.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Links de Internet */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Wifi className="h-5 w-5" /> Links de Internet</CardTitle>
          <Button size="sm" onClick={openNewLink} className="gap-1"><Plus className="h-3 w-3" /> Novo Link</Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum link cadastrado.</p>
          ) : links.map((link) => (
            <div key={link.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{link.nome_link || link.operadoras?.nome || "Link"}</h3>
                  {link.finalidade && <Badge variant={link.finalidade === "principal" ? "default" : "secondary"}>{link.finalidade}</Badge>}
                  {link.tipo_link && <Badge variant="outline">{tipoLinkLabels[link.tipo_link] || link.tipo_link}</Badge>}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEditLink(link)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => removeLink(link.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted-foreground">Operadora:</span> {link.operadoras?.nome}</div>
                {link.velocidade_download && <div><span className="text-muted-foreground">Download:</span> {link.velocidade_download}</div>}
                {link.velocidade_upload && <div><span className="text-muted-foreground">Upload:</span> {link.velocidade_upload}</div>}
                {link.ip_tipo && <div><span className="text-muted-foreground">IP:</span> {link.ip_tipo} / {link.ip_visibilidade}</div>}
                {(link as any).tipo_autenticacao && <div><span className="text-muted-foreground">Tipo Link:</span> {(link as any).tipo_autenticacao}</div>}
                {(link as any).tipo_autenticacao === "PPPoE" && (link as any).pppoe_usuario && <div><span className="text-muted-foreground">PPPoE User:</span> <code className="bg-muted px-1 rounded font-mono text-xs">{(link as any).pppoe_usuario}</code></div>}
                {link.ddns && <div><span className="text-muted-foreground">DDNS:</span> {link.ddns}</div>}
                <div><span className="text-muted-foreground">Bridge:</span> {link.bridge ? "Sim" : "Não"}</div>
                {link.canal_atendimento && <div><span className="text-muted-foreground">Canal:</span> {link.canal_atendimento}</div>}
                {link.telefone_operadora && <div><span className="text-muted-foreground">Tel Operadora:</span> {link.telefone_operadora}</div>}
              </div>
              {link.observacoes && <p className="text-sm text-muted-foreground">{link.observacoes}</p>}

              <Separator />

              {/* Dados abertura chamado */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold flex items-center gap-1"><FileText className="h-4 w-4" /> Dados para Abertura de Chamado</h4>
                  <Button size="sm" variant="outline" onClick={() => openNewChamado(link.id)} className="gap-1 h-7 text-xs"><Plus className="h-3 w-3" /> Adicionar</Button>
                </div>
                {(!link.dados_abertura_chamado || link.dados_abertura_chamado.length === 0) ? (
                  <p className="text-xs text-muted-foreground">Nenhum dado cadastrado.</p>
                ) : link.dados_abertura_chamado.map((dc) => (
                  <div key={dc.id} className="bg-muted/30 rounded p-3 text-sm space-y-1 mb-2">
                    <div className="flex justify-between">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 flex-1">
                        {dc.razao_social_abertura && <div><span className="text-muted-foreground">Razão Social:</span> {dc.razao_social_abertura}</div>}
                        {dc.cnpj_abertura && <div><span className="text-muted-foreground">CNPJ:</span> {dc.cnpj_abertura}</div>}
                        {dc.numero_contrato && <div><span className="text-muted-foreground">Contrato:</span> {dc.numero_contrato}</div>}
                        {dc.numero_cliente && <div><span className="text-muted-foreground">Nº Cliente:</span> {dc.numero_cliente}</div>}
                        {dc.telefone_abertura && <div><span className="text-muted-foreground">Telefone:</span> {dc.telefone_abertura}</div>}
                        {dc.email_abertura && <div><span className="text-muted-foreground">Email:</span> {dc.email_abertura}</div>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEditChamado(dc)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeChamado(dc.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </div>
                    {dc.observacoes_abertura && <p className="text-xs text-muted-foreground">{dc.observacoes_abertura}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Link Modal */}
      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingLink ? "Editar Link" : "Novo Link de Internet"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Operadora *</Label>
              <Select value={linkForm.operadora_id} onValueChange={(v) => setLinkForm({...linkForm, operadora_id: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{operadoras.map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Nome do Link</Label><Input value={linkForm.nome_link} onChange={(e) => setLinkForm({...linkForm, nome_link: e.target.value})} /></div>
            <div>
              <Label>Finalidade</Label>
              <Select value={linkForm.finalidade} onValueChange={(v) => setLinkForm({...linkForm, finalidade: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="principal">Principal</SelectItem>
                  <SelectItem value="backup">Backup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo do Link</Label>
              <Select value={linkForm.tipo_link} onValueChange={(v) => setLinkForm({...linkForm, tipo_link: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="banda_larga">Banda Larga</SelectItem>
                  <SelectItem value="link_dedicado">Link Dedicado</SelectItem>
                  <SelectItem value="4g">4G</SelectItem>
                  <SelectItem value="mpls">MPLS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Vel. Download</Label><Input value={linkForm.velocidade_download} onChange={(e) => setLinkForm({...linkForm, velocidade_download: e.target.value})} placeholder="ex: 100 Mbps" /></div>
            <div>
              <Label>Tipo de Conexão</Label>
              <Select value={linkForm.tipo_conexao} onValueChange={(v) => setLinkForm({...linkForm, tipo_conexao: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DHCP">DHCP</SelectItem>
                  <SelectItem value="PPPoE">PPPoE</SelectItem>
                  <SelectItem value="Estático">Estático</SelectItem>
                  <SelectItem value="IPoE">IPoE</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Vel. Upload</Label><Input value={linkForm.velocidade_upload} onChange={(e) => setLinkForm({...linkForm, velocidade_upload: e.target.value})} placeholder="ex: 50 Mbps" /></div>
            <div>
              <Label>Tipo de IP</Label>
              <Select value={linkForm.ip_tipo} onValueChange={(v) => setLinkForm({...linkForm, ip_tipo: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinamico">Dinâmico</SelectItem>
                  <SelectItem value="fixo">Fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Visibilidade IP</Label>
              <Select value={linkForm.ip_visibilidade} onValueChange={(v) => setLinkForm({...linkForm, ip_visibilidade: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="publico">Público</SelectItem>
                  <SelectItem value="privado">Privado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>DDNS</Label><Input value={linkForm.ddns} onChange={(e) => setLinkForm({...linkForm, ddns: e.target.value})} /></div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={linkForm.bridge as boolean} onCheckedChange={(v) => setLinkForm({...linkForm, bridge: v})} />
              <Label>Bridge</Label>
            </div>
            <div><Label>Canal de Atendimento</Label><Input value={linkForm.canal_atendimento} onChange={(e) => setLinkForm({...linkForm, canal_atendimento: e.target.value})} /></div>
            <div><Label>Tel. Operadora</Label><Input value={linkForm.telefone_operadora} onChange={(e) => setLinkForm({...linkForm, telefone_operadora: e.target.value})} /></div>
            <div className="md:col-span-2"><Label>Observações</Label><Textarea value={linkForm.observacoes} onChange={(e) => setLinkForm({...linkForm, observacoes: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveLink}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chamado Modal */}
      <Dialog open={chamadoModalOpen} onOpenChange={setChamadoModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingChamado ? "Editar Dados" : "Dados para Abertura de Chamado"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Razão Social</Label><Input value={chamadoForm.razao_social_abertura} onChange={(e) => setChamadoForm({...chamadoForm, razao_social_abertura: e.target.value})} /></div>
            <div><Label>CNPJ</Label><Input value={chamadoForm.cnpj_abertura} onChange={(e) => setChamadoForm({...chamadoForm, cnpj_abertura: e.target.value})} /></div>
            <div><Label>Nº Contrato</Label><Input value={chamadoForm.numero_contrato} onChange={(e) => setChamadoForm({...chamadoForm, numero_contrato: e.target.value})} /></div>
            <div><Label>Nº Cliente</Label><Input value={chamadoForm.numero_cliente} onChange={(e) => setChamadoForm({...chamadoForm, numero_cliente: e.target.value})} /></div>
            <div><Label>Telefone</Label><Input value={chamadoForm.telefone_abertura} onChange={(e) => setChamadoForm({...chamadoForm, telefone_abertura: e.target.value})} /></div>
            <div><Label>Email</Label><Input value={chamadoForm.email_abertura} onChange={(e) => setChamadoForm({...chamadoForm, email_abertura: e.target.value})} /></div>
            <div><Label>Observações</Label><Textarea value={chamadoForm.observacoes_abertura} onChange={(e) => setChamadoForm({...chamadoForm, observacoes_abertura: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChamadoModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveChamado}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cobertura Modal */}
      <Dialog open={coberturaModalOpen} onOpenChange={setCoberturaModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCobertura ? "Editar Cobertura" : "Nova Cobertura"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Tipo</Label><Input value={coberturaForm.tipo} onChange={(e) => setCoberturaForm({...coberturaForm, tipo: e.target.value})} placeholder="ex: Rua, Avenida" /></div>
            <div><Label>Descrição</Label><Textarea value={coberturaForm.descricao} onChange={(e) => setCoberturaForm({...coberturaForm, descricao: e.target.value})} placeholder="ex: Rua das Flores, 100 a 500" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoberturaModalOpen(false)}>Cancelar</Button>
            <Button onClick={saveCobertura}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UnidadeDetalhe;
