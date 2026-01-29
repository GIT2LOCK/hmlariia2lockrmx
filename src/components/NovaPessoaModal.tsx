import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Loader2, MapPin, Phone, Mail, Building2, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCnpj } from "@/hooks/useResponsaveis";

interface NovaPessoaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (responsavelId: number, nome: string) => void;
}

interface Empresa {
  cnpj_id: number;
  razao_social: string;
  cnpj_numero: string;
}

// Funções de máscara
const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .slice(0, 14);
};

const formatPhoneMask = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2")
      .slice(0, 14);
  }
  return digits
    .replace(/^(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{1})(\d{4})(\d)/, "$1-$2-$3")
    .slice(0, 16);
};

const formatCEP = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/^(\d{5})(\d)/, "$1-$2").slice(0, 9);
};

const removeMask = (value: string) => value.replace(/\D/g, "");

export function NovaPessoaModal({ open, onOpenChange, onSuccess }: NovaPessoaModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [formData, setFormData] = useState({
    nome: "",
    cpf: "",
    rg: "",
    telefonePrincipal: "",
    telefoneAlternativo: "",
    emailPrincipal: "",
    emailAlternativo: "",
    empresaId: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    uf: "",
  });

  // Buscar empresas
  useEffect(() => {
    const fetchEmpresas = async () => {
      const { data } = await supabase
        .from("tb_cnpj")
        .select("cnpj_id, razao_social, cnpj_numero")
        .order("razao_social");

      if (data) setEmpresas(data);
    };

    if (open) {
      fetchEmpresas();
    }
  }, [open]);

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value;

    if (field === "cpf") {
      formattedValue = formatCPF(value);
    } else if (field === "telefonePrincipal" || field === "telefoneAlternativo") {
      formattedValue = formatPhoneMask(value);
    } else if (field === "cep") {
      formattedValue = formatCEP(value);
    } else if (field === "uf") {
      formattedValue = value.toUpperCase().slice(0, 2);
    }

    setFormData((prev) => ({ ...prev, [field]: formattedValue }));
  };

  const resetForm = () => {
    setFormData({
      nome: "",
      cpf: "",
      rg: "",
      telefonePrincipal: "",
      telefoneAlternativo: "",
      emailPrincipal: "",
      emailAlternativo: "",
      empresaId: "",
      cep: "",
      logradouro: "",
      numero: "",
      complemento: "",
      bairro: "",
      uf: "",
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    if (removeMask(formData.cpf).length !== 11) {
      toast.error("CPF deve ter 11 dígitos");
      return;
    }

    setIsLoading(true);

    try {
      // Verificar CPF duplicado
      const { data: existing } = await supabase
        .from("tb_responsavel")
        .select("responsavel_id")
        .eq("cpf_numero", removeMask(formData.cpf))
        .maybeSingle();

      if (existing) {
        toast.error("CPF já cadastrado");
        setIsLoading(false);
        return;
      }

      // Criar endereço se preenchido
      let endId: number | null = null;
      if (formData.logradouro && formData.bairro && formData.cep && formData.uf) {
        const { data: endData, error: endError } = await supabase
          .from("tb_endereco")
          .insert({
            logradouro: formData.logradouro,
            numero: formData.numero || null,
            complemento: formData.complemento || null,
            bairro: formData.bairro,
            cep: removeMask(formData.cep),
            uf: formData.uf,
          })
          .select("end_id")
          .single();

        if (endError) throw endError;
        endId = endData.end_id;
      }

      // Criar responsável
      const { data: respData, error: respError } = await supabase
        .from("tb_responsavel")
        .insert({
          nome: formData.nome,
          cpf_numero: removeMask(formData.cpf),
          rg: formData.rg || null,
          end_id: endId,
          telefone_principal: formData.telefonePrincipal ? removeMask(formData.telefonePrincipal) : null,
          telefone_alternativo: formData.telefoneAlternativo ? removeMask(formData.telefoneAlternativo) : null,
          email_principal: formData.emailPrincipal || null,
          email_alternativo: formData.emailAlternativo || null,
        })
        .select("responsavel_id")
        .single();

      if (respError) throw respError;

      // Criar vínculo com empresa se selecionada
      if (formData.empresaId) {
        const { error: vinculoError } = await supabase
          .from("tb_responsavel_cnpj")
          .insert({
            responsavel_id: respData.responsavel_id,
            cnpj_id: parseInt(formData.empresaId),
          });

        if (vinculoError) throw vinculoError;
      }

      toast.success("Pessoa cadastrada com sucesso!");
      onSuccess?.(respData.responsavel_id, formData.nome);
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error("Erro ao cadastrar pessoa:", error);
      toast.error(error.message || "Erro ao cadastrar pessoa");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Nova Pessoa</DialogTitle>
              <DialogDescription>
                Cadastre uma nova pessoa responsável por empresas
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção: Dados Pessoais */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Dados Pessoais</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  placeholder="Nome da pessoa"
                  value={formData.nome}
                  onChange={(e) => handleInputChange("nome", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF *</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={formData.cpf}
                  onChange={(e) => handleInputChange("cpf", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rg">RG</Label>
                <Input
                  id="rg"
                  placeholder="Número do RG"
                  value={formData.rg}
                  onChange={(e) => handleInputChange("rg", e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Seção: Contato */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Phone className="h-4 w-4" />
              <span>Contato</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefonePrincipal">Telefone Principal</Label>
                <Input
                  id="telefonePrincipal"
                  placeholder="(00) 0-0000-0000"
                  value={formData.telefonePrincipal}
                  onChange={(e) => handleInputChange("telefonePrincipal", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefoneAlternativo">Telefone Alternativo</Label>
                <Input
                  id="telefoneAlternativo"
                  placeholder="(00) 0-0000-0000"
                  value={formData.telefoneAlternativo}
                  onChange={(e) => handleInputChange("telefoneAlternativo", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emailPrincipal">E-mail Principal</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="emailPrincipal"
                    type="email"
                    placeholder="email@exemplo.com"
                    className="pl-10"
                    value={formData.emailPrincipal}
                    onChange={(e) => handleInputChange("emailPrincipal", e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emailAlternativo">E-mail Alternativo</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="emailAlternativo"
                    type="email"
                    placeholder="email@exemplo.com"
                    className="pl-10"
                    value={formData.emailAlternativo}
                    onChange={(e) => handleInputChange("emailAlternativo", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Seção: Endereço */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>Endereço</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  placeholder="00000-000"
                  value={formData.cep}
                  onChange={(e) => handleInputChange("cep", e.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="logradouro">Logradouro</Label>
                <Input
                  id="logradouro"
                  placeholder="Rua, Avenida..."
                  value={formData.logradouro}
                  onChange={(e) => handleInputChange("logradouro", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numero">Número</Label>
                <Input
                  id="numero"
                  placeholder="Nº"
                  value={formData.numero}
                  onChange={(e) => handleInputChange("numero", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="complemento">Complemento</Label>
                <Input
                  id="complemento"
                  placeholder="Apto, Sala..."
                  value={formData.complemento}
                  onChange={(e) => handleInputChange("complemento", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bairro">Bairro</Label>
                <Input
                  id="bairro"
                  placeholder="Bairro"
                  value={formData.bairro}
                  onChange={(e) => handleInputChange("bairro", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="uf">UF</Label>
                <Input
                  id="uf"
                  placeholder="SP"
                  maxLength={2}
                  value={formData.uf}
                  onChange={(e) => handleInputChange("uf", e.target.value)}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Seção: Vínculo com Empresa */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>Vínculo com Empresa</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="empresa">Empresa Responsável</Label>
              <Select
                value={formData.empresaId}
                onValueChange={(value) => handleInputChange("empresaId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((emp) => (
                    <SelectItem key={emp.cnpj_id} value={emp.cnpj_id.toString()}>
                      <div className="flex flex-col">
                        <span className="font-medium">{emp.razao_social}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatCnpj(emp.cnpj_numero)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Você pode adicionar mais vínculos depois na aba Pessoas
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                "Cadastrar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
