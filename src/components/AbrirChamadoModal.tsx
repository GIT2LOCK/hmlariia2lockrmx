import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";

interface LinkComChamado {
  id: number;
  operadora_id: number;
  smart_sigma: boolean | null;
  operadora_nome: string;
  operadora_telefone: string;
  operadora_email: string;
  cnpj_abertura: string;
  designacao: string;
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
  const [links, setLinks] = useState<LinkComChamado[]>([]);
  const [observacoes, setObservacoes] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && unidadeId) {
      loadData(unidadeId);
    } else {
      setUnidade(null);
      setLinks([]);
      setObservacoes({});
    }
  }, [open, unidadeId]);

  const loadData = async (id: number) => {
    setLoading(true);

    const [{ data: u }, { data: linksData }] = await Promise.all([
      supabase
        .from("unidades")
        .select("*, empresas(nome_fantasia)")
        .eq("id", id)
        .single(),
      supabase
        .from("links_internet")
        .select("*, operadoras(nome, telefone, email), dados_abertura_chamado(*)")
        .eq("unidade_id", id)
        .order("id"),
    ]);

    if (u) {
      setUnidade({
        id: u.id,
        nome_unidade: u.nome_unidade,
        antiga_razao: u.antiga_razao,
        telefone: u.telefone,
        email: u.email,
        logradouro: u.logradouro,
        numero: u.numero,
        complemento: u.complemento,
        bairro: u.bairro,
        cidade: u.cidade,
        estado: u.estado,
        cep: u.cep,
        empresa_nome: (u.empresas as any)?.nome_fantasia || "",
      });
    }

    if (linksData) {
      const mapped = linksData.map((l: any) => {
        const chamado = l.dados_abertura_chamado?.[0] || {};
        return {
          id: l.id,
          operadora_id: l.operadora_id,
          smart_sigma: l.smart_sigma,
          operadora_nome: l.operadoras?.nome || "",
          operadora_telefone: l.operadoras?.telefone || "",
          operadora_email: l.operadoras?.email || "",
          cnpj_abertura: chamado.cnpj_abertura || "",
          designacao: chamado.designacao || "",
        };
      });
      setLinks(mapped);
    }

    setLoading(false);
  };

  const buildEndereco = () => {
    if (!unidade) return "";
    const parts = [
      unidade.logradouro,
      unidade.numero ? `Nº ${unidade.numero}` : null,
      unidade.complemento,
      unidade.bairro,
      unidade.cidade && unidade.estado ? `${unidade.cidade}/${unidade.estado}` : unidade.cidade,
      unidade.cep ? `CEP: ${unidade.cep}` : null,
    ].filter(Boolean);
    return parts.join(", ");
  };

  const generateEmail = (link: LinkComChamado) => {
    if (!unidade) return "";
    const nomeUsuario = `${user.nome}${user.sobrenome ? ` ${user.sobrenome}` : ""}`;
    const obs = observacoes[link.id]?.trim();

    if (link.smart_sigma) {
      // SmartSigma template
      if (obs) {
        return `Olá!\n\nMe chamo ${nomeUsuario}, faço parte do time de monitoramento da ${unidade.empresa_nome}. Identificamos que o link de internet ${link.operadora_nome}, da unidade ${unidade.nome_unidade}, está inoperante. ${obs}\n\nDiante disso, gostaríamos de abrir um chamado ao link. Segue dados do mesmo:\n\nRazão: ${unidade.antiga_razao || "-"}\nCNPJ: ${link.cnpj_abertura || "-"}\nEndereço: ${buildEndereco() || "-"}\n\nContato:\nTelefone: ${unidade.telefone || "-"}\nEmail: ${unidade.email || "-"}\n\nAgradecemos a atenção e aguardamos retorno.`;
      }
      return `Olá!\n\nMe chamo ${nomeUsuario}, faço parte do time de monitoramento da ${unidade.empresa_nome}. Identificamos que o link de internet ${link.operadora_nome}, da unidade ${unidade.nome_unidade}, está inoperante, gostaríamos de abrir um chamado ao link. Segue dados do mesmo:\n\nRazão: ${unidade.antiga_razao || "-"}\nCNPJ: ${link.cnpj_abertura || "-"}\nEndereço: ${buildEndereco() || "-"}\n\nContato:\nTelefone: ${unidade.telefone || "-"}\nEmail: ${unidade.email || "-"}`;
    }

    // Non-SmartSigma: no email template, just show info card
    return "";
  };

  const handleCopy = async (link: LinkComChamado) => {
    const text = generateEmail(link);
    await navigator.clipboard.writeText(text);
    setCopiedId(link.id);
    toast({ title: "Texto copiado para a área de transferência" });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getIdentificador = (link: LinkComChamado) => {
    if (link.designacao) return { label: "Designação", value: link.designacao };
    if (link.cnpj_abertura) return { label: "CNPJ", value: link.cnpj_abertura };
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Abrir Chamado — {unidade?.nome_unidade || ""}
          </DialogTitle>
        </DialogHeader>

        {loading && <p className="text-muted-foreground text-center py-8">Carregando...</p>}

        {!loading && links.length === 0 && (
          <p className="text-muted-foreground text-center py-8">
            Nenhum link encontrado para esta unidade.
          </p>
        )}

        {!loading &&
          links.map((link) => {
            const identificador = getIdentificador(link);

            return (
              <Card key={link.id} className="border-border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">
                    LINK DE INTERNET — {link.operadora_nome}
                    {link.smart_sigma && (
                      <span className="ml-2 text-xs font-normal bg-accent text-accent-foreground px-2 py-0.5 rounded">SmartSigma</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Info block — all links */}
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Razão Social:</span> <span className="font-medium text-foreground">{unidade?.antiga_razao || "-"}</span></p>
                    {identificador && (
                      <p><span className="text-muted-foreground">{identificador.label}:</span> <span className="font-medium text-foreground">{identificador.value}</span></p>
                    )}
                    <p><span className="text-muted-foreground">Endereço:</span> <span className="font-medium text-foreground">{buildEndereco() || "-"}</span></p>
                    {(link.operadora_telefone || link.operadora_email) && (
                      <div className="pt-1 border-t border-border mt-2">
                        <p className="text-xs font-semibold text-muted-foreground pt-1">Contato da Operadora</p>
                        {link.operadora_telefone && (
                          <p><span className="text-muted-foreground">Telefone:</span> <span className="font-medium text-foreground">{link.operadora_telefone}</span></p>
                        )}
                        {link.operadora_email && (
                          <p><span className="text-muted-foreground">Email:</span> <span className="font-medium text-foreground">{link.operadora_email}</span></p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* SmartSigma: observation + email preview + copy */}
                  {link.smart_sigma && (
                    <>
                      <div>
                        <Label>Observações (opcional)</Label>
                        <Textarea
                          value={observacoes[link.id] || ""}
                          onChange={(e) =>
                            setObservacoes((prev) => ({ ...prev, [link.id]: e.target.value }))
                          }
                          rows={2}
                          placeholder="Informações adicionais para o chamado..."
                        />
                      </div>

                      <div className="bg-muted rounded-lg p-4">
                        <Label className="text-xs text-muted-foreground mb-2 block">Prévia do e-mail</Label>
                        <pre className="text-sm whitespace-pre-wrap font-sans text-foreground">
                          {generateEmail(link)}
                        </pre>
                      </div>

                      <Button
                        onClick={() => handleCopy(link)}
                        className="w-full gap-2"
                        variant={copiedId === link.id ? "secondary" : "default"}
                      >
                        {copiedId === link.id ? (
                          <><Check className="h-4 w-4" /> Copiado!</>
                        ) : (
                          <><Copy className="h-4 w-4" /> Copiar texto do chamado</>
                        )}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
      </DialogContent>
    </Dialog>
  );
}
