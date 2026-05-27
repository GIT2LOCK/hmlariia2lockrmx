import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Check, Mail, Phone, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { OPERADORA_ABREVIACOES } from "@/lib/operadoras";
import { Server } from "lucide-react";

interface LinkOption {
  id: number;
  operadora_id: number;
  smart_sigma: boolean | null;
  operadora_nome: string;
  operadora_telefone: string;
  operadora_email: string;
  cnpj_abertura: string;
  designacao: string;
  razao_social_abertura: string;
  telefone_abertura: string;
  email_abertura: string;
  numero_contrato: string;
  numero_cliente: string;
}

interface UnidadeInfo {
  id: number;
  nome_unidade: string;
  antiga_razao: string | null;
  telefone: string | null;
  email: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  empresa_nome: string;
  hostname: string | null;
}

interface AbrirChamadoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: number | null;
}

export function AbrirChamadoModal({ open, onOpenChange, unidadeId }: AbrirChamadoModalProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const [unidade, setUnidade] = useState<UnidadeInfo | null>(null);
  const [links, setLinks] = useState<LinkOption[]>([]);
  const [selectedLinkId, setSelectedLinkId] = useState<string>("");
  const [observacoes, setObservacoes] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [codigoServico, setCodigoServico] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assinatura, setAssinatura] = useState("");
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);

  useEffect(() => {
    if (!user.id) return;
    supabase.from("usuarios").select("assinatura_email_url").eq("id", user.id).maybeSingle()
      .then(({ data }) => setAssinatura((data as any)?.assinatura_email_url || ""));
  }, [user.id]);

  useEffect(() => {
    if (open && unidadeId) {
      loadData(unidadeId);
    } else {
      setUnidade(null);
      setLinks([]);
      setSelectedLinkId("");
      setObservacoes("");
      setProtocolo("");
      setCodigoServico("");
    }
  }, [open, unidadeId]);

  const loadData = async (id: number) => {
    setLoading(true);
    const [{ data: u }, { data: linksData }] = await Promise.all([
      supabase.from("unidades").select("*, empresas(nome_fantasia)").eq("id", id).single(),
      supabase.from("links_internet").select("*, operadoras(nome, telefone, email), dados_abertura_chamado(*)").eq("unidade_id", id).order("id"),
    ]);

    if (u) {
      setUnidade({
        id: u.id, nome_unidade: u.nome_unidade, antiga_razao: u.antiga_razao,
        telefone: u.telefone, email: u.email, logradouro: u.logradouro,
        numero: u.numero, complemento: u.complemento, bairro: u.bairro,
        cidade: u.cidade, estado: u.estado, cep: u.cep,
        empresa_nome: (u.empresas as any)?.nome_fantasia || "",
        hostname: u.hostname,
      });
    }

    if (linksData) {
      const mapped = linksData.map((l: any) => {
        const chamado = l.dados_abertura_chamado?.[0] || {};
        return {
          id: l.id, operadora_id: l.operadora_id, smart_sigma: l.smart_sigma,
          operadora_nome: l.operadoras?.nome || "", operadora_telefone: l.operadoras?.telefone || "",
          operadora_email: l.operadoras?.email || "",
          cnpj_abertura: chamado.cnpj_abertura || "", designacao: chamado.designacao || "",
          razao_social_abertura: chamado.razao_social_abertura || "",
          telefone_abertura: chamado.telefone_abertura || "",
          email_abertura: chamado.email_abertura || "",
          numero_contrato: chamado.numero_contrato || "",
          numero_cliente: chamado.numero_cliente || "",
        };
      });
      setLinks(mapped);
      if (mapped.length === 1) setSelectedLinkId(String(mapped[0].id));
    }
    setLoading(false);
  };

  const selectedLink = links.find((l) => String(l.id) === selectedLinkId) || null;

  const getHostname = (link: LinkOption) => {
    if (!unidade?.hostname || !link.operadora_nome) return "";
    const prefix = unidade.hostname.includes("_") ? unidade.hostname.substring(0, unidade.hostname.indexOf("_")) : unidade.hostname;
    const abrev = OPERADORA_ABREVIACOES[link.operadora_nome] || "";
    if (!abrev) return "";
    const linkIndex = links.findIndex((l) => l.id === link.id) + 1;
    return `${prefix}_${abrev}W${linkIndex}${link.smart_sigma ? "S" : ""}`;
  };

  const buildEndereco = () => {
    if (!unidade) return "";
    return [
      unidade.logradouro, unidade.numero ? `Nº ${unidade.numero}` : null,
      unidade.complemento, unidade.bairro,
      unidade.cidade && unidade.estado ? `${unidade.cidade}/${unidade.estado}` : unidade.cidade,
      unidade.cep ? `CEP: ${unidade.cep}` : null,
    ].filter(Boolean).join(", ");
  };

  const generateEmail = (link: LinkOption) => {
    if (!unidade || !link.smart_sigma) return "";
    const nomeUsuario = `${user.nome}${user.sobrenome ? ` ${user.sobrenome}` : ""}`;
    const obs = observacoes.trim();
    const base = `Olá!\n\nMe chamo ${nomeUsuario}, faço parte do time de monitoramento da ${unidade.empresa_nome}. Identificamos que o link de internet ${link.operadora_nome}, da unidade ${unidade.nome_unidade}, está inoperante${obs ? `. ${obs}` : ""}, gostaríamos de abrir um chamado ao link. Segue dados do mesmo:\n\nRazão: ${unidade.antiga_razao || "-"}\nCNPJ: ${link.cnpj_abertura || "-"}\nEndereço: ${buildEndereco() || "-"}\n\nContato:\nTelefone: ${unidade.telefone || "-"}\nEmail: ${unidade.email || "-"}`;
    return obs
      ? `Olá!\n\nMe chamo ${nomeUsuario}, faço parte do time de monitoramento da ${unidade.empresa_nome}. Identificamos que o link de internet ${link.operadora_nome}, da unidade ${unidade.nome_unidade}, está inoperante. ${obs}\n\nDiante disso, gostaríamos de abrir um chamado ao link. Segue dados do mesmo:\n\nRazão: ${unidade.antiga_razao || "-"}\nCNPJ: ${link.cnpj_abertura || "-"}\nEndereço: ${buildEndereco() || "-"}\n\nContato:\nTelefone: ${unidade.telefone || "-"}\nEmail: ${unidade.email || "-"}\n\nAgradecemos a atenção e aguardamos retorno.`
      : base;
  };

  const handleCopy = async (link: LinkOption) => {
    const text = generateEmail(link);
    await navigator.clipboard.writeText(text);
    setCopiedId(link.id);
    toast({ title: "Texto copiado para a área de transferência" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSendEmail = async (link: LinkOption) => {
    if (!unidade) return;
    const message = generateEmail(link);
    if (!message) {
      toast({ title: "E-mail vazio", variant: "destructive" });
      return;
    }
    setEnviandoEmail(true);
    try {
      const attachments = assinatura
        ? [{ name: "assinatura.png", url: assinatura, inline: true }]
        : [];
      const { data, error } = await supabase.functions.invoke("send-smartsigma-webhook", {
        body: {
          empresa: unidade.empresa_nome,
          unidade: unidade.nome_unidade,
          operadora_nome: link.operadora_nome,
          operadora_email: link.operadora_email || null,
          message,
          user_email: user.email || null,
          user_nome: `${user.nome}${user.sobrenome ? ` ${user.sobrenome}` : ""}`,
          assinatura_url: assinatura || null,
          attachments,
          link_id: link.id,
          unidade_id: unidade.id,
        },
      });
      if (error) throw error;
      toast({ title: "E-mail enviado", description: (data as any)?.subject || "" });
    } catch (e: any) {
      toast({ title: "Falha ao enviar e-mail", description: e?.message || String(e), variant: "destructive" });
    } finally {
      setEnviandoEmail(false);
    }
  };

  const handleSaveChamado = async () => {
    if (!protocolo.trim()) {
      toast({ title: "Protocolo é obrigatório", variant: "destructive" });
      return;
    }
    if (!selectedLink || !unidadeId) return;

    setSaving(true);
    const nomeUsuario = `${user.nome}${user.sobrenome ? ` ${user.sobrenome}` : ""}`;
    await supabase.from("chamados" as any).insert({
      unidade_id: unidadeId,
      link_id: selectedLink.id,
      protocolo: protocolo.trim(),
      codigo_servico: codigoServico.trim() || null,
      aberto_por: nomeUsuario,
    });

    // Send webhook to N8N
    const hostname = getHostname(selectedLink);
    try {
      await supabase.functions.invoke("send-chamado-webhook", {
        body: {
          hostname: hostname || "",
          protocolo: protocolo.trim(),
          codigo_servico: codigoServico.trim() || null,
        },
      });
    } catch (e) {
      console.error("Webhook error:", e);
    }

    setSaving(false);
    toast({ title: "Chamado registrado com sucesso" });
    setProtocolo("");
    setCodigoServico("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Abrir Chamado — {unidade?.nome_unidade || ""}
          </DialogTitle>
        </DialogHeader>

        {loading && <p className="text-muted-foreground text-center py-8">Carregando...</p>}

        {!loading && links.length === 0 && (
          <p className="text-muted-foreground text-center py-8">Nenhum link encontrado para esta unidade.</p>
        )}

        {!loading && links.length > 0 && (
          <div className="space-y-4">
            {/* Link selector */}
            <div>
              <Label>Selecione o link para abrir chamado *</Label>
              <Select value={selectedLinkId} onValueChange={setSelectedLinkId}>
                <SelectTrigger><SelectValue placeholder="Selecione o link" /></SelectTrigger>
                <SelectContent>
                  {links.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      {l.operadora_nome}{l.smart_sigma ? " (SmartSigma)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedLink && (
              <Card className="border-border">
                <CardContent className="pt-4 space-y-4">
                  {/* Info block */}
                  {getHostname(selectedLink) && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Hostname Zabbix:</span>
                      <code className="bg-background px-2 py-0.5 rounded font-mono text-sm font-semibold">{getHostname(selectedLink)}</code>
                    </div>
                  )}
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Razão Social:</span> <span className="font-medium">{selectedLink.razao_social_abertura || unidade?.antiga_razao || "-"}</span></p>
                    {selectedLink.designacao && <p><span className="text-muted-foreground">Designação:</span> <span className="font-medium">{selectedLink.designacao}</span></p>}
                    {selectedLink.cnpj_abertura && <p><span className="text-muted-foreground">CNPJ:</span> <span className="font-medium">{selectedLink.cnpj_abertura}</span></p>}
                    {selectedLink.numero_contrato && <p><span className="text-muted-foreground">Nº Contrato:</span> <span className="font-medium">{selectedLink.numero_contrato}</span></p>}
                    {selectedLink.numero_cliente && <p><span className="text-muted-foreground">Nº Cliente:</span> <span className="font-medium">{selectedLink.numero_cliente}</span></p>}
                    <p><span className="text-muted-foreground">Endereço:</span> <span className="font-medium">{buildEndereco() || "-"}</span></p>
                    <p><span className="text-muted-foreground">Telefone:</span> <span className="font-medium">{selectedLink.telefone_abertura || unidade?.telefone || "-"}</span></p>
                    <p><span className="text-muted-foreground">Email:</span> <span className="font-medium">{selectedLink.email_abertura || unidade?.email || "-"}</span></p>
                    {(selectedLink.operadora_telefone || selectedLink.operadora_email) && (
                      <div className="pt-1 border-t border-border mt-2">
                        <p className="text-xs font-semibold text-muted-foreground pt-1">Contato da Operadora</p>
                        {selectedLink.operadora_telefone && <p><span className="text-muted-foreground">Telefone:</span> <span className="font-medium">{selectedLink.operadora_telefone}</span></p>}
                        {selectedLink.operadora_email && <p><span className="text-muted-foreground">Email:</span> <span className="font-medium">{selectedLink.operadora_email}</span></p>}
                      </div>
                    )}
                  </div>

                  {/* SmartSigma email section */}
                  {selectedLink.smart_sigma && (
                    <>
                      <div>
                        <Label>Observações (opcional)</Label>
                        <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} placeholder="Informações adicionais para o chamado..." />
                      </div>
                      <div className="bg-muted rounded-lg p-4">
                        <Label className="text-xs text-muted-foreground mb-2 block">Prévia do e-mail</Label>
                        <pre className="text-sm whitespace-pre-wrap font-sans text-foreground">{generateEmail(selectedLink)}</pre>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Button onClick={() => handleCopy(selectedLink)} className="w-full gap-2" variant={copiedId === selectedLink.id ? "secondary" : "outline"}>
                          {copiedId === selectedLink.id ? <><Check className="h-4 w-4" /> Copiado!</> : <><Copy className="h-4 w-4" /> Copiar texto</>}
                        </Button>
                        <Button onClick={() => handleSendEmail(selectedLink)} className="w-full gap-2" disabled={enviandoEmail}>
                          <Send className="h-4 w-4" />
                          {enviandoEmail ? "Enviando..." : "Enviar e-mail"}
                        </Button>
                      </div>
                    </>
                  )}

                  {/* Protocol + Service Code */}
                  <div className="border-t border-border pt-4 space-y-3">
                    <h4 className="text-sm font-semibold">Registrar Chamado</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label>Protocolo *</Label>
                        <Input value={protocolo} onChange={(e) => setProtocolo(e.target.value)} placeholder="Nº do protocolo" />
                      </div>
                      <div>
                        <Label>Código de Serviço</Label>
                        <Input value={codigoServico} onChange={(e) => setCodigoServico(e.target.value)} placeholder="Código de serviço (opcional)" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSaveChamado} disabled={!selectedLink || !protocolo.trim() || saving}>
            {saving ? "Salvando..." : "Registrar Chamado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
