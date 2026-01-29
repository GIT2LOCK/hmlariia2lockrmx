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
import { Badge } from "@/components/ui/badge";
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
  Tag,
  Hash,
  Pencil,
  X,
  Save
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";

interface VisualizarEmpresaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cnpjId: number | null;
  onUpdate?: () => void;
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
  cat_id: number | null;
  email_id: number | null;
  email_principal: string | null;
  email_secundario: string | null;
  tel_id: number | null;
  telefone_principal: string | null;
  telefone_secundario: string | null;
  end_id: number | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
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

// Função para aplicar máscara de CNPJ ao digitar
const maskCNPJ = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .slice(0, 18);
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

// Função para aplicar máscara de telefone ao digitar
const maskPhone = (value: string) => {
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

// Função para formatar CEP
const formatCEP = (value: string | null) => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return value;
  return digits.replace(/^(\d{5})(\d{3})$/, "$1-$2");
};

// Função para aplicar máscara de CEP ao digitar
const maskCEP = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/^(\d{5})(\d)/, "$1-$2").slice(0, 9);
};

// Função para remover máscara
const removeMask = (value: string) => value.replace(/\D/g, "");

// Componente InfoItem para exibição de dados
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

// Componente EditField para edição de dados
interface EditFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  icon?: any;
  placeholder?: string;
}

const EditField = ({ label, value, onChange, icon: Icon, placeholder }: EditFieldProps) => (
  <div className="space-y-1">
    <Label className="text-xs flex items-center gap-1">
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </Label>
    <Input
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-8 text-sm"
    />
  </div>
);

export function VisualizarEmpresaModal({ open, onOpenChange, cnpjId, onUpdate }: VisualizarEmpresaModalProps) {
  const { canEdit } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [empresa, setEmpresa] = useState<EmpresaDetalhes | null>(null);
  const [editData, setEditData] = useState<EmpresaDetalhes | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [empresasSuperiores, setEmpresasSuperiores] = useState<EmpresaSuperior[]>([]);
  const [selectedSuperiorId, setSelectedSuperiorId] = useState<string>("");

  useEffect(() => {
    const fetchData = async () => {
      if (!cnpjId || !open) return;
      
      setIsLoading(true);
      setIsEditing(false);
      try {
        // Buscar empresa
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
            cat_id,
            email_id,
            tel_id,
            end_id,
            tb_categoria:cat_id(categoria),
            tb_email:email_id(email_principal, email_secundario),
            tb_numero:tel_id(telefone_principal, telefone_secundario),
            tb_endereco:end_id(cep, logradouro, numero, complemento, bairro, cidade, uf)
          `)
          .eq("cnpj_id", cnpjId)
          .maybeSingle();

        if (error) throw error;

        // Buscar categorias
        const { data: catData } = await supabase
          .from("tb_categoria")
          .select("cat_id, categoria")
          .order("cat_id");

        if (catData) {
          setCategorias(catData);
        }

        if (data) {
          const empresaData: EmpresaDetalhes = {
            razao_social: data.razao_social,
            cnpj_numero: data.cnpj_numero,
            ccm: data.ccm,
            casn: data.casn,
            responsavel_nome: data.responsavel_nome,
            agencia: data.agencia,
            superior_cnpj: data.superior_cnpj,
            cat_id: data.cat_id,
            categoria: (data.tb_categoria as any)?.categoria || null,
            email_id: data.email_id,
            email_principal: (data.tb_email as any)?.email_principal || null,
            email_secundario: (data.tb_email as any)?.email_secundario || null,
            tel_id: data.tel_id,
            telefone_principal: (data.tb_numero as any)?.telefone_principal || null,
            telefone_secundario: (data.tb_numero as any)?.telefone_secundario || null,
            end_id: data.end_id,
            cep: (data.tb_endereco as any)?.cep || null,
            logradouro: (data.tb_endereco as any)?.logradouro || null,
            numero: (data.tb_endereco as any)?.numero || null,
            complemento: (data.tb_endereco as any)?.complemento || null,
            bairro: (data.tb_endereco as any)?.bairro || null,
            cidade: (data.tb_endereco as any)?.cidade || null,
            uf: (data.tb_endereco as any)?.uf || null,
          };
          setEmpresa(empresaData);
          setEditData(empresaData);
        }
      } catch (error) {
        console.error("Erro ao buscar empresa:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [cnpjId, open]);

  const handleEdit = () => {
    if (empresa) {
      setEditData({ ...empresa });
      setIsEditing(true);
    }
  };

  const handleCancel = () => {
    setEditData(empresa);
    setIsEditing(false);
  };

  const handleInputChange = (field: keyof EmpresaDetalhes, value: string) => {
    if (!editData) return;

    let formattedValue = value;

    if (field === "cnpj_numero") {
      formattedValue = maskCNPJ(value);
    } else if (field === "telefone_principal" || field === "telefone_secundario") {
      formattedValue = maskPhone(value);
    } else if (field === "cep") {
      formattedValue = maskCEP(value);
    } else if (field === "uf") {
      formattedValue = value.toUpperCase().slice(0, 2);
    } else if (field === "casn") {
      formattedValue = value.replace(/\D/g, "").slice(0, 12);
    } else if (field === "ccm") {
      formattedValue = value.slice(0, 25);
    }

    setEditData(prev => prev ? { ...prev, [field]: formattedValue } : null);
  };

  const handleCategoriaChange = (catId: string) => {
    if (!editData) return;
    const cat = categorias.find(c => c.cat_id.toString() === catId);
    // Só limpar agência/superior se a categoria realmente mudou
    if (editData.cat_id?.toString() !== catId) {
      setEditData(prev => prev ? {
        ...prev,
        cat_id: parseInt(catId),
        categoria: cat?.categoria || null,
        agencia: "",
        superior_cnpj: null
      } : null);
      setSelectedSuperiorId("");
    }
  };

  // Determinar quais categorias buscar para o dropdown de Superior Imediato
  // MFB/LU pode se vincular a MFA/LA
  // LP/Consultor pode se vincular a MFA/LA ou MFB/LU
  const getCategoriasSuperiores = (categoria: string | null) => {
    if (categoria === "MFB/LU") return ["MFA/LA"];
    if (categoria === "LP/Consultor") return ["MFA/LA", "MFB/LU"];
    return [];
  };

  // Buscar empresas superiores quando a categoria mudar
  useEffect(() => {
    const fetchEmpresasSuperiores = async () => {
      const categoria = editData?.categoria || empresa?.categoria;
      const categoriasFiltro = getCategoriasSuperiores(categoria);
      
      if (categoriasFiltro.length === 0 || categorias.length === 0) {
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
        
        // Se já existe um superior_cnpj, encontrar o ID correspondente
        const superiorCnpj = editData?.superior_cnpj || empresa?.superior_cnpj;
        if (superiorCnpj) {
          const empresaSuperior = data.find(e => e.cnpj_numero === superiorCnpj);
          if (empresaSuperior) {
            setSelectedSuperiorId(empresaSuperior.cnpj_id.toString());
          }
        }
      }
    };

    if (isEditing || open) {
      fetchEmpresasSuperiores();
    }
  }, [editData?.cat_id, categorias, isEditing, open]);

  const handleSuperiorChange = (superiorId: string) => {
    setSelectedSuperiorId(superiorId);
    const empresaSuperior = empresasSuperiores.find(e => e.cnpj_id.toString() === superiorId);
    if (editData && empresaSuperior) {
      setEditData(prev => prev ? { ...prev, superior_cnpj: empresaSuperior.cnpj_numero } : null);
    }
  };

  // Obter nome da empresa superior para visualização
  const getNomeSuperiorImediato = () => {
    if (!empresa?.superior_cnpj) return null;
    const superior = empresasSuperiores.find(e => e.cnpj_numero === empresa.superior_cnpj);
    return superior?.razao_social || formatCNPJ(empresa.superior_cnpj);
  };

  const handleSave = async () => {
    if (!editData || !cnpjId) return;

    setIsSaving(true);
    try {
      // Atualizar email
      if (editData.email_id) {
        const { error: emailError } = await supabase
          .from("tb_email")
          .update({
            email_principal: editData.email_principal || null,
            email_secundario: editData.email_secundario || null,
          })
          .eq("email_id", editData.email_id);

        if (emailError) throw emailError;
      }

      // Atualizar telefone
      if (editData.tel_id) {
        const { error: telError } = await supabase
          .from("tb_numero")
          .update({
            telefone_principal: editData.telefone_principal ? removeMask(editData.telefone_principal) : null,
            telefone_secundario: editData.telefone_secundario ? removeMask(editData.telefone_secundario) : null,
          })
          .eq("tel_id", editData.tel_id);

        if (telError) throw telError;
      }

      // Atualizar endereço
      if (editData.end_id) {
        const { error: endError } = await supabase
          .from("tb_endereco")
          .update({
            cep: editData.cep ? removeMask(editData.cep) : null,
            logradouro: editData.logradouro || null,
            numero: editData.numero || null,
            complemento: editData.complemento || null,
            bairro: editData.bairro || null,
            cidade: editData.cidade || null,
            uf: editData.uf || null,
          })
          .eq("end_id", editData.end_id);

        if (endError) throw endError;
      }

      // Determinar valores de agência e CNPJ superior
      const categoriaSelecionada = categorias.find(c => c.cat_id === editData.cat_id);
      const mostrarAgencia = categoriaSelecionada?.categoria === "MFA/LA";
      const mostrarSuperiorImediato = categoriaSelecionada?.categoria === "MFB/LU" || categoriaSelecionada?.categoria === "LP/Consultor";

      // Obter o CNPJ da empresa superior selecionada
      const empresaSuperior = empresasSuperiores.find(e => e.cnpj_id.toString() === selectedSuperiorId);

      // Atualizar empresa
      const { error: cnpjError } = await supabase
        .from("tb_cnpj")
        .update({
          razao_social: editData.razao_social,
          cnpj_numero: removeMask(editData.cnpj_numero),
          ccm: editData.ccm || null,
          casn: editData.casn || null,
          responsavel_nome: editData.responsavel_nome || null,
          cat_id: editData.cat_id,
          agencia: mostrarAgencia ? editData.agencia || null : null,
          superior_cnpj: mostrarSuperiorImediato && empresaSuperior ? empresaSuperior.cnpj_numero : null,
        })
        .eq("cnpj_id", cnpjId);

      if (cnpjError) throw cnpjError;

      toast.success("Empresa atualizada com sucesso!");
      setEmpresa(editData);
      setIsEditing(false);
      onUpdate?.();
    } catch (error: any) {
      console.error("Erro ao atualizar empresa:", error);
      
      if (error.code === "23505" && error.message?.includes("tb_cnpj_cnpj_numero_key")) {
        toast.error("Este CNPJ já está cadastrado no sistema.");
      } else {
        toast.error(error.message || "Erro ao atualizar empresa");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const categoriaSelecionada = editData ? categorias.find(c => c.cat_id === editData.cat_id) : null;
  const mostrarAgencia = categoriaSelecionada?.categoria === "MFA/LA";
  const mostrarSuperiorImediato = categoriaSelecionada?.categoria === "MFB/LU" || categoriaSelecionada?.categoria === "LP/Consultor";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4 pr-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  {isEditing ? "Editar Empresa" : "Detalhes da Empresa"}
                </DialogTitle>
                <DialogDescription>
                  {isEditing ? "Atualize os dados da empresa" : "Visualização completa dos dados cadastrados"}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Botões de ação - apenas para quem pode editar */}
        {empresa && !isLoading && canEdit && (
          <div className="absolute right-12 top-4">
            {isEditing ? (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  Salvar
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Editar
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Carregando...</span>
          </div>
        ) : empresa && editData ? (
          <div className="space-y-6 mt-2">
            {/* Seção: Dados da Empresa */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>Dados da Empresa</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg">
                {isEditing ? (
                  <>
                    <EditField label="Razão Social" value={editData.razao_social} onChange={(v) => handleInputChange("razao_social", v)} icon={Building2} placeholder="Nome da empresa" />
                    <EditField label="CNPJ" value={maskCNPJ(editData.cnpj_numero)} onChange={(v) => handleInputChange("cnpj_numero", v)} icon={FileText} placeholder="00.000.000/0000-00" />
                    <EditField label="CCM (Cadastro Municipal)" value={editData.ccm} onChange={(v) => handleInputChange("ccm", v)} icon={Hash} placeholder="Cadastro Municipal" />
                    <EditField label="CASN" value={editData.casn} onChange={(v) => handleInputChange("casn", v)} icon={Hash} placeholder="Somente números" />
                    <EditField label="Responsável" value={editData.responsavel_nome} onChange={(v) => handleInputChange("responsavel_nome", v)} icon={User} placeholder="Nome do responsável" />
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Tag className="h-3 w-3" />
                        Categoria
                      </Label>
                      <Select
                        value={editData.cat_id?.toString() || ""}
                        onValueChange={handleCategoriaChange}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="Selecione" />
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
                    {mostrarAgencia && (
                      <EditField label="Agência" value={editData.agencia} onChange={(v) => handleInputChange("agencia", v)} icon={Building2} placeholder="Nome da agência" />
                    )}
                    {mostrarSuperiorImediato && (
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          Superior Imediato
                        </Label>
                        <Select
                          value={selectedSuperiorId}
                          onValueChange={handleSuperiorChange}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Selecione o superior imediato" />
                          </SelectTrigger>
                          <SelectContent>
                            {empresasSuperiores.map((emp) => (
                              <SelectItem key={emp.cnpj_id} value={emp.cnpj_id.toString()}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{emp.razao_social}</span>
                                  <span className="text-xs text-muted-foreground">{formatCNPJ(emp.cnpj_numero)}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                ) : (
                  <>
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
                      <InfoItem label="Superior Imediato" value={getNomeSuperiorImediato()} icon={Building2} />
                    )}
                  </>
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
                {isEditing ? (
                  <>
                    <EditField label="CEP" value={editData.cep ? maskCEP(editData.cep) : ""} onChange={(v) => handleInputChange("cep", v)} placeholder="00000-000" />
                    <div className="md:col-span-2">
                      <EditField label="Logradouro" value={editData.logradouro} onChange={(v) => handleInputChange("logradouro", v)} placeholder="Rua, Avenida, etc." />
                    </div>
                    <EditField label="Número" value={editData.numero} onChange={(v) => handleInputChange("numero", v)} placeholder="123" />
                    <EditField label="Complemento" value={editData.complemento} onChange={(v) => handleInputChange("complemento", v)} placeholder="Sala, Andar..." />
                    <EditField label="Bairro" value={editData.bairro} onChange={(v) => handleInputChange("bairro", v)} placeholder="Bairro" />
                    <EditField label="Cidade" value={editData.cidade} onChange={(v) => handleInputChange("cidade", v)} placeholder="São Paulo" />
                    <EditField label="UF" value={editData.uf} onChange={(v) => handleInputChange("uf", v)} placeholder="SP" />
                  </>
                ) : (
                  <>
                    <InfoItem label="CEP" value={formatCEP(empresa.cep)} />
                    <div className="md:col-span-2">
                      <InfoItem label="Logradouro" value={empresa.logradouro} />
                    </div>
                    <InfoItem label="Número" value={empresa.numero} />
                    <InfoItem label="Complemento" value={empresa.complemento} />
                    <InfoItem label="Bairro" value={empresa.bairro} />
                    <InfoItem label="Cidade" value={empresa.cidade} />
                    <InfoItem label="UF" value={empresa.uf} />
                  </>
                )}
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
                {isEditing ? (
                  <>
                    <EditField label="Email Principal" value={editData.email_principal} onChange={(v) => handleInputChange("email_principal", v)} icon={Mail} placeholder="email@empresa.com" />
                    <EditField label="Email Secundário" value={editData.email_secundario} onChange={(v) => handleInputChange("email_secundario", v)} icon={Mail} placeholder="outro@empresa.com" />
                    <EditField label="Telefone Principal" value={editData.telefone_principal ? maskPhone(editData.telefone_principal) : ""} onChange={(v) => handleInputChange("telefone_principal", v)} icon={Phone} placeholder="(00) 0-0000-0000" />
                    <EditField label="Telefone Secundário" value={editData.telefone_secundario ? maskPhone(editData.telefone_secundario) : ""} onChange={(v) => handleInputChange("telefone_secundario", v)} icon={Phone} placeholder="(00) 0-0000-0000" />
                  </>
                ) : (
                  <>
                    <InfoItem label="Email Principal" value={empresa.email_principal} icon={Mail} />
                    <InfoItem label="Email Secundário" value={empresa.email_secundario} icon={Mail} />
                    <InfoItem label="Telefone Principal" value={formatPhone(empresa.telefone_principal)} icon={Phone} />
                    <InfoItem label="Telefone Secundário" value={formatPhone(empresa.telefone_secundario)} icon={Phone} />
                  </>
                )}
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
