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
  Loader2,
  Pencil,
  Save,
  X,
  Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
      return "bg-red-100 text-red-700";
    case 2:
      return "bg-orange-100 text-orange-700";
    case 3:
      return "bg-yellow-100 text-yellow-700";
    case 4:
    case 5:
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

const getStatusCor = (statusNome: string): string => {
  switch (statusNome?.toLowerCase()) {
    case "concluído":
    case "concluido":
      return "bg-green-100 text-green-700";
    case "em andamento":
      return "bg-blue-100 text-blue-700";
    case "pendente":
      return "bg-yellow-100 text-yellow-700";
    case "cancelado":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
};

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

const getViaLabelSimple = (temEmail: boolean, temWhatsapp: boolean): string => {
  if (temEmail && temWhatsapp) return "Email + WhatsApp";
  if (temEmail) return "Email";
  if (temWhatsapp) return "WhatsApp";
  return "Telefone";
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

export function VisualizarDemandaModal({ 
  open, 
  onOpenChange, 
  demanda, 
  onSuccess 
}: VisualizarDemandaModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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

  const handleSave = async () => {
    if (!demanda) return;
    
    setIsLoading(true);
    try {
      const updateData = {
        titulo_demanda: formData.titulo,
        descricao_tarefa: formData.descricao,
        via_id: parseInt(formData.viaId),
        prioridade_id: parseInt(formData.prioridadeId),
        status_id: parseInt(formData.statusId),
        user_id: formData.responsavelId && formData.responsavelId !== "sem-atribuicao" 
          ? parseInt(formData.responsavelId) 
          : null,
        prazo_fim: formData.prazoFim,
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

  if (!demanda) return null;

  const selectedPrioridade = prioridades.find(p => p.prioridade_id.toString() === formData.prioridadeId);
  const selectedStatus = statusList.find(s => s.status_id.toString() === formData.statusId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                {isEditing ? <Pencil className="h-5 w-5 text-primary" /> : <Eye className="h-5 w-5 text-primary" />}
              </div>
              <div>
                <DialogTitle className="text-xl">
                  {isEditing ? "Editar Demanda" : "Detalhes da Demanda"}
                </DialogTitle>
                <DialogDescription>
                  {isEditing ? "Edite os campos abaixo" : `Demanda #${demanda.dem_id}`}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {isLoadingData ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Carregando dados...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Seção: Empresa */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>Empresa</span>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="font-medium">{demanda.empresa_nome}</p>
                <p className="text-sm text-muted-foreground">{demanda.empresa_cnpj}</p>
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
                <Label htmlFor="titulo">Título</Label>
                {isEditing ? (
                  <Input
                    id="titulo"
                    value={formData.titulo}
                    onChange={(e) => setFormData(prev => ({ ...prev, titulo: e.target.value }))}
                  />
                ) : (
                  <p className="text-foreground font-medium p-2 rounded bg-muted/50">{demanda.titulo_demanda}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                {isEditing ? (
                  <Textarea
                    id="descricao"
                    rows={4}
                    value={formData.descricao}
                    onChange={(e) => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
                  />
                ) : (
                  <p className="text-foreground p-2 rounded bg-muted/50 whitespace-pre-wrap">{demanda.descricao_tarefa}</p>
                )}
              </div>
            </div>

            <Separator />

            {/* Seção: Canal, Status e Prioridade */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span>Canal, Status e Prioridade</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="via">Canal de Origem</Label>
                  {isEditing ? (
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
                  ) : (
                    <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                      {demanda.tem_email ? <Mail className="h-4 w-4 text-purple-600" /> : 
                       demanda.tem_whatsapp ? <MessageSquare className="h-4 w-4 text-green-600" /> : 
                       <Phone className="h-4 w-4 text-blue-600" />}
                      <span>{getViaLabelSimple(demanda.tem_email || false, demanda.tem_whatsapp || false)}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  {isEditing ? (
                    <Select
                      value={formData.statusId}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, statusId: value }))}
                    >
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                      <SelectContent>
                        {statusList.map((s) => (
                          <SelectItem key={s.status_id} value={s.status_id.toString()}>
                            <Badge variant="secondary" className={getStatusCor(s.status_nome)}>
                              {s.status_nome}
                            </Badge>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-2 rounded bg-muted/50">
                      <Badge variant="secondary" className={getStatusCor(demanda.status_nome || "")}>
                        {demanda.status_nome || "Pendente"}
                      </Badge>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prioridade">Prioridade</Label>
                  {isEditing ? (
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
                  ) : (
                    <div className="p-2 rounded bg-muted/50">
                      <Badge variant="secondary" className={getPrioridadeCor(demanda.prioridade_nivel || 3)}>
                        {demanda.prioridade_nome}
                      </Badge>
                    </div>
                  )}
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
                  {isEditing ? (
                    <Select
                      value={formData.responsavelId}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, responsavelId: value }))}
                    >
                      <SelectTrigger id="responsavel">
                        <SelectValue placeholder="Atribuir a alguém" />
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
                    <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                      <User className="h-4 w-4" />
                      <span>{demanda.responsavel_nome || <span className="text-muted-foreground italic">Não atribuído</span>}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prazoFim">Prazo Final</Label>
                  {isEditing ? (
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
                  ) : (
                    <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDateTime(demanda.prazo_fim)}</span>
                    </div>
                  )}
                </div>
              </div>

              {!isEditing && (
                <div className="space-y-2">
                  <Label>Data de Criação</Label>
                  <div className="flex items-center gap-2 p-2 rounded bg-muted/50">
                    <Clock className="h-4 w-4" />
                    <span>{formatDateTime(demanda.prazo_inicio)}</span>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Botões de ação */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              {isEditing ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={isLoading}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleSave}
                    disabled={isLoading || !formData.titulo || !formData.viaId || !formData.prioridadeId}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Salvar
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Fechar
                  </Button>
                  <Button onClick={() => setIsEditing(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
