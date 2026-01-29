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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { 
  Building2, 
  FileText, 
  Mail, 
  Phone,
  MapPin,
  User,
  Loader2,
  Tag,
  Check,
  ChevronsUpDown,
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NovaPessoaModal } from "./NovaPessoaModal";
import { formatCpf } from "@/hooks/useResponsaveis";
import { 
  validateCnpj, 
  formatCnpjMask, 
  formatPhoneMask, 
  formatCepMask, 
  removeMask 
} from "@/lib/validators";

interface NovaEmpresaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface Categoria {
  cat_id: number;
  categoria: string;
}

interface EmpresaSuperior {
  cnpj_id: number;
  razao_social: string;
  cnpj_numero: string;
}

interface Responsavel {
  responsavel_id: number;
  nome: string;
  cpf_numero: string;
}

export function NovaEmpresaModal({ open, onOpenChange, onSuccess }: NovaEmpresaModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [empresasSuperiores, setEmpresasSuperiores] = useState<EmpresaSuperior[]>([]);
  const [responsaveis, setResponsaveis] = useState<Responsavel[]>([]);
  const [responsavelOpen, setResponsavelOpen] = useState(false);
  const [novaPessoaModalOpen, setNovaPessoaModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    razaoSocial: "",
    cnpj: "",
    ccm: "",
    casn: "",
    responsavelId: "",
    categoriaId: "",
    agencia: "",
    superiorCnpjId: "",
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
  const [emailErrors, setEmailErrors] = useState({
    emailPrincipal: "",
    emailSecundario: "",
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

  // Buscar responsáveis do banco
  const fetchResponsaveis = async () => {
    const { data, error } = await supabase
      .from("tb_responsavel")
      .select("responsavel_id, nome, cpf_numero")
      .order("nome");

    if (!error && data) {
      setResponsaveis(data);
    }
  };

  useEffect(() => {
    if (open) {
      fetchResponsaveis();
    }
  }, [open]);

  // Obter responsável selecionado
  const responsavelSelecionado = responsaveis.find(r => r.responsavel_id.toString() === formData.responsavelId);

  // Determinar qual campo mostrar baseado na categoria selecionada
  const categoriaSelecionada = categorias.find(c => c.cat_id.toString() === formData.categoriaId);
  const mostrarAgencia = categoriaSelecionada?.categoria === "MFA/LA";
  const mostrarSuperiorImediato = categoriaSelecionada?.categoria === "MFB/LU" || categoriaSelecionada?.categoria === "LP/Consultor";

  // Determinar quais categorias buscar para o dropdown de Superior Imediato
  // MFB/LU pode se vincular a MFA/LA
  // LP/Consultor pode se vincular a MFA/LA ou MFB/LU
  const getCategoriasSuperiores = () => {
    if (categoriaSelecionada?.categoria === "MFB/LU") return ["MFA/LA"];
    if (categoriaSelecionada?.categoria === "LP/Consultor") return ["MFA/LA", "MFB/LU"];
    return [];
  };

  // Buscar empresas superiores quando a categoria mudar
  useEffect(() => {
    const fetchEmpresasSuperiores = async () => {
      const categoriasFiltro = getCategoriasSuperiores();
      if (categoriasFiltro.length === 0) {
        setEmpresasSuperiores([]);
        return;
      }

      // Buscar os cat_ids das categorias superiores
      const catIds = categorias
        .filter(c => categoriasFiltro.includes(c.categoria))
        .map(c => c.cat_id);
      
      if (catIds.length === 0) return;

      const { data, error } = await supabase
        .from("tb_cnpj")
        .select("cnpj_id, razao_social, cnpj_numero")
        .in("cat_id", catIds)
        .order("razao_social");

      if (!error && data) {
        setEmpresasSuperiores(data);
      }
    };

    fetchEmpresasSuperiores();
  }, [formData.categoriaId, categorias]);

  const validateEmail = (email: string): boolean => {
    if (!email) return true; // Empty is valid (not required)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailBlur = (field: "emailPrincipal" | "emailSecundario") => {
    const value = formData[field];
    if (value && !validateEmail(value)) {
      setEmailErrors(prev => ({ ...prev, [field]: "E-mail inválido" }));
    } else {
      setEmailErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const handleInputChange = (field: string, value: string) => {
    let formattedValue = value;
    
    if (field === "cnpj") {
      formattedValue = formatCnpjMask(value);
    } else if (field === "telefonePrincipal" || field === "telefoneSecundario") {
      formattedValue = formatPhoneMask(value);
    } else if (field === "cep") {
      formattedValue = formatCepMask(value);
    } else if (field === "uf") {
      formattedValue = value.toUpperCase().slice(0, 2);
    } else if (field === "casn") {
      // CASN aceita somente números (máx 12 dígitos)
      formattedValue = value.replace(/\D/g, "").slice(0, 12);
    } else if (field === "ccm") {
      // CCM máximo 25 caracteres
      formattedValue = value.slice(0, 25);
    }
    
    // Limpar erro de email ao digitar
    if (field === "emailPrincipal" || field === "emailSecundario") {
      setEmailErrors(prev => ({ ...prev, [field]: "" }));
    }
    
    setFormData(prev => ({ ...prev, [field]: formattedValue }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar CNPJ
    if (!validateCnpj(formData.cnpj)) {
      toast.error("CNPJ inválido. Verifique os dígitos informados.");
      return;
    }
    
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

      // Obter o CNPJ da empresa superior selecionada
      const empresaSuperior = empresasSuperiores.find(e => e.cnpj_id.toString() === formData.superiorCnpjId);

      // 4. Criar registro da empresa (CNPJ)
      const { data: cnpjData, error: cnpjError } = await supabase
        .from("tb_cnpj")
        .insert({
          razao_social: formData.razaoSocial,
          cnpj_numero: removeMask(formData.cnpj),
          ccm: formData.ccm,
          casn: formData.casn || null,
          responsavel_nome: responsavelSelecionado?.nome || null,
          cat_id: formData.categoriaId ? parseInt(formData.categoriaId) : null,
          agencia: mostrarAgencia ? formData.agencia || null : null,
          superior_cnpj: mostrarSuperiorImediato && empresaSuperior ? empresaSuperior.cnpj_numero : null,
          email_id: emailData.email_id,
          tel_id: telefoneData.tel_id,
          end_id: enderecoId,
        })
        .select("cnpj_id")
        .single();

      if (cnpjError) throw cnpjError;

      // 5. Criar vínculo com responsável se selecionado
      if (formData.responsavelId) {
        const { error: vinculoError } = await supabase
          .from("tb_responsavel_cnpj")
          .insert({
            responsavel_id: parseInt(formData.responsavelId),
            cnpj_id: cnpjData.cnpj_id,
          });

        if (vinculoError) throw vinculoError;
      }

      toast.success("Empresa cadastrada com sucesso!");
      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setFormData({
        razaoSocial: "",
        cnpj: "",
        ccm: "",
        casn: "",
        responsavelId: "",
        categoriaId: "",
        agencia: "",
        superiorCnpjId: "",
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
      
      // Tratar erros específicos
      if (error.code === "23505" && error.message?.includes("tb_cnpj_cnpj_numero_key")) {
        toast.error("Este CNPJ já está cadastrado no sistema.");
      } else if (error.code === "23505") {
        toast.error("Registro duplicado. Verifique os dados informados.");
      } else {
        toast.error(error.message || "Erro ao cadastrar empresa");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
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
                <Label htmlFor="ccm">CCM (Cadastro Municipal) *</Label>
                <Input
                  id="ccm"
                  placeholder="Cadastro Municipal"
                  value={formData.ccm}
                  onChange={(e) => handleInputChange("ccm", e.target.value)}
                  maxLength={25}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="casn">CASN</Label>
                <Input
                  id="casn"
                  placeholder="Somente números (12 dígitos)"
                  value={formData.casn}
                  onChange={(e) => handleInputChange("casn", e.target.value)}
                  maxLength={12}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Responsável
                  </div>
                </Label>
                <div className="flex gap-2">
                  <Popover open={responsavelOpen} onOpenChange={setResponsavelOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={responsavelOpen}
                        className="flex-1 justify-between font-normal"
                      >
                        {responsavelSelecionado ? (
                          <div className="flex flex-col items-start text-left">
                            <span>{responsavelSelecionado.nome}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatCpf(responsavelSelecionado.cpf_numero)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Selecione o responsável</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar pessoa..." />
                        <CommandList>
                          <CommandEmpty>Nenhuma pessoa encontrada</CommandEmpty>
                          <CommandGroup>
                            {responsaveis.map((resp) => (
                              <CommandItem
                                key={resp.responsavel_id}
                                value={`${resp.nome} ${resp.cpf_numero}`}
                                onSelect={() => {
                                  setFormData(prev => ({ 
                                    ...prev, 
                                    responsavelId: resp.responsavel_id.toString() 
                                  }));
                                  setResponsavelOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.responsavelId === resp.responsavel_id.toString() 
                                      ? "opacity-100" 
                                      : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{resp.nome}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatCpf(resp.cpf_numero)}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setNovaPessoaModalOpen(true)}
                    title="Cadastrar nova pessoa"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
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
                    superiorCnpjId: ""
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

            {/* Campo Superior Imediato - só aparece para MFB/LU e LP/Consultor */}
            {mostrarSuperiorImediato && (
              <div className="space-y-2">
                <Label htmlFor="superiorCnpjId">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Superior Imediato
                  </div>
                </Label>
                <Select
                  value={formData.superiorCnpjId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, superiorCnpjId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o superior imediato" />
                  </SelectTrigger>
                <SelectContent>
                    {empresasSuperiores.map((emp) => (
                      <SelectItem key={emp.cnpj_id} value={emp.cnpj_id.toString()}>
                        <div className="flex flex-col">
                          <span className="font-medium">{emp.razao_social}</span>
                          <span className="text-xs text-muted-foreground">{formatCnpjMask(emp.cnpj_numero)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
                  onBlur={() => handleEmailBlur("emailPrincipal")}
                  className={emailErrors.emailPrincipal ? "border-destructive" : ""}
                />
                {emailErrors.emailPrincipal && (
                  <p className="text-sm text-destructive">{emailErrors.emailPrincipal}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="emailSecundario">Email Secundário</Label>
                <Input
                  id="emailSecundario"
                  type="email"
                  placeholder="outro@empresa.com"
                  value={formData.emailSecundario}
                  onChange={(e) => handleInputChange("emailSecundario", e.target.value)}
                  onBlur={() => handleEmailBlur("emailSecundario")}
                  className={emailErrors.emailSecundario ? "border-destructive" : ""}
                />
                {emailErrors.emailSecundario && (
                  <p className="text-sm text-destructive">{emailErrors.emailSecundario}</p>
                )}
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

    <NovaPessoaModal
      open={novaPessoaModalOpen}
      onOpenChange={setNovaPessoaModalOpen}
      onSuccess={(responsavelId, nome) => {
        setFormData(prev => ({ ...prev, responsavelId: responsavelId.toString() }));
        fetchResponsaveis();
      }}
    />
    </>
  );
}
