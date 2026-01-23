import { useState } from "react";
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
  AlertCircle,
  Tag,
  Loader2
} from "lucide-react";

interface NovaDemandaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Mock de empresas para seleção
const mockEmpresas = [
  { id: 1, nome: "Tech Solutions LTDA", cnpj: "12.345.678/0001-90" },
  { id: 2, nome: "Comércio ABC", cnpj: "98.765.432/0001-10" },
  { id: 3, nome: "Indústria XYZ", cnpj: "11.222.333/0001-44" },
  { id: 4, nome: "Serviços Gerais ME", cnpj: "55.666.777/0001-88" },
];

// Mock de tipos de demanda
const tiposDemanda = [
  { id: 1, nome: "Declaração de IR", categoria: "Fiscal" },
  { id: 2, nome: "Balanço Patrimonial", categoria: "Contábil" },
  { id: 3, nome: "Certidão Negativa", categoria: "Fiscal" },
  { id: 4, nome: "Folha de Pagamento", categoria: "Pessoal" },
  { id: 5, nome: "Regularização Fiscal", categoria: "Fiscal" },
  { id: 6, nome: "Atualização Cadastral", categoria: "Administrativo" },
  { id: 7, nome: "Outro", categoria: "Geral" },
];

// Mock de usuários para atribuição
const mockUsuarios = [
  { id: 1, nome: "João Silva" },
  { id: 2, nome: "Maria Santos" },
  { id: 3, nome: "Pedro Oliveira" },
  { id: 4, nome: "Ana Costa" },
];

// Prioridades
const prioridades = [
  { id: "baixa", nome: "Baixa", cor: "bg-green-100 text-green-700" },
  { id: "media", nome: "Média", cor: "bg-yellow-100 text-yellow-700" },
  { id: "alta", nome: "Alta", cor: "bg-orange-100 text-orange-700" },
  { id: "urgente", nome: "Urgente", cor: "bg-red-100 text-red-700" },
];

export function NovaDemandaModal({ open, onOpenChange }: NovaDemandaModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    empresaId: "",
    tipoDemanda: "",
    titulo: "",
    descricao: "",
    via: "",
    prioridade: "media",
    responsavelId: "",
    prazo: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simular envio
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log("Nova demanda:", formData);
    setIsLoading(false);
    onOpenChange(false);
    
    // Reset form
    setFormData({
      empresaId: "",
      tipoDemanda: "",
      titulo: "",
      descricao: "",
      via: "",
      prioridade: "media",
      responsavelId: "",
      prazo: "",
    });
  };

  const empresaSelecionada = mockEmpresas.find(e => e.id.toString() === formData.empresaId);
  const tipoDemandaSelecionado = tiposDemanda.find(t => t.id.toString() === formData.tipoDemanda);

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

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção: Identificação */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              <span>Identificação</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    {mockEmpresas.map((empresa) => (
                      <SelectItem key={empresa.id} value={empresa.id.toString()}>
                        <div className="flex flex-col">
                          <span>{empresa.nome}</span>
                          <span className="text-xs text-muted-foreground">{empresa.cnpj}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {empresaSelecionada && (
                  <p className="text-xs text-muted-foreground">
                    CNPJ: {empresaSelecionada.cnpj}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo de Demanda *</Label>
                <Select
                  value={formData.tipoDemanda}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, tipoDemanda: value }))}
                >
                  <SelectTrigger id="tipo">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposDemanda.map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id.toString()}>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {tipo.categoria}
                          </Badge>
                          <span>{tipo.nome}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                  value={formData.via}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, via: value }))}
                >
                  <SelectTrigger id="via">
                    <SelectValue placeholder="Selecione o canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-purple-600" />
                        <span>Email</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="whatsapp">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-green-600" />
                        <span>WhatsApp</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="telefone">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-600" />
                        <span>Telefone</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="presencial">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-orange-600" />
                        <span>Presencial</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="prioridade">Prioridade *</Label>
                <Select
                  value={formData.prioridade}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, prioridade: value }))}
                >
                  <SelectTrigger id="prioridade">
                    <SelectValue placeholder="Selecione a prioridade" />
                  </SelectTrigger>
                  <SelectContent>
                    {prioridades.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <Badge variant="secondary" className={p.cor}>
                          {p.nome}
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
                    {mockUsuarios.map((usuario) => (
                      <SelectItem key={usuario.id} value={usuario.id.toString()}>
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
                <Label htmlFor="prazo">Prazo</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="prazo"
                    type="datetime-local"
                    className="pl-10"
                    value={formData.prazo}
                    onChange={(e) => setFormData(prev => ({ ...prev, prazo: e.target.value }))}
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
              disabled={isLoading || !formData.empresaId || !formData.tipoDemanda || !formData.titulo || !formData.via}
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
      </DialogContent>
    </Dialog>
  );
}
