import { useState, useEffect } from "react";
import { HIDDEN_USER_IDS, getDisplayName } from "@/lib/constants";
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
  Loader2,
  Check,
  ChevronsUpDown
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCnpjMask } from "@/lib/validators";

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
  atendente: boolean;
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

interface Status {
  status_id: number;
  status_nome: string;
}

interface TipoDemanda {
  id: number;
  nome: string;
  tipo: number;
  prazo_id: number;
  prazo_minutos?: number;
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

// Cores do status
const getStatusCor = (statusNome: string): string => {
  switch (statusNome?.toLowerCase()) {
    case "novo":
      return "bg-blue-100 text-blue-700";
    case "em andamento":
      return "bg-yellow-100 text-yellow-700";
    case "pendente":
      return "bg-orange-100 text-orange-700";
    case "excedido":
      return "bg-red-100 text-red-700";
    case "concluída":
    case "concluído":
    case "concluida":
    case "concluido":
      return "bg-green-100 text-green-700";
    case "concluída fora do prazo":
      return "bg-purple-100 text-purple-700";
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
  const [empresaOpen, setEmpresaOpen] = useState(false);
  const [tipoDemandaOpen, setTipoDemandaOpen] = useState(false);
  
  // Dados do banco
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [vias, setVias] = useState<Via[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cpfCnpjList, setCpfCnpjList] = useState<CpfCnpj[]>([]);
  const [statusList, setStatusList] = useState<Status[]>([]);
  const [tiposDemanda, setTiposDemanda] = useState<TipoDemanda[]>([]);
  
  const [formData, setFormData] = useState({
    empresaId: "",
    tipoDemandaId: "",
    titulo: "",
    descricao: "",
    viaId: "",
    prioridadeId: "3", // Prioridade "Média" como padrão (nivel 3)
    statusId: "1", // Status "Novo" como padrão - NÃO EDITÁVEL
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
      const [prioridadesRes, viasRes, usuariosRes, empresasRes, cpfCnpjRes, statusRes, tiposDemandaRes] = await Promise.all([
        supabase.from("tb_prioridade").select("*").order("prioridade_nivel", { ascending: true }),
        supabase.from("tb_via").select("*"),
        supabase.from("tb_usuario").select("user_id, nome, atendente").eq("ativo", true).eq("atendente", true),
        supabase.from("tb_cnpj").select("cnpj_id, razao_social, cnpj_numero"),
        supabase.from("tb_cpf_cnpj").select("id, cnpj_id, cpf_id"),
        supabase.from("tb_status").select("*").order("status_id", { ascending: true }),
        supabase.from("tb_tipodemanda").select("id, nome, tipo, prazo_id, sla_minutos").order("nome", { ascending: true }),
      ]);

      if (prioridadesRes.error) throw prioridadesRes.error;
      if (viasRes.error) throw viasRes.error;
      if (usuariosRes.error) throw usuariosRes.error;
      if (empresasRes.error) throw empresasRes.error;
      if (cpfCnpjRes.error) throw cpfCnpjRes.error;
      if (statusRes.error) throw statusRes.error;
      if (tiposDemandaRes.error) throw tiposDemandaRes.error;

      // Usar sla_minutos diretamente
      const tiposComPrazo = (tiposDemandaRes.data || []).map(td => ({
        ...td,
        prazo_minutos: td.sla_minutos || 60,
      }));

      setPrioridades(prioridadesRes.data || []);
      setVias(viasRes.data || []);
      // Filtrar usuários ocultos e aplicar nome visual
      const usuariosFiltrados = (usuariosRes.data || [])
        .filter((u: any) => !HIDDEN_USER_IDS.includes(u.user_id))
        .map((u: any) => ({
          ...u,
          nome: getDisplayName(u.user_id, u.nome)
        }));
      setUsuarios(usuariosFiltrados);
      setEmpresas(empresasRes.data || []);
      setCpfCnpjList(cpfCnpjRes.data || []);
      setStatusList(statusRes.data || []);
      setTiposDemanda(tiposComPrazo);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados do formulário");
    } finally {
      setIsLoadingData(false);
    }
  };

  // Calcular prazo automaticamente ao selecionar tipo de demanda
  const handleTipoDemandaChange = (tipoDemandaId: string) => {
    const tipoSelecionado = tiposDemanda.find(t => t.id.toString() === tipoDemandaId);
    
    if (tipoSelecionado) {
      const agora = new Date();
      const prazoFim = new Date(agora.getTime() + (tipoSelecionado.prazo_minutos || 60) * 60 * 1000);
      
      // Formatar para datetime-local
      const formatDateTimeLocal = (date: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
      };

      // Auto-preencher título com o nome do tipo de demanda
      setFormData(prev => ({
        ...prev,
        tipoDemandaId,
        titulo: prev.titulo || tipoSelecionado.nome,
        prazoInicio: formatDateTimeLocal(agora),
        prazoFim: formatDateTimeLocal(prazoFim),
      }));
    } else {
      setFormData(prev => ({ ...prev, tipoDemandaId }));
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
        // Gerar um CPF único baseado no cnpj_id para evitar duplicatas
        const cpfPlaceholder = String(empresaId).padStart(11, "0");
        
        // Verificar se esse CPF já existe
        const { data: existingCpf } = await supabase
          .from("tb_cpf")
          .select("cpf_id")
          .eq("cpf_numero", cpfPlaceholder)
          .maybeSingle();
        
        let cpfId: number;
        
        if (existingCpf) {
          // CPF já existe, reutilizar
          cpfId = existingCpf.cpf_id;
        } else {
          // Criar novo CPF placeholder para a empresa
          const { data: cpfData, error: cpfError } = await supabase
            .from("tb_cpf")
            .insert({
              nome: empresas.find(e => e.cnpj_id === empresaId)?.razao_social || "Empresa",
              cpf_numero: cpfPlaceholder,
            })
            .select("cpf_id")
            .single();

          if (cpfError) throw cpfError;
          cpfId = cpfData.cpf_id;
        }

        // Verificar se já existe relação CPF/CNPJ
        const { data: existingRelation } = await supabase
          .from("tb_cpf_cnpj")
          .select("id")
          .eq("cpf_id", cpfId)
          .eq("cnpj_id", empresaId)
          .maybeSingle();
        
        if (existingRelation) {
          cpfCnpjEntry = { id: existingRelation.id, cnpj_id: empresaId, cpf_id: cpfId };
        } else {
          // Criar a relação CPF/CNPJ
          const { data: cpfCnpjData, error: cpfCnpjError } = await supabase
            .from("tb_cpf_cnpj")
            .insert({
              cpf_id: cpfId,
              cnpj_id: empresaId,
            })
            .select("id")
            .single();

          if (cpfCnpjError) throw cpfCnpjError;

          cpfCnpjEntry = { id: cpfCnpjData.id, cnpj_id: empresaId, cpf_id: cpfId };
        }
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
        status_id: parseInt(formData.statusId) || 1,
        tipodemanda_id: formData.tipoDemandaId ? parseInt(formData.tipoDemandaId) : null,
      };

      const { error } = await supabase.from("tb_demanda").insert(demandaData);

      if (error) throw error;

      toast.success("Demanda criada com sucesso!");
      onOpenChange(false);
      onSuccess?.();
      
      // Reset form
      setFormData({
        empresaId: "",
        tipoDemandaId: "",
        titulo: "",
        descricao: "",
        viaId: "",
        prioridadeId: "3", // Prioridade "Média" como padrão
        statusId: "1", // Status "Novo" como padrão
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
  const tipoDemandaSelecionado = tiposDemanda.find(t => t.id.toString() === formData.tipoDemandaId);

  // Formatar prazo em texto legível
  const formatPrazoTexto = (minutos: number) => {
    if (minutos < 60) return `${minutos} minutos`;
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (minutos < 1440) {
      if (mins === 0) return `${horas}h`;
      return `${horas}h ${mins}min`;
    }
    const dias = Math.floor(minutos / 1440);
    const horasRestantes = Math.floor((minutos % 1440) / 60);
    if (horasRestantes === 0) return `${dias} dia${dias > 1 ? 's' : ''}`;
    return `${dias} dia${dias > 1 ? 's' : ''} ${horasRestantes}h`;
  };

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
                <Popover open={empresaOpen} onOpenChange={setEmpresaOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={empresaOpen}
                      className="w-full justify-between font-normal"
                    >
                      {empresaSelecionada ? (
                        <div className="flex flex-col items-start text-left">
                          <span>{empresaSelecionada.razao_social}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatCnpjMask(empresaSelecionada.cnpj_numero)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Selecione a empresa</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar por razão social ou CNPJ..." />
                      <CommandList>
                        <CommandEmpty>Nenhuma empresa encontrada</CommandEmpty>
                        <CommandGroup>
                          {empresas.map((empresa) => (
                            <CommandItem
                              key={empresa.cnpj_id}
                              value={`${empresa.razao_social} ${empresa.cnpj_numero}`}
                              onSelect={() => {
                                setFormData(prev => ({ 
                                  ...prev, 
                                  empresaId: empresa.cnpj_id.toString() 
                                }));
                                setEmpresaOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.empresaId === empresa.cnpj_id.toString() 
                                    ? "opacity-100" 
                                    : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span>{empresa.razao_social}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatCnpjMask(empresa.cnpj_numero)}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {empresaSelecionada && (
                  <p className="text-xs text-muted-foreground">
                    CNPJ: {formatCnpjMask(empresaSelecionada.cnpj_numero)}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Seção: Tipo de Demanda */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Tag className="h-4 w-4" />
                <span>Tipo de Demanda</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipoDemanda">Tipo de Demanda *</Label>
                <Popover open={tipoDemandaOpen} onOpenChange={setTipoDemandaOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={tipoDemandaOpen}
                      className="w-full justify-between font-normal"
                    >
                      {tipoDemandaSelecionado ? (
                        <div className="flex items-center justify-between w-full">
                          <span>{tipoDemandaSelecionado.nome}</span>
                          <Badge variant="secondary" className="ml-2 bg-primary/10 text-primary">
                            SLA: {formatPrazoTexto(tipoDemandaSelecionado.prazo_minutos || 60)}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Selecione o tipo de demanda</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[500px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar tipo de demanda..." />
                      <CommandList>
                        <CommandEmpty>Nenhum tipo encontrado</CommandEmpty>
                        <CommandGroup>
                          {tiposDemanda.map((tipo) => (
                            <CommandItem
                              key={tipo.id}
                              value={tipo.nome}
                              onSelect={() => {
                                handleTipoDemandaChange(tipo.id.toString());
                                setTipoDemandaOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  formData.tipoDemandaId === tipo.id.toString() ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex items-center justify-between w-full">
                                <span>{tipo.nome}</span>
                                <Badge variant="outline" className="ml-2 text-xs">
                                  {formatPrazoTexto(tipo.prazo_minutos || 60)}
                                </Badge>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {tipoDemandaSelecionado && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Prazo de {formatPrazoTexto(tipoDemandaSelecionado.prazo_minutos || 60)} para resolução
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {/* Seção: Detalhes */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <FileText className="h-4 w-4" />
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

            {/* Seção: Status, Canal e Prioridade */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>Status, Canal e Prioridade</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 text-sm">
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      Novo
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Toda demanda inicia com status "Novo"
                  </p>
                </div>

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
                  <Label>Prazo Final (calculado automaticamente)</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted/50 px-3 py-2 pl-10 text-sm">
                      {formData.prazoFim ? (
                        new Date(formData.prazoFim).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      ) : (
                        <span className="text-muted-foreground">Selecione um tipo de demanda</span>
                      )}
                    </div>
                  </div>
                  {tipoDemandaSelecionado && (
                    <p className="text-xs text-muted-foreground">
                      Baseado no SLA de {formatPrazoTexto(tipoDemandaSelecionado.prazo_minutos || 60)}
                    </p>
                  )}
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
                disabled={isLoading || !formData.empresaId || !formData.tipoDemandaId || !formData.titulo || !formData.viaId || !formData.prioridadeId}
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
