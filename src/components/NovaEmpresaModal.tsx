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
import { 
  Building2, 
  FileText, 
  Mail, 
  Phone,
  MapPin,
  User,
  Loader2,
  Tag
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NovaEmpresaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface Categoria {
  cat_id: number;
  categoria: string;
}

// Função para aplicar máscara de CNPJ
const formatCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .slice(0, 18);
};

// Função para aplicar máscara de telefone
const formatPhone = (value: string) => {
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

// Função para aplicar máscara de CEP
const formatCEP = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/^(\d{5})(\d)/, "$1-$2").slice(0, 9);
};

// Função para remover máscara e retornar apenas dígitos
const removeMask = (value: string) => value.replace(/\D/g, "");

export function NovaEmpresaModal({ open, onOpenChange, onSuccess }: NovaEmpresaModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [formData, setFormData] = useState({
    razaoSocial: "",
    cnpj: "",
    responsavelNome: "",
    categoriaId: "",
    agencia: "",
    superiorCnpj: "",
    emailPrincipal: "",
    emailSecundario: "",
    telefonePrincipal: "",
    telefoneSecundario: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    uf: "",
  });

  // Buscar categorias do banco
  useEffect(() => {
    const fetchCategorias = async () => {
      const { data, error } = await supabase
        .from("tb_categoria")
        .select("cat_id, categoria")
        .order("cat_id");

      if (!error && data) {
        setCategorias(data);
      }
    };

    if (open) {
      fetchCategorias();
    }
  }, [open]);

  // Determinar qual campo mostrar baseado na categoria selecionada
  const categoriaSelecionada = categorias.find(c => c.cat_id.toString() === formData.categoriaId);
  const mostrarAgencia = categoriaSelecionada?.categoria === "MFA/LA";
  const mostrarSuperiorCnpj = categoriaSelecionada?.categoria === "MFB/LU" || categoriaSelecionada?.categoria === "LP/Consultor";

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value;
    
    if (field === "cnpj" || field === "superiorCnpj") {
      formattedValue = formatCNPJ(value);
    } else if (field === "telefonePrincipal" || field === "telefoneSecundario") {
      formattedValue = formatPhone(value);
    } else if (field === "cep") {
      formattedValue = formatCEP(value);
    } else if (field === "uf") {
      formattedValue = value.toUpperCase().slice(0, 2);
    }
    
    setFormData(prev => ({ ...prev, [field]: formattedValue }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // 1. Criar registro de email
      const { data: emailData, error: emailError } = await supabase
        .from("tb_email")
        .insert({
          email_principal: formData.emailPrincipal || null,
          email_secundario: formData.emailSecundario || null,
        })
        .select("email_id")
        .single();

      if (emailError) throw emailError;

      // 2. Criar registro de telefone (salvar apenas dígitos)
      const { data: telefoneData, error: telefoneError } = await supabase
        .from("tb_numero")
        .insert({
          telefone_principal: formData.telefonePrincipal ? removeMask(formData.telefonePrincipal) : null,
          telefone_secundario: formData.telefoneSecundario ? removeMask(formData.telefoneSecundario) : null,
        })
        .select("tel_id")
        .single();

      if (telefoneError) throw telefoneError;

      // 3. Criar registro de endereço (se tiver dados)
      let enderecoId = null;
      if (formData.logradouro && formData.bairro && formData.cep && formData.uf) {
        const { data: enderecoData, error: enderecoError } = await supabase
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

        if (enderecoError) throw enderecoError;
        enderecoId = enderecoData.end_id;
      }

      // 4. Criar registro da empresa (CNPJ)
      const { data: cnpjData, error: cnpjError } = await supabase
        .from("tb_cnpj")
        .insert({
          razao_social: formData.razaoSocial,
          cnpj_numero: removeMask(formData.cnpj),
          responsavel_nome: formData.responsavelNome || null,
          cat_id: formData.categoriaId ? parseInt(formData.categoriaId) : null,
          agencia: mostrarAgencia ? formData.agencia || null : null,
          superior_cnpj: mostrarSuperiorCnpj ? removeMask(formData.superiorCnpj) || null : null,
          email_id: emailData.email_id,
          tel_id: telefoneData.tel_id,
          end_id: enderecoId,
        })
        .select("cnpj_id")
        .single();

      if (cnpjError) throw cnpjError;

      // 5. Criar entrada na tabela de relação tb_cpf_cnpj
      // Para isso, precisamos de um cpf_id. Vamos criar um registro temporário ou usar um existente
      // Por enquanto, vamos criar um CPF genérico para a empresa
      const { data: cpfData, error: cpfError } = await supabase
        .from("tb_cpf")
        .insert({
          nome: formData.responsavelNome || formData.razaoSocial,
          cpf_numero: "000.000.000-00", // CPF placeholder para empresas
        })
        .select("cpf_id")
        .single();

      if (cpfError) throw cpfError;

      // 6. Criar a relação CPF/CNPJ
      const { error: relacaoError } = await supabase
        .from("tb_cpf_cnpj")
        .insert({
          cpf_id: cpfData.cpf_id,
          cnpj_id: cnpjData.cnpj_id,
        });

      if (relacaoError) throw relacaoError;

      toast.success("Empresa cadastrada com sucesso!");
      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setFormData({
        razaoSocial: "",
        cnpj: "",
        responsavelNome: "",
        categoriaId: "",
        agencia: "",
        superiorCnpj: "",
        emailPrincipal: "",
        emailSecundario: "",
        telefonePrincipal: "",
        telefoneSecundario: "",
        cep: "",
        logradouro: "",
        numero: "",
        complemento: "",
        bairro: "",
        uf: "",
      });
    } catch (error: any) {
      console.error("Erro ao cadastrar empresa:", error);
      toast.error(error.message || "Erro ao cadastrar empresa");
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
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Nova Empresa</DialogTitle>
              <DialogDescription>
                Preencha os campos abaixo para cadastrar uma nova empresa
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção: Dados da Empresa */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              <span>Dados da Empresa</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="razaoSocial">Razão Social *</Label>
                <Input
                  id="razaoSocial"
                  placeholder="Nome da empresa"
                  value={formData.razaoSocial}
                  onChange={(e) => handleInputChange("razaoSocial", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ *</Label>
                <Input
                  id="cnpj"
                  placeholder="00.000.000/0000-00"
                  value={formData.cnpj}
                  onChange={(e) => handleInputChange("cnpj", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="responsavelNome">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Nome do Responsável
                  </div>
                </Label>
                <Input
                  id="responsavelNome"
                  placeholder="Nome do responsável pela empresa"
                  value={formData.responsavelNome}
                  onChange={(e) => handleInputChange("responsavelNome", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoria">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Categoria *
                  </div>
                </Label>
                <Select
                  value={formData.categoriaId}
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    categoriaId: value,
                    // Limpar campos quando mudar categoria
                    agencia: "",
                    superiorCnpj: ""
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat) => (
                      <SelectItem key={cat.cat_id} value={cat.cat_id.toString()}>
                        {cat.categoria}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Campo Agência - só aparece para MFA/LA */}
            {mostrarAgencia && (
              <div className="space-y-2">
                <Label htmlFor="agencia">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Agência
                  </div>
                </Label>
                <Input
                  id="agencia"
                  placeholder="Nome da agência"
                  value={formData.agencia}
                  onChange={(e) => handleInputChange("agencia", e.target.value)}
                />
              </div>
            )}

            {/* Campo CNPJ Superior - só aparece para MFB/LU e LP/Consultor */}
            {mostrarSuperiorCnpj && (
              <div className="space-y-2">
                <Label htmlFor="superiorCnpj">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    CNPJ Superior (Matriz)
                  </div>
                </Label>
                <Input
                  id="superiorCnpj"
                  placeholder="00.000.000/0000-00"
                  value={formData.superiorCnpj}
                  onChange={(e) => handleInputChange("superiorCnpj", e.target.value)}
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Seção: Contato */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>Contato</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="emailPrincipal">Email Principal</Label>
                <Input
                  id="emailPrincipal"
                  type="email"
                  placeholder="email@empresa.com"
                  value={formData.emailPrincipal}
                  onChange={(e) => handleInputChange("emailPrincipal", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="emailSecundario">Email Secundário</Label>
                <Input
                  id="emailSecundario"
                  type="email"
                  placeholder="outro@empresa.com"
                  value={formData.emailSecundario}
                  onChange={(e) => handleInputChange("emailSecundario", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="telefonePrincipal">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone Principal
                  </div>
                </Label>
                <Input
                  id="telefonePrincipal"
                  placeholder="(00) 0-0000-0000"
                  value={formData.telefonePrincipal}
                  onChange={(e) => handleInputChange("telefonePrincipal", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefoneSecundario">Telefone Secundário</Label>
                <Input
                  id="telefoneSecundario"
                  placeholder="(00) 0-0000-0000"
                  value={formData.telefoneSecundario}
                  onChange={(e) => handleInputChange("telefoneSecundario", e.target.value)}
                />
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
                  placeholder="Rua, Avenida, etc."
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
                  placeholder="123"
                  value={formData.numero}
                  onChange={(e) => handleInputChange("numero", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="complemento">Complemento</Label>
                <Input
                  id="complemento"
                  placeholder="Sala, Andar..."
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
                  value={formData.uf}
                  onChange={(e) => handleInputChange("uf", e.target.value)}
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Botões de ação */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading || !formData.razaoSocial || !formData.cnpj || !formData.categoriaId}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4 mr-2" />
                  Cadastrar Empresa
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
