import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Card, CardContent } from "@/components/ui/card";
import { 
  Building2, 
  FileText, 
  Clock, 
  User, 
  Mail, 
  MessageSquare,
  Calendar,
  Phone,
  Loader2,
  Pencil,
  Save,
  X,
  Eye,
  AlertTriangle,
  Hash,
  CheckCircle2,
  Timer,
  Target,
  Trash2
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";

interface Demanda {
  dem_id: number;
  titulo_demanda: string;
  descricao_tarefa: string;
  prazo_inicio: string;
  prazo_fim: string;
  user_id: number | null;
  cnpj_cpf_id: number;
  status_id: number;
  prioridade_id: number;
  via_id: number;
  responsavel_nome?: string;
  empresa_nome?: string;
  empresa_cnpj?: string;
  status_nome?: string;
  prioridade_nome?: string;
  prioridade_nivel?: number;
  tem_email?: boolean;
  tem_whatsapp?: boolean;
}

interface VisualizarDemandaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  demanda: Demanda | null;
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

interface Status {
  status_id: number;
  status_nome: string;
}

const getPrioridadeCor = (nivel: number): string => {
  switch (nivel) {
    case 1:
      return "bg-red-500/10 text-red-600 border-red-500/20";
    case 2:
      return "bg-orange-500/10 text-orange-600 border-orange-500/20";
    case 3:
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    case 4:
    case 5:
      return "bg-green-500/10 text-green-600 border-green-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getStatusCor = (statusNome: string): string => {
  switch (statusNome?.toLowerCase()) {
    case "concluído":
    case "concluido":
      return "bg-green-500/10 text-green-600 border-green-500/20";
    case "em andamento":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "pendente":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    case "cancelado":
      return "bg-red-500/10 text-red-600 border-red-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getViaLabel = (via: Via): { label: string; icon: React.ReactNode } => {
  if (via.tem_email && via.tem_whatsapp) {
    return { label: "Email + WhatsApp", icon: <Mail className="h-4 w-4" /> };
  } else if (via.tem_email) {
    return { label: "Email", icon: <Mail className="h-4 w-4" /> };
  } else if (via.tem_whatsapp) {
    return { label: "WhatsApp", icon: <MessageSquare className="h-4 w-4" /> };
  } else {
    return { label: "Telefone", icon: <Phone className="h-4 w-4" /> };
  }
};

const getViaInfo = (temEmail: boolean, temWhatsapp: boolean): { label: string; icon: React.ReactNode; color: string } => {
  if (temEmail && temWhatsapp) {
    return { label: "Email + WhatsApp", icon: <Mail className="h-4 w-4" />, color: "text-purple-600 bg-purple-500/10" };
  } else if (temEmail) {
    return { label: "Email", icon: <Mail className="h-4 w-4" />, color: "text-purple-600 bg-purple-500/10" };
  } else if (temWhatsapp) {
    return { label: "WhatsApp", icon: <MessageSquare className="h-4 w-4" />, color: "text-green-600 bg-green-500/10" };
  } else {
    return { label: "Telefone", icon: <Phone className="h-4 w-4" />, color: "text-blue-600 bg-blue-500/10" };
  }
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateTimeForInput = (dateString: string): string => {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const calcularTempoRestante = (prazoFim: string): { texto: string; excedido: boolean; percentual: number } => {
  const agora = new Date();
  const prazo = new Date(prazoFim);
  const diff = prazo.getTime() - agora.getTime();
  
  if (diff <= 0) {
    const diffExcedido = Math.abs(diff);
    const minutosExcedidos = Math.floor(diffExcedido / (1000 * 60));
    const horasExcedidas = Math.floor(minutosExcedidos / 60);
    const diasExcedidos = Math.floor(horasExcedidas / 24);
    
    if (diasExcedidos > 0) {
      return { texto: `Excedido há ${diasExcedidos}d ${horasExcedidas % 24}h`, excedido: true, percentual: 100 };
    } else if (horasExcedidas > 0) {
      return { texto: `Excedido há ${horasExcedidas}h ${minutosExcedidos % 60}min`, excedido: true, percentual: 100 };
    } else {
      return { texto: `Excedido há ${minutosExcedidos}min`, excedido: true, percentual: 100 };
    }
  }
  
  const minutosRestantes = Math.floor(diff / (1000 * 60));
  const horasRestantes = Math.floor(minutosRestantes / 60);
  const diasRestantes = Math.floor(horasRestantes / 24);
  
  if (diasRestantes > 0) {
    return { texto: `${diasRestantes}d ${horasRestantes % 24}h restantes`, excedido: false, percentual: Math.max(0, 100 - diasRestantes * 10) };
  } else if (horasRestantes > 0) {
    return { texto: `${horasRestantes}h ${minutosRestantes % 60}min restantes`, excedido: false, percentual: Math.min(90, 100 - horasRestantes * 3) };
  } else {
    return { texto: `${minutosRestantes}min restantes`, excedido: false, percentual: 95 };
  }
};

export function VisualizarDemandaModal({ 
  open, 
  onOpenChange, 
  demanda, 
  onSuccess 
}: VisualizarDemandaModalProps) {
  const { canEdit, canManageUsers } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [vias, setVias] = useState<Via[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [statusList, setStatusList] = useState<Status[]>([]);
  
  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    viaId: "",
    prioridadeId: "",
    statusId: "",
    responsavelId: "",
    prazoFim: "",
  });

  useEffect(() => {
    if (open && demanda) {
      fetchData();
      setFormData({
        titulo: demanda.titulo_demanda,
        descricao: demanda.descricao_tarefa,
        viaId: demanda.via_id.toString(),
        prioridadeId: demanda.prioridade_id.toString(),
        statusId: demanda.status_id.toString(),
        responsavelId: demanda.user_id?.toString() || "sem-atribuicao",
        prazoFim: formatDateTimeForInput(demanda.prazo_fim),
      });
      setIsEditing(false);
    }
  }, [open, demanda]);

  const fetchData = async () => {
    setIsLoadingData(true);
    try {
      const [prioridadesRes, viasRes, usuariosRes, statusRes] = await Promise.all([
        supabase.from("tb_prioridade").select("*").order("prioridade_nivel", { ascending: true }),
        supabase.from("tb_via").select("*"),
        supabase.from("tb_usuario").select("user_id, nome").eq("ativo", true),
        supabase.from("tb_status").select("*"),
      ]);

      if (prioridadesRes.error) throw prioridadesRes.error;
      if (viasRes.error) throw viasRes.error;
      if (usuariosRes.error) throw usuariosRes.error;
      if (statusRes.error) throw statusRes.error;

      setPrioridades(prioridadesRes.data || []);
      setVias(viasRes.data || []);
      setUsuarios(usuariosRes.data || []);
      setStatusList(statusRes.data || []);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setIsLoadingData(false);
    }
  };

  // Verificar se a demanda já está concluída
  const isDemandaConcluida = demanda?.status_nome?.toLowerCase() === "concluída" || 
                              demanda?.status_nome?.toLowerCase() === "concluido";
  
  // Verificar se o prazo está excedido no momento atual (usando prazo original da demanda)
  const isPrazoExcedido = demanda ? new Date(demanda.prazo_fim) < new Date() : false;

  const handleSave = async () => {
    if (!demanda) return;
    
    setIsLoading(true);
    try {
      // Se a demanda já está concluída, não permitir alterar o prazo
      const prazoFinal = isDemandaConcluida ? demanda.prazo_fim : formData.prazoFim;
      
      // Preparar dados de atualização
      const updateData: Record<string, any> = {
        titulo_demanda: formData.titulo,
        descricao_tarefa: formData.descricao,
        via_id: parseInt(formData.viaId),
        prioridade_id: parseInt(formData.prioridadeId),
        status_id: parseInt(formData.statusId),
        user_id: formData.responsavelId && formData.responsavelId !== "sem-atribuicao" 
          ? parseInt(formData.responsavelId) 
          : null,
        prazo_fim: prazoFinal,
      };

      const { error } = await supabase
        .from("tb_demanda")
        .update(updateData)
        .eq("dem_id", demanda.dem_id);

      if (error) throw error;

      toast.success("Demanda atualizada com sucesso!");
      setIsEditing(false);
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao atualizar demanda:", error);
      toast.error(error.message || "Erro ao atualizar demanda");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    if (demanda) {
      setFormData({
        titulo: demanda.titulo_demanda,
        descricao: demanda.descricao_tarefa,
        viaId: demanda.via_id.toString(),
        prioridadeId: demanda.prioridade_id.toString(),
        statusId: demanda.status_id.toString(),
        responsavelId: demanda.user_id?.toString() || "sem-atribuicao",
        prazoFim: formatDateTimeForInput(demanda.prazo_fim),
      });
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!demanda) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("tb_demanda")
        .delete()
        .eq("dem_id", demanda.dem_id);

      if (error) throw error;

      toast.success("Demanda excluída com sucesso!");
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao excluir demanda:", error);
      toast.error(error.message || "Erro ao excluir demanda");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!demanda) return null;

  const tempoRestante = calcularTempoRestante(demanda.prazo_fim);
  const viaInfo = getViaInfo(demanda.tem_email || false, demanda.tem_whatsapp || false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden">
        {/* Header com gradiente */}
        <div className="relative bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b">
          {/* Botão fechar customizado */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 rounded-full p-2 opacity-70 ring-offset-background transition-all hover:opacity-100 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar</span>
          </button>

          <div className="flex items-start justify-between pr-12">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                {isEditing ? (
                  <Pencil className="h-6 w-6 text-primary" />
                ) : (
                  <FileText className="h-6 w-6 text-primary" />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    <Hash className="h-3 w-3 mr-1" />
                    {demanda.dem_id}
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className={`border ${getStatusCor(demanda.status_nome || "")}`}
                  >
                    {demanda.status_nome || "Pendente"}
                  </Badge>
                </div>
                <DialogTitle className="text-xl font-semibold">
                  {isEditing ? "Editar Demanda" : demanda.titulo_demanda}
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Criada em {formatDateTime(demanda.prazo_inicio)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {!isEditing && canManageUsers && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive"
                      size="icon"
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir demanda?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação não pode ser desfeita. A demanda "{demanda.titulo_demanda}" será permanentemente excluída.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              
              {!isEditing && canEdit && (
                <Button 
                  onClick={() => setIsEditing(true)}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Editar
                </Button>
              )}
            </div>
          </div>
        </div>

        {isLoadingData ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Carregando dados...</span>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Cards de resumo - apenas no modo visualização */}
            {!isEditing && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* Status Card */}
                <Card className="border-0 shadow-sm bg-gradient-to-br from-background to-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${getStatusCor(demanda.status_nome || "")}`}>
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">Status</p>
                        <p className="font-semibold text-sm">{demanda.status_nome || "Pendente"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Prioridade Card */}
                <Card className="border-0 shadow-sm bg-gradient-to-br from-background to-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${tempoRestante.excedido ? 'bg-red-500/10 text-red-600' : getPrioridadeCor(demanda.prioridade_nivel || 3)}`}>
                        <Target className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">Prioridade</p>
                        <p className={`font-semibold text-sm ${tempoRestante.excedido ? 'text-red-600' : ''}`}>
                          {tempoRestante.excedido ? "Urgente" : demanda.prioridade_nome}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Prazo Card */}
                <Card className={`border-0 shadow-sm ${tempoRestante.excedido ? 'bg-gradient-to-br from-red-500/5 to-red-500/10' : 'bg-gradient-to-br from-background to-muted/30'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${tempoRestante.excedido ? 'bg-red-500/10 text-red-600' : 'bg-blue-500/10 text-blue-600'}`}>
                        {tempoRestante.excedido ? <AlertTriangle className="h-4 w-4" /> : <Timer className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">Prazo</p>
                        <p className={`font-semibold text-sm ${tempoRestante.excedido ? 'text-red-600' : ''}`}>
                          {tempoRestante.texto}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Canal Card */}
                <Card className="border-0 shadow-sm bg-gradient-to-br from-background to-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${viaInfo.color}`}>
                        {viaInfo.icon}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground font-medium">Canal</p>
                        <p className="font-semibold text-sm">{viaInfo.label}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Conteúdo principal em grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Coluna principal - 2/3 */}
              <div className="lg:col-span-2 space-y-6">
                {/* Título */}
                {isEditing && (
                  <Card className="border shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <Label htmlFor="titulo" className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Título da Demanda
                      </Label>
                      <Input
                        id="titulo"
                        value={formData.titulo}
                        onChange={(e) => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                        className="text-base"
                      />
                    </CardContent>
                  </Card>
                )}

                {/* Descrição */}
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Descrição
                    </Label>
                    {isEditing ? (
                      <Textarea
                        id="descricao"
                        rows={6}
                        value={formData.descricao}
                        onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                        className="resize-none"
                      />
                    ) : (
                      <div className="p-4 rounded-lg bg-muted/50 min-h-[120px]">
                        <p className="text-foreground whitespace-pre-wrap leading-relaxed">
                          {demanda.descricao_tarefa}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Status e Prioridade - apenas no modo edição */}
                {isEditing && (
                  <Card className="border shadow-sm">
                    <CardContent className="p-4 space-y-4">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Target className="h-4 w-4 text-muted-foreground" />
                        Status e Prioridade
                      </Label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="status" className="text-xs text-muted-foreground">Status</Label>
                          <Select
                            value={formData.statusId}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, statusId: value }))}
                          >
                            <SelectTrigger id="status">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {statusList.map((s) => (
                                <SelectItem key={s.status_id} value={s.status_id.toString()}>
                                  <Badge variant="outline" className={`border ${getStatusCor(s.status_nome)}`}>
                                    {s.status_nome}
                                  </Badge>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="prioridade" className="text-xs text-muted-foreground">Prioridade</Label>
                          <Select
                            value={formData.prioridadeId}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, prioridadeId: value }))}
                          >
                            <SelectTrigger id="prioridade">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {prioridades.map((p) => (
                                <SelectItem key={p.prioridade_id} value={p.prioridade_id.toString()}>
                                  <Badge variant="outline" className={`border ${getPrioridadeCor(p.prioridade_nivel)}`}>
                                    {p.prioridade_nome}
                                  </Badge>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="via" className="text-xs text-muted-foreground">Canal de Origem</Label>
                          <Select
                            value={formData.viaId}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, viaId: value }))}
                          >
                            <SelectTrigger id="via">
                              <SelectValue placeholder="Selecione" />
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
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Coluna lateral - 1/3 */}
              <div className="space-y-6">
                {/* Empresa */}
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      Empresa
                    </Label>
                    <div className="p-4 rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/10">
                      <p className="font-semibold text-foreground">{demanda.empresa_nome}</p>
                      <p className="text-xs text-muted-foreground font-mono mt-1">{demanda.empresa_cnpj}</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Responsável */}
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Responsável
                    </Label>
                    {isEditing ? (
                      <Select
                        value={formData.responsavelId}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, responsavelId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
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
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {demanda.responsavel_nome || (
                              <span className="text-muted-foreground italic">Não atribuído</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">Responsável</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Prazo */}
                <Card className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Prazo Final
                      {isDemandaConcluida && (
                        <Badge variant="outline" className="ml-2 text-xs bg-muted">
                          Bloqueado
                        </Badge>
                      )}
                    </Label>
                    {isEditing ? (
                      isDemandaConcluida ? (
                        <div className="p-4 rounded-lg bg-muted/50 border border-dashed">
                          <p className="font-semibold text-muted-foreground">
                            {formatDateTime(demanda.prazo_fim)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Não é possível alterar o prazo de demandas concluídas
                          </p>
                          {isPrazoExcedido && (
                            <Badge variant="destructive" className="mt-2">
                              Concluída com prazo excedido
                            </Badge>
                          )}
                        </div>
                      ) : (
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
                      )
                    ) : (
                      <div className={`p-4 rounded-lg ${tempoRestante.excedido ? 'bg-red-500/10 border border-red-500/20' : 'bg-muted/50'}`}>
                        <p className={`font-semibold ${tempoRestante.excedido ? 'text-red-600' : 'text-foreground'}`}>
                          {formatDateTime(demanda.prazo_fim)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          {tempoRestante.excedido ? (
                            <AlertTriangle className="h-4 w-4 text-red-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className={`text-sm ${tempoRestante.excedido ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                            {tempoRestante.texto}
                          </span>
                        </div>
                        {isDemandaConcluida && isPrazoExcedido && (
                          <Badge variant="destructive" className="mt-2">
                            Concluída com prazo excedido
                          </Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Datas */}
                {!isEditing && (
                  <Card className="border shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        Histórico
                      </Label>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Criada em</span>
                          <span className="font-medium">{formatDateTime(demanda.prazo_inicio)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Prazo final</span>
                          <span className="font-medium">{formatDateTime(demanda.prazo_fim)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Botões de ação - apenas no modo edição */}
            {isEditing && (
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={isLoading}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={isLoading || !formData.titulo || !formData.viaId || !formData.prioridadeId}
                  className="gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Salvar Alterações
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
