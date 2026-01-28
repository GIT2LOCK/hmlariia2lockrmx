import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  FileText, 
  Mail, 
  Phone,
  MapPin,
  User,
  Loader2,
  Tag,
  Hash
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

interface VisualizarEmpresaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cnpjId: number | null;
}

interface EmpresaDetalhes {
  razao_social: string;
  cnpj_numero: string;
  ccm: string | null;
  casn: string | null;
  responsavel_nome: string | null;
  agencia: string | null;
  superior_cnpj: string | null;
  categoria: string | null;
  email_principal: string | null;
  email_secundario: string | null;
  telefone_principal: string | null;
  telefone_secundario: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  uf: string | null;
}

// Função para formatar CNPJ
const formatCNPJ = (value: string | null) => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 14) return value;
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
};

// Função para formatar telefone
const formatPhone = (value: string | null) => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/^(\d{2})(\d{1})(\d{4})(\d{4})$/, "($1) $2-$3-$4");
  } else if (digits.length === 10) {
    return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  }
  return value;
};

// Função para formatar CEP
const formatCEP = (value: string | null) => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return value;
  return digits.replace(/^(\d{5})(\d{3})$/, "$1-$2");
};

export function VisualizarEmpresaModal({ open, onOpenChange, cnpjId }: VisualizarEmpresaModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [empresa, setEmpresa] = useState<EmpresaDetalhes | null>(null);

  useEffect(() => {
    const fetchEmpresa = async () => {
      if (!cnpjId || !open) return;
      
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("tb_cnpj")
          .select(`
            razao_social,
            cnpj_numero,
            ccm,
            casn,
            responsavel_nome,
            agencia,
            superior_cnpj,
            tb_categoria:cat_id(categoria),
            tb_email:email_id(email_principal, email_secundario),
            tb_numero:tel_id(telefone_principal, telefone_secundario),
            tb_endereco:end_id(cep, logradouro, numero, complemento, bairro, uf)
          `)
          .eq("cnpj_id", cnpjId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setEmpresa({
            razao_social: data.razao_social,
            cnpj_numero: data.cnpj_numero,
            ccm: data.ccm,
            casn: data.casn,
            responsavel_nome: data.responsavel_nome,
            agencia: data.agencia,
            superior_cnpj: data.superior_cnpj,
            categoria: (data.tb_categoria as any)?.categoria || null,
            email_principal: (data.tb_email as any)?.email_principal || null,
            email_secundario: (data.tb_email as any)?.email_secundario || null,
            telefone_principal: (data.tb_numero as any)?.telefone_principal || null,
            telefone_secundario: (data.tb_numero as any)?.telefone_secundario || null,
            cep: (data.tb_endereco as any)?.cep || null,
            logradouro: (data.tb_endereco as any)?.logradouro || null,
            numero: (data.tb_endereco as any)?.numero || null,
            complemento: (data.tb_endereco as any)?.complemento || null,
            bairro: (data.tb_endereco as any)?.bairro || null,
            uf: (data.tb_endereco as any)?.uf || null,
          });
        }
      } catch (error) {
        console.error("Erro ao buscar empresa:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmpresa();
  }, [cnpjId, open]);

  const InfoItem = ({ label, value, icon: Icon }: { label: string; value: string | null; icon?: any }) => (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </span>
      <span className="text-sm font-medium">
        {value || <span className="text-muted-foreground italic">Não informado</span>}
      </span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Detalhes da Empresa</DialogTitle>
              <DialogDescription>
                Visualização completa dos dados cadastrados
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Carregando...</span>
          </div>
        ) : empresa ? (
          <div className="space-y-6">
            {/* Seção: Dados da Empresa */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>Dados da Empresa</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
                <InfoItem label="Razão Social" value={empresa.razao_social} icon={Building2} />
                <InfoItem label="CNPJ" value={formatCNPJ(empresa.cnpj_numero)} icon={FileText} />
                <InfoItem label="CCM (Cadastro Municipal)" value={empresa.ccm} icon={Hash} />
                <InfoItem label="CASN" value={empresa.casn} icon={Hash} />
                <InfoItem label="Responsável" value={empresa.responsavel_nome} icon={User} />
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Categoria
                  </span>
                  {empresa.categoria ? (
                    <Badge variant="outline" className="w-fit">{empresa.categoria}</Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Não informado</span>
                  )}
                </div>
                
                {empresa.categoria === "MFA/LA" && (
                  <InfoItem label="Agência" value={empresa.agencia} icon={Building2} />
                )}
                
                {(empresa.categoria === "MFB/LU" || empresa.categoria === "LP/Consultor") && (
                  <InfoItem label="CNPJ Superior (Matriz)" value={formatCNPJ(empresa.superior_cnpj)} icon={FileText} />
                )}
              </div>
            </div>

            <Separator />

            {/* Seção: Endereço */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>Endereço</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-muted/30 p-4 rounded-lg">
                <InfoItem label="CEP" value={formatCEP(empresa.cep)} />
                <div className="md:col-span-2">
                  <InfoItem label="Logradouro" value={empresa.logradouro} />
                </div>
                <InfoItem label="Número" value={empresa.numero} />
                <InfoItem label="Complemento" value={empresa.complemento} />
                <InfoItem label="Bairro" value={empresa.bairro} />
                <InfoItem label="UF" value={empresa.uf} />
              </div>
            </div>

            <Separator />

            {/* Seção: Contato */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span>Contato</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
                <InfoItem label="Email Principal" value={empresa.email_principal} icon={Mail} />
                <InfoItem label="Email Secundário" value={empresa.email_secundario} icon={Mail} />
                <InfoItem label="Telefone Principal" value={formatPhone(empresa.telefone_principal)} icon={Phone} />
                <InfoItem label="Telefone Secundário" value={formatPhone(empresa.telefone_secundario)} icon={Phone} />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            Empresa não encontrada
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
