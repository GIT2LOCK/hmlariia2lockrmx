import { useEffect, useState, useMemo } from "react";
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
import { useUser } from "@/contexts/UserContext";
import { OPERADORA_ABREVIACOES } from "@/lib/operadoras";
import { AbrirChamadoModal } from "@/components/AbrirChamadoModal";
import { HistoricoChamadosModal } from "@/components/HistoricoChamadosModal";
import { ArrowLeft, Plus, Pencil, Trash2, Wifi, Phone, FileText, MapPin, Building, Globe, Server, Shield, Mail, Copy, Check, Eye, EyeOff, History, Send } from "lucide-react";

interface LinkInternet {
  id: number; unidade_id: number; operadora_id: number; nome_link: string | null;
  finalidade: string | null; tipo_link: string | null;
  velocidade_download: string | null; velocidade_upload: string | null;
  ip_tipo: string | null; ip_visibilidade: string | null;
  bridge: boolean | null;
  canal_atendimento: string | null; telefone_operadora: string | null;
  observacoes: string | null; smart_sigma: boolean | null;
  tipo_autenticacao: string | null; pppoe_usuario: string | null; pppoe_senha: string | null;
  ip_estatico: string | null; mascara: string | null; gateway: string | null;
  operadoras?: { nome: string; telefone: string | null; email: string | null };
  dados_abertura_chamado?: DadosChamado[];
}

interface DadosChamado {
  id: number; link_id: number;
  razao_social_abertura: string | null; cnpj_abertura: string | null;
  numero_contrato: string | null; numero_cliente: string | null;
  telefone_abertura: string | null; email_abertura: string | null;
  observacoes_abertura: string | null; designacao: string | null;
}

interface Cobertura {
  id: number; unidade_id: number; tipo: string | null; descricao: string | null;
}

interface Operadora { id: number; nome: string; telefone: string | null; email: string | null; }

const emptyLinkForm = {
  operadora_id: "", nome_link: "", finalidade: "", tipo_link: "", tipo_autenticacao: "",
  pppoe_usuario: "", pppoe_senha: "",
  ip_estatico: "", mascara: "", gateway: "",
  velocidade_download: "", velocidade_upload: "", ip_tipo: "", ip_visibilidade: "",
  bridge: false, canal_atendimento: "", telefone_operadora: "", observacoes: "",
  smart_sigma: false,
};

const emptyChamadoForm = {
  razao_social_abertura: "", cnpj_abertura: "", numero_contrato: "",
  numero_cliente: "", telefone_abertura: "", email_abertura: "", observacoes_abertura: "",
  designacao: "",
};

const emptyCoberturaForm = { tipo: "", descricao: "" };

const tipoLinkLabels: Record<string, string> = {
  banda_larga: "Banda Larga", link_dedicado: "Link Dedicado", "4g": "4G", mpls: "MPLS", radio: "Rádio",
};

const configRedeLabels: Record<string, string> = {
  bridge_pppoe: "Bridge (PPPoE)", cgnat: "CGNAT", estatico: "Estático", dhcp: "DHCP", dhcp_publico: "DHCP Público",
};

const isBridge = (tipoAuth: string | null): boolean => {
  return ["bridge_pppoe", "cgnat", "dhcp_publico"].includes(tipoAuth || "");
};

const generateHostname = (prefix: string, operadoraNome: string, linkNumber: number, smartSigma: boolean): string => {
  if (!prefix || !operadoraNome) return "";
  const abrev = OPERADORA_ABREVIACOES[operadoraNome] || "";
  if (!abrev) return "";
  return `${prefix}_${abrev}W${linkNumber}${smartSigma ? "S" : ""}`;
};

const InfoItem = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
  <div className="space-y-0.5">
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
    {mono ? (
      <p className="text-sm"><code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">{value}</code></p>
    ) : (
      <p className="text-sm font-medium">{value}</p>
    )}
  </div>
);

const PppoesenhaItem = ({ value }: { value: string }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-0.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PPPoE Senha</span>
      <div className="flex items-center gap-1.5">
        <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">
          {visible ? value : "••••••••"}
        </code>
        <button type="button" onClick={() => setVisible(!visible)} className="text-muted-foreground hover:text-foreground transition-colors">
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
};

const DdnsSenhaItem = ({ value }: { value: string }) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-0.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">DDNS Senha</span>
      <div className="flex items-center gap-1.5">
        <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">
          {visible ? value : "••••••••"}
        </code>
        <button type="button" onClick={() => setVisible(!visible)} className="text-muted-foreground hover:text-foreground transition-colors">
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
};

const UnidadeDetalhe = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { canEdit, canManageUsers, user } = useUser();

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

  // Abrir Chamado modal
  const [abrirChamadoOpen, setAbrirChamadoOpen] = useState(false);

  // Historico Chamados modal
  const [historicoOpen, setHistoricoOpen] = useState(false);

  // SmartSigma email observacoes per link
  const [emailObservacoes, setEmailObservacoes] = useState<Record<number, string>>({});
  const [copiedLinkId, setCopiedLinkId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: u }, { data: l }, { data: c }, { data: o }] = await Promise.all([
      supabase.from("unidades").select("*, empresas(nome_fantasia, cnpj, razao_social)").eq("id", Number(id)).single(),
      supabase.from("links_internet").select("*, operadoras(nome, telefone, email), dados_abertura_chamado(*)").eq("unidade_id", Number(id)).order("id"),
      supabase.from("cobertura_unidade").select("*").eq("unidade_id", Number(id)),
      supabase.from("operadoras").select("id, nome, telefone, email").order("nome"),
    ]);
    setUnidade(u);
    setLinks((l as any[]) || []);
    setCoberturas((c as Cobertura[]) || []);
    setOperadoras((o as Operadora[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Generate hostnames for display
  const hostnamePrefix = useMemo(() => {
    if (!unidade?.hostname) return "";
    const idx = unidade.hostname.indexOf("_");
    return idx > 0 ? unidade.hostname.substring(0, idx) : unidade.hostname;
  }, [unidade]);

  const linkHostnames = useMemo(() => {
    return links.map((link, idx) => {
      const nome = link.operadoras?.nome || "";
      return generateHostname(hostnamePrefix, nome, idx + 1, link.smart_sigma || false);
    });
  }, [links, hostnamePrefix]);

  // --- SmartSigma email helpers ---
  const buildEndereco = () => {
    if (!unidade) return "";
    return [
      unidade.logradouro,
      unidade.numero ? `Nº ${unidade.numero}` : null,
      unidade.complemento,
      unidade.bairro,
      unidade.cidade && unidade.estado ? `${unidade.cidade}/${unidade.estado}` : unidade.cidade,
      unidade.cep ? `CEP: ${unidade.cep}` : null,
    ].filter(Boolean).join(", ");
  };

  const generateSmartSigmaEmail = (link: LinkInternet) => {
    if (!unidade || !link.smart_sigma) return "";
    const nomeUsuario = user?.nome || "";
    const chamado = link.dados_abertura_chamado?.[0];
    const cnpj = chamado?.cnpj_abertura || "";
    const obs = emailObservacoes[link.id]?.trim();

    if (obs) {
      return `Olá!\n\nMe chamo ${nomeUsuario}, faço parte do time de monitoramento da ${unidade.empresas?.nome_fantasia || ""}. Identificamos que o link de internet ${link.operadoras?.nome || ""}, da unidade ${unidade.nome_unidade}, está inoperante. ${obs}\n\nDiante disso, gostaríamos de abrir um chamado ao link. Segue dados do mesmo:\n\nRazão: ${unidade.antiga_razao || "-"}\nCNPJ: ${cnpj || "-"}\nEndereço: ${buildEndereco() || "-"}\n\nContato:\nTelefone: ${unidade.telefone || "-"}\nEmail: ${unidade.email || "-"}\n\nAgradecemos a atenção e aguardamos retorno.`;
    }
    return `Olá!\n\nMe chamo ${nomeUsuario}, faço parte do time de monitoramento da ${unidade.empresas?.nome_fantasia || ""}. Identificamos que o link de internet ${link.operadoras?.nome || ""}, da unidade ${unidade.nome_unidade}, está inoperante, gostaríamos de abrir um chamado ao link. Segue dados do mesmo:\n\nRazão: ${unidade.antiga_razao || "-"}\nCNPJ: ${cnpj || "-"}\nEndereço: ${buildEndereco() || "-"}\n\nContato:\nTelefone: ${unidade.telefone || "-"}\nEmail: ${unidade.email || "-"}`;
  };

  const handleCopyEmail = async (link: LinkInternet) => {
    const text = generateSmartSigmaEmail(link);
    await navigator.clipboard.writeText(text);
    setCopiedLinkId(link.id);
    toast({ title: "Texto copiado para a área de transferência" });
    setTimeout(() => setCopiedLinkId(null), 2000);
  };

  const [enviandoEmailLinkId, setEnviandoEmailLinkId] = useState<number | null>(null);
  const handleSendSmartSigmaEmail = async (link: LinkInternet) => {
    if (!unidade) return;
    const message = generateSmartSigmaEmail(link);
    if (!message) {
      toast({ title: "E-mail vazio", variant: "destructive" });
      return;
    }
    setEnviandoEmailLinkId(link.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-smartsigma-webhook", {
        body: {
          empresa: unidade.empresas?.nome_fantasia || "",
          unidade: unidade.nome_unidade || "",
          operadora_nome: link.operadoras?.nome || "",
          operadora_email: link.operadoras?.email || null,
          message,
          user_email: user.email || null,
          user_nome: `${user.nome || ""}${(user as any).sobrenome ? ` ${(user as any).sobrenome}` : ""}`.trim() || null,
          link_id: link.id,
          unidade_id: unidade.id,
        },
      });
      if (error) throw error;
      toast({ title: "E-mail enviado", description: (data as any)?.subject || "" });
    } catch (e: any) {
      toast({ title: "Falha ao enviar e-mail", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setEnviandoEmailLinkId(null);
    }
  };


  // --- Link CRUD ---
  const openNewLink = () => { setEditingLink(null); setLinkForm(emptyLinkForm); setLinkModalOpen(true); };
  const openEditLink = (l: LinkInternet) => {
    setEditingLink(l);
    setLinkForm({
      operadora_id: String(l.operadora_id), nome_link: l.nome_link || "",
      finalidade: l.finalidade || "", tipo_link: l.tipo_link || "",
      tipo_autenticacao: l.tipo_autenticacao || "",
      pppoe_usuario: l.pppoe_usuario || "", pppoe_senha: l.pppoe_senha || "",
      ip_estatico: l.ip_estatico || "", mascara: l.mascara || "", gateway: l.gateway || "",
      velocidade_download: l.velocidade_download || "", velocidade_upload: l.velocidade_upload || "",
      ip_tipo: l.ip_tipo || "", ip_visibilidade: l.ip_visibilidade || "",
      bridge: l.bridge || false,
      canal_atendimento: l.canal_atendimento || "", telefone_operadora: l.telefone_operadora || "",
      observacoes: l.observacoes || "", smart_sigma: l.smart_sigma || false,
    });
    setLinkModalOpen(true);
  };

  const saveLink = async () => {
    if (!linkForm.operadora_id) { toast({ title: "Selecione a operadora", variant: "destructive" }); return; }
    const payload: any = {
      nome_link: linkForm.nome_link, velocidade_download: linkForm.velocidade_download,
      velocidade_upload: linkForm.velocidade_upload,
      canal_atendimento: linkForm.canal_atendimento, telefone_operadora: linkForm.telefone_operadora,
      observacoes: linkForm.observacoes, unidade_id: Number(id),
      operadora_id: Number(linkForm.operadora_id), bridge: linkForm.bridge,
      finalidade: linkForm.finalidade || null, tipo_link: linkForm.tipo_link || null,
      tipo_autenticacao: linkForm.tipo_autenticacao || null,
      pppoe_usuario: linkForm.tipo_autenticacao === "bridge_pppoe" ? (linkForm.pppoe_usuario || null) : null,
      pppoe_senha: linkForm.tipo_autenticacao === "bridge_pppoe" ? (linkForm.pppoe_senha || null) : null,
      ip_estatico: linkForm.tipo_autenticacao === "estatico" ? (linkForm.ip_estatico || null) : null,
      mascara: linkForm.tipo_autenticacao === "estatico" ? (linkForm.mascara || null) : null,
      gateway: linkForm.tipo_autenticacao === "estatico" ? (linkForm.gateway || null) : null,
      ip_tipo: linkForm.ip_tipo || null, ip_visibilidade: linkForm.ip_visibilidade || null,
      smart_sigma: linkForm.smart_sigma,
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
    await supabase.from("dados_abertura_chamado").delete().eq("link_id", linkId);
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
      observacoes_abertura: c.observacoes_abertura || "", designacao: c.designacao || "",
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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{unidade.nome_unidade}</h1>
          <div className="flex items-center gap-2 text-muted-foreground text-sm flex-wrap">
            <Building className="h-4 w-4" />
            <span>{unidade.empresas?.nome_fantasia}</span>
            {unidade.empresas?.cnpj && <><span>•</span><span>CNPJ: {unidade.empresas.cnpj}</span></>}
            {unidade.empresas?.razao_social && <><span>•</span><span>{unidade.empresas.razao_social}</span></>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setHistoricoOpen(true)} variant="outline" className="gap-2">
            <History className="h-4 w-4" /> Histórico
          </Button>
          <Button onClick={() => setAbrirChamadoOpen(true)} className="gap-2">
            <Phone className="h-4 w-4" /> Abrir Chamado
          </Button>
        </div>
      </div>

      {/* Dados da Unidade */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><MapPin className="h-5 w-5" /> Identificação & Contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {unidade.codigo_unidade && <InfoItem label="UDM (Código)" value={unidade.codigo_unidade} />}
            {unidade.hostname && <InfoItem label="Hostname Zabbix" value={unidade.hostname} mono />}
            {unidade.abreviacao && <InfoItem label="Abreviação" value={unidade.abreviacao} />}
            {unidade.antiga_razao && <InfoItem label="Razão Social" value={unidade.antiga_razao} />}
            {unidade.nome_antigo && <InfoItem label="Nome Antigo" value={unidade.nome_antigo} />}
            {unidade.contato_nome && <InfoItem label="Contato" value={unidade.contato_nome} />}
            {unidade.telefone && <InfoItem label="Telefone" value={unidade.telefone} />}
            {unidade.email && <InfoItem label="Email" value={unidade.email} />}
            {unidade.email_regional && <InfoItem label="Email Regional" value={unidade.email_regional} />}
            {unidade.rede_default && <InfoItem label="Rede Default" value={unidade.rede_default} mono />}
            {unidade.ddns && <InfoItem label="DDNS Host" value={unidade.ddns} mono />}
            {unidade.ddns_usuario && <InfoItem label="DDNS Usuário" value={unidade.ddns_usuario} mono />}
            {unidade.ddns_senha && (
              <DdnsSenhaItem value={unidade.ddns_senha} />
            )}
            <InfoItem label="Wi-Fi / Antenas" value={unidade.wifi_antenas ? "Sim" : "Não"} />
          </div>

          {(unidade.logradouro || unidade.cidade) && (
            <div className="p-3 bg-muted/50 rounded-md text-sm space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço</span>
              <p className="font-medium">
                {[unidade.logradouro, unidade.numero && `nº ${unidade.numero}`, unidade.complemento, unidade.bairro].filter(Boolean).join(", ")}
                {unidade.cidade && ` — ${unidade.cidade}/${unidade.estado}`}
                {unidade.cep && ` • CEP: ${unidade.cep}`}
              </p>
            </div>
          )}

          {unidade.observacoes && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Observações</span>
              <p className="text-sm text-muted-foreground">{unidade.observacoes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Links de Internet */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg"><Wifi className="h-5 w-5" /> Links de Internet</CardTitle>
          {canEdit && <Button size="sm" onClick={openNewLink} className="gap-1"><Plus className="h-3 w-3" /> Novo Link</Button>}
        </CardHeader>
        <CardContent className="space-y-6">
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum link cadastrado.</p>
          ) : links.map((link, idx) => {
            const hostname = linkHostnames[idx];
            const bridgeStatus = isBridge(link.tipo_autenticacao);
            const operadoraTel = link.operadoras?.telefone || link.telefone_operadora;
            const operadoraEmail = link.operadoras?.email;
            const chamados = link.dados_abertura_chamado || [];
            const designacao = chamados[0]?.designacao;

            return (
              <div key={link.id} className="border rounded-lg overflow-hidden">
                {/* Link Header */}
                <div className="bg-muted/30 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base">
                      {link.nome_link || `Link ${idx + 1}`}
                    </h3>
                    <Badge variant="outline" className="font-mono text-xs">
                      {link.operadoras?.nome}
                    </Badge>
                    {link.finalidade && (
                      <Badge variant={link.finalidade === "principal" ? "default" : "secondary"}>
                        {link.finalidade === "principal" ? "Principal" : "Backup"}
                      </Badge>
                    )}
                    {link.tipo_link && (
                      <Badge variant="outline">{tipoLinkLabels[link.tipo_link] || link.tipo_link}</Badge>
                    )}
                    {link.smart_sigma && (
                      <Badge variant="secondary" className="gap-1">
                        <Shield className="h-3 w-3" /> SmartSigma
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {canEdit && <Button size="icon" variant="ghost" onClick={() => openEditLink(link)}><Pencil className="h-4 w-4" /></Button>}
                    {canManageUsers && <Button size="icon" variant="ghost" onClick={() => removeLink(link.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                  </div>
                </div>

                <div className="p-4 space-y-4">
                  {/* Hostname Zabbix */}
                  {hostname && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Hostname Zabbix:</span>
                      <code className="bg-background px-2 py-0.5 rounded font-mono text-sm font-semibold">{hostname}</code>
                    </div>
                  )}

                  {/* Info Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <InfoItem label="Operadora" value={link.operadoras?.nome || "-"} />
                    {operadoraTel && <InfoItem label="Tel. Operadora" value={operadoraTel} />}
                    {operadoraEmail && <InfoItem label="Email Operadora" value={operadoraEmail} />}
                    {link.velocidade_download && <InfoItem label="Download" value={link.velocidade_download} />}
                    {link.velocidade_upload && <InfoItem label="Upload" value={link.velocidade_upload} />}
                    {link.tipo_autenticacao && <InfoItem label="Config. de Rede" value={configRedeLabels[link.tipo_autenticacao] || link.tipo_autenticacao} />}
                    <InfoItem label="Bridge" value={bridgeStatus ? "Sim" : "Não"} />
                    {link.ip_tipo && <InfoItem label="Tipo de IP" value={link.ip_tipo === "dinamico" ? "Dinâmico" : "Fixo"} />}
                    {link.ip_visibilidade && <InfoItem label="Visibilidade IP" value={link.ip_visibilidade === "publico" ? "Público" : "Privado"} />}
                    {link.tipo_autenticacao === "bridge_pppoe" && link.pppoe_usuario && (
                      <InfoItem label="PPPoE Usuário" value={link.pppoe_usuario} mono />
                    )}
                    {link.tipo_autenticacao === "bridge_pppoe" && link.pppoe_senha && (
                      <PppoesenhaItem value={link.pppoe_senha} />
                    )}
                    {link.tipo_autenticacao === "estatico" && link.ip_estatico && (
                      <InfoItem label="IP Estático" value={link.ip_estatico} mono />
                    )}
                    {link.tipo_autenticacao === "estatico" && link.mascara && (
                      <InfoItem label="Máscara" value={link.mascara} mono />
                    )}
                    {link.tipo_autenticacao === "estatico" && link.gateway && (
                      <InfoItem label="Gateway" value={link.gateway} mono />
                    )}
                    {designacao && <InfoItem label="Designação" value={designacao} mono />}
                    {link.canal_atendimento && <InfoItem label="Canal de Atendimento" value={link.canal_atendimento} />}
                  </div>

                  {link.observacoes && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Observações</span>
                      <p className="text-sm text-muted-foreground">{link.observacoes}</p>
                    </div>
                  )}

                  <Separator />

                  {/* Dados abertura chamado */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold flex items-center gap-1.5">
                        <FileText className="h-4 w-4" /> Dados para Abertura de Chamado
                      </h4>
                      {canEdit && (
                        <Button size="sm" variant="outline" onClick={() => openNewChamado(link.id)} className="gap-1 h-7 text-xs">
                          <Plus className="h-3 w-3" /> Adicionar
                        </Button>
                      )}
                    </div>
                    {chamados.length === 0 ? (
                      <div className="bg-muted/30 rounded-lg p-4 text-center">
                        <p className="text-sm text-muted-foreground mb-2">Nenhum dado para abertura de chamado cadastrado.</p>
                        {canEdit && (
                          <Button size="sm" variant="outline" onClick={() => openNewChamado(link.id)} className="gap-1">
                            <Plus className="h-3 w-3" /> Cadastrar dados de abertura
                          </Button>
                        )}
                      </div>
                    ) : chamados.map((dc) => (
                      <div key={dc.id} className="bg-muted/30 rounded-lg p-4 mb-2">
                        <div className="flex justify-between items-start">
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 flex-1 text-sm">
                            <InfoItem label="Designação" value={dc.designacao || "-"} mono={!!dc.designacao} />
                            <InfoItem label="Razão Social" value={dc.razao_social_abertura || unidade?.antiga_razao || "-"} />
                            <InfoItem label="CNPJ" value={dc.cnpj_abertura || "-"} />
                            <InfoItem label="Nº Contrato" value={dc.numero_contrato || "-"} />
                            <InfoItem label="Nº Cliente" value={dc.numero_cliente || "-"} />
                            <InfoItem label="Telefone" value={dc.telefone_abertura || unidade?.telefone || "-"} />
                            <InfoItem label="Email" value={dc.email_abertura || unidade?.email || "-"} />
                            <InfoItem label="Endereço" value={buildEndereco() || "-"} />
                          </div>
                          <div className="flex gap-1 ml-2">
                            {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditChamado(dc)}><Pencil className="h-3 w-3" /></Button>}
                            {canManageUsers && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeChamado(dc.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>}
                          </div>
                        </div>
                        {dc.observacoes_abertura && (
                          <div className="mt-3 pt-2 border-t border-border">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Observações</span>
                            <p className="text-sm text-muted-foreground mt-0.5">{dc.observacoes_abertura}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* SmartSigma Email Preview */}
                  {link.smart_sigma && (
                    <>
                      <Separator />
                      <div>
                        <h4 className="text-sm font-semibold flex items-center gap-1.5 mb-3">
                          <Mail className="h-4 w-4" /> E-mail SmartSigma
                        </h4>

                        <div className="space-y-3">
                          <div>
                            <Label className="text-xs">Observações adicionais (opcional)</Label>
                            <Textarea
                              value={emailObservacoes[link.id] || ""}
                              onChange={(e) => setEmailObservacoes((prev) => ({ ...prev, [link.id]: e.target.value }))}
                              rows={2}
                              placeholder="Informações adicionais para o chamado..."
                              className="mt-1"
                            />
                          </div>

                          <div className="bg-muted rounded-lg p-4">
                            <Label className="text-xs text-muted-foreground mb-2 block">Prévia do e-mail</Label>
                            <pre className="text-sm whitespace-pre-wrap font-sans text-foreground">
                              {generateSmartSigmaEmail(link)}
                            </pre>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Button
                              onClick={() => handleCopyEmail(link)}
                              className="w-full gap-2"
                              variant={copiedLinkId === link.id ? "secondary" : "outline"}
                            >
                              {copiedLinkId === link.id ? (
                                <><Check className="h-4 w-4" /> Copiado!</>
                              ) : (
                                <><Copy className="h-4 w-4" /> Copiar texto</>
                              )}
                            </Button>
                            <Button
                              onClick={() => handleSendSmartSigmaEmail(link)}
                              className="w-full gap-2"
                              disabled={enviandoEmailLinkId === link.id}
                            >
                              <Send className="h-4 w-4" />
                              {enviandoEmailLinkId === link.id ? "Enviando..." : "Enviar e-mail"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Cobertura / Ruas atendidas */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Ruas / Cobertura Atendida</CardTitle>
          {canManageUsers && <Button size="sm" onClick={openNewCobertura} className="gap-1"><Plus className="h-3 w-3" /> Adicionar</Button>}
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
                    {canEdit && <Button size="icon" variant="ghost" onClick={() => openEditCobertura(c)}><Pencil className="h-3 w-3" /></Button>}
                    {canManageUsers && <Button size="icon" variant="ghost" onClick={() => removeCobertura(c.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>}
                  </div>
                </div>
              ))}
            </div>
          )}
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
                  <SelectItem value="radio">Rádio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Vel. Download</Label><Input value={linkForm.velocidade_download} onChange={(e) => setLinkForm({...linkForm, velocidade_download: e.target.value})} placeholder="ex: 100 Mbps" /></div>
            <div><Label>Vel. Upload</Label><Input value={linkForm.velocidade_upload} onChange={(e) => setLinkForm({...linkForm, velocidade_upload: e.target.value})} placeholder="ex: 50 Mbps" /></div>
            <div>
              <Label>Config. de Rede</Label>
              <Select value={linkForm.tipo_autenticacao} onValueChange={(v) => setLinkForm({...linkForm, tipo_autenticacao: v})}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bridge_pppoe">Bridge (PPPoE)</SelectItem>
                  <SelectItem value="cgnat">CGNAT</SelectItem>
                  <SelectItem value="estatico">Estático</SelectItem>
                  <SelectItem value="dhcp">DHCP</SelectItem>
                  <SelectItem value="dhcp_publico">DHCP Público</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {linkForm.tipo_autenticacao === "bridge_pppoe" && (
              <>
                <div><Label>PPPoE - Usuário</Label><Input value={linkForm.pppoe_usuario} onChange={(e) => setLinkForm({...linkForm, pppoe_usuario: e.target.value})} /></div>
                <div><Label>PPPoE - Senha</Label><Input value={linkForm.pppoe_senha} onChange={(e) => setLinkForm({...linkForm, pppoe_senha: e.target.value})} /></div>
              </>
            )}
            {linkForm.tipo_autenticacao === "estatico" && (
              <>
                <div><Label>IP</Label><Input value={linkForm.ip_estatico} onChange={(e) => setLinkForm({...linkForm, ip_estatico: e.target.value})} placeholder="Ex: 192.168.1.100" /></div>
                <div><Label>Máscara</Label><Input value={linkForm.mascara} onChange={(e) => setLinkForm({...linkForm, mascara: e.target.value})} placeholder="Ex: 255.255.255.0" /></div>
                <div><Label>Gateway</Label><Input value={linkForm.gateway} onChange={(e) => setLinkForm({...linkForm, gateway: e.target.value})} placeholder="Ex: 192.168.1.1" /></div>
              </>
            )}
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
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={linkForm.smart_sigma} onCheckedChange={(v) => setLinkForm({...linkForm, smart_sigma: v})} />
              <Label>SmartSigma</Label>
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
            <div><Label>Designação</Label><Input value={chamadoForm.designacao} onChange={(e) => setChamadoForm({...chamadoForm, designacao: e.target.value})} /></div>
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

      {/* Abrir Chamado Modal */}
      <AbrirChamadoModal
        open={abrirChamadoOpen}
        onOpenChange={setAbrirChamadoOpen}
        unidadeId={unidade?.id || null}
      />

      <HistoricoChamadosModal
        open={historicoOpen}
        onOpenChange={setHistoricoOpen}
        unidadeId={unidade?.id || null}
        unidadeNome={unidade?.nome_unidade}
      />
    </div>
  );
};

export default UnidadeDetalhe;
