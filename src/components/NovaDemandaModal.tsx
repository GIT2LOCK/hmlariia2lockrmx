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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Building2, 
  FileText, 
  Clock, 
  User, 
  Mail, 
  MessageSquare,
  Calendar,
  Phone,
  Tag,
  Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface NovaDemandaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface Prioridade {
  prioridade_id: number;
  prioridade_nome: string;
  prioridade_nivel: number;
}

interface Via {
  via_id: number;
  tem_email: boolean | null;
  tem_whatsapp: boolean | null;
}

interface Usuario {
  user_id: number;
  nome: string;
}

interface Empresa {
  cnpj_id: number;
  razao_social: string;
  cnpj_numero: string;
}

interface CpfCnpj {
  id: number;
  cnpj_id: number | null;
  cpf_id: number;
}

// Cores das prioridades por nível (1=Crítica/vermelho, 5=Muito baixa/verde)
const getPrioridadeCor = (nivel: number): string => {
  switch (nivel) {
    case 1: // Crítica
      return "bg-red-100 text-red-700";
    case 2: // Alta
      return "bg-orange-100 text-orange-700";
    case 3: // Média
      return "bg-yellow-100 text-yellow-700";
    case 4: // Baixa
    case 5: // Muito baixa
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

// Função para obter label e ícone da via
const getViaLabel = (via: Via): { label: string; icon: React.ReactNode } => {
  if (via.tem_email && via.tem_whatsapp) {
    return { label: "Email + WhatsApp", icon: <Mail className="h-4 w-4 text-purple-600" /> };
  } else if (via.tem_email) {
    return { label: "Email", icon: <Mail className="h-4 w-4 text-purple-600" /> };
  } else if (via.tem_whatsapp) {
    return { label: "WhatsApp", icon: <MessageSquare className="h-4 w-4 text-green-600" /> };
  } else {
    return { label: "Telefone", icon: <Phone className="h-4 w-4 text-blue-600" /> };
  }
};

export function NovaDemandaModal({ open, onOpenChange, onSuccess }: NovaDemandaModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // Dados do banco
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [vias, setVias] = useState<Via[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cpfCnpjList, setCpfCnpjList] = useState<CpfCnpj[]>([]);
  
  const [formData, setFormData] = useState({
    empresaId: "",
    titulo: "",
    descricao: "",
    viaId: "",
    prioridadeId: "",
    responsavelId: "",
    prazoInicio: "",
    prazoFim: "",
  });

  // Buscar dados do banco ao abrir o modal
  useEffect(() => {
    if (open) {
      fetchData();
    }
  }, [open]);

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      const [prioridadesRes, viasRes, usuariosRes, empresasRes, cpfCnpjRes] = await Promise.all([
        supabase.from("tb_prioridade").select("*").order("prioridade_nivel", { ascending: true }),
        supabase.from("tb_via").select("*"),
        supabase.from("tb_usuario").select("user_id, nome").eq("ativo", true),
        supabase.from("tb_cnpj").select("cnpj_id, razao_social, cnpj_numero"),
        supabase.from("tb_cpf_cnpj").select("id, cnpj_id, cpf_id"),
      ]);

      if (prioridadesRes.error) throw prioridadesRes.error;
      if (viasRes.error) throw viasRes.error;
      if (usuariosRes.error) throw usuariosRes.error;
      if (empresasRes.error) throw empresasRes.error;
      if (cpfCnpjRes.error) throw cpfCnpjRes.error;

      setPrioridades(prioridadesRes.data || []);
      setVias(viasRes.data || []);
      setUsuarios(usuariosRes.data || []);
      setEmpresas(empresasRes.data || []);
      setCpfCnpjList(cpfCnpjRes.data || []);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados do formulário");
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Encontrar o cpf_cnpj_id baseado na empresa selecionada
      const empresaId = parseInt(formData.empresaId);
      let cpfCnpjEntry = cpfCnpjList.find(item => item.cnpj_id === empresaId);
      
      // Se não existe a relação, criar uma automaticamente
      if (!cpfCnpjEntry) {
        // Primeiro, criar um CPF placeholder para a empresa
        const { data: cpfData, error: cpfError } = await supabase
          .from("tb_cpf")
          .insert({
            nome: empresas.find(e => e.cnpj_id === empresaId)?.razao_social || "Empresa",
            cpf_numero: "00000000000", // 11 dígitos sem máscara
          })
          .select("cpf_id")
          .single();

        if (cpfError) throw cpfError;

        // Criar a relação CPF/CNPJ
        const { data: cpfCnpjData, error: cpfCnpjError } = await supabase
          .from("tb_cpf_cnpj")
          .insert({
            cpf_id: cpfData.cpf_id,
            cnpj_id: empresaId,
          })
          .select("id")
          .single();

        if (cpfCnpjError) throw cpfCnpjError;

        cpfCnpjEntry = { id: cpfCnpjData.id, cnpj_id: empresaId, cpf_id: cpfData.cpf_id };
      }

      const demandaData = {
        titulo_demanda: formData.titulo,
        descricao_tarefa: formData.descricao || "Sem descrição",
        via_id: parseInt(formData.viaId),
        prioridade_id: parseInt(formData.prioridadeId),
        cnpj_cpf_id: cpfCnpjEntry.id,
        user_id: formData.responsavelId && formData.responsavelId !== "sem-atribuicao" 
          ? parseInt(formData.responsavelId) 
          : null,
        prazo_inicio: formData.prazoInicio || new Date().toISOString(),
        prazo_fim: formData.prazoFim || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status_id: 1, // Status inicial
      };

      const { error } = await supabase.from("tb_demanda").insert(demandaData);

      if (error) throw error;

      toast.success("Demanda criada com sucesso!");
      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setFormData({
        empresaId: "",
        titulo: "",
        descricao: "",
        viaId: "",
        prioridadeId: "",
        responsavelId: "",
        prazoInicio: "",
        prazoFim: "",
      });
    } catch (error: any) {
      console.error("Erro ao criar demanda:", error);
      toast.error(error.message || "Erro ao criar demanda");
    } finally {
      setIsLoading(false);
    }
  };

  const empresaSelecionada = empresas.find(e => e.cnpj_id.toString() === formData.empresaId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Nova Demanda</DialogTitle>
              <DialogDescription>
                Preencha os campos abaixo para abrir uma nova demanda
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoadingData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Carregando dados...</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Seção: Identificação */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>Identificação</span>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="empresa">Empresa *</Label>
                <Select
                  value={formData.empresaId}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, empresaId: value }))}
                >
                  <SelectTrigger id="empresa">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((empresa) => (
                      <SelectItem key={empresa.cnpj_id} value={empresa.cnpj_id.toString()}>
                        <div className="flex flex-col">
                          <span>{empresa.razao_social}</span>
                          <span className="text-xs text-muted-foreground">{empresa.cnpj_numero}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {empresaSelecionada && (
                  <p className="text-xs text-muted-foreground">
                    CNPJ: {empresaSelecionada.cnpj_numero}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Seção: Detalhes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Tag className="h-4 w-4" />
                <span>Detalhes</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="titulo">Título *</Label>
                <Input
                  id="titulo"
                  placeholder="Ex: Revisão de balanço patrimonial Q4 2024"
                  value={formData.titulo}
                  onChange={(e) => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  placeholder="Descreva os detalhes da demanda, informações adicionais, anexos necessários..."
                  rows={4}
                  value={formData.descricao}
                  onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                />
              </div>
            </div>

            <Separator />

            {/* Seção: Canal e Prioridade */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>Canal e Prioridade</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="via">Canal de Origem *</Label>
                  <Select
                    value={formData.viaId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, viaId: value }))}
                  >
                    <SelectTrigger id="via">
                      <SelectValue placeholder="Selecione o canal" />
                    </SelectTrigger>
                    <SelectContent>
                      {vias.map((via) => {
                        const { label, icon } = getViaLabel(via);
                        return (
                          <SelectItem key={via.via_id} value={via.via_id.toString()}>
                            <div className="flex items-center gap-2">
                              {icon}
                              <span>{label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prioridade">Prioridade *</Label>
                  <Select
                    value={formData.prioridadeId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, prioridadeId: value }))}
                  >
                    <SelectTrigger id="prioridade">
                      <SelectValue placeholder="Selecione a prioridade" />
                    </SelectTrigger>
                    <SelectContent>
                      {prioridades.map((p) => (
                        <SelectItem key={p.prioridade_id} value={p.prioridade_id.toString()}>
                          <Badge variant="secondary" className={getPrioridadeCor(p.prioridade_nivel)}>
                            {p.prioridade_nome}
                          </Badge>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Seção: Atribuição e Prazo */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Atribuição e Prazo</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="responsavel">Responsável</Label>
                  <Select
                    value={formData.responsavelId}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, responsavelId: value }))}
                  >
                    <SelectTrigger id="responsavel">
                      <SelectValue placeholder="Atribuir a alguém (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem-atribuicao">
                        <span className="text-muted-foreground">Sem atribuição</span>
                      </SelectItem>
                      {usuarios.map((usuario) => (
                        <SelectItem key={usuario.user_id} value={usuario.user_id.toString()}>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span>{usuario.nome}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prazoFim">Prazo Final</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="prazoFim"
                      type="datetime-local"
                      className="pl-10"
                      value={formData.prazoFim}
                      onChange={(e) => setFormData(prev => ({ ...prev, prazoFim: e.target.value }))}
                    />
                  </div>
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
                disabled={isLoading || !formData.empresaId || !formData.titulo || !formData.viaId || !formData.prioridadeId}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Criar Demanda
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
