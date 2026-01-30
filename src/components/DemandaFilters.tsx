import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Filter, 
  X, 
  CalendarIcon, 
  Building2, 
  User, 
  Tag, 
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export interface FilterState {
  dataInicio: Date | undefined;
  dataFim: Date | undefined;
  responsavelId: string;
  empresaId: string;
  prioridadeId: string;
  statusId: string;
  tipoDemandaId: string;
}

interface DemandaFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onClearFilters: () => void;
}

interface Prioridade {
  prioridade_id: number;
  prioridade_nome: string;
  prioridade_nivel: number;
}

interface Status {
  status_id: number;
  status_nome: string;
}

interface Usuario {
  user_id: number;
  nome: string;
}

interface Empresa {
  cnpj_id: number;
  razao_social: string;
}

interface TipoDemanda {
  id: number;
  nome: string;
  tipo: number;
}

const initialFilters: FilterState = {
  dataInicio: undefined,
  dataFim: undefined,
  responsavelId: "todos",
  empresaId: "todos",
  prioridadeId: "todos",
  statusId: "todos",
  tipoDemandaId: "todos",
};

export function DemandaFilters({ filters, onFiltersChange, onClearFilters }: DemandaFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [prioridades, setPrioridades] = useState<Prioridade[]>([]);
  const [statusList, setStatusList] = useState<Status[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [tiposDemanda, setTiposDemanda] = useState<TipoDemanda[]>([]);

  useEffect(() => {
    fetchFilterData();
  }, []);

  const fetchFilterData = async () => {
    try {
      const [prioridadesRes, statusRes, usuariosRes, empresasRes, tiposRes] = await Promise.all([
        supabase.from("tb_prioridade").select("*").order("prioridade_nivel"),
        supabase.from("tb_status").select("*").order("status_id"),
        supabase.from("tb_usuario").select("user_id, nome").eq("ativo", true),
        supabase.from("tb_cnpj").select("cnpj_id, razao_social"),
        supabase.from("tb_tipodemanda").select("id, nome, tipo").order("nome"),
      ]);

      if (prioridadesRes.data) setPrioridades(prioridadesRes.data);
      if (statusRes.data) setStatusList(statusRes.data);
      if (usuariosRes.data) setUsuarios(usuariosRes.data);
      if (empresasRes.data) setEmpresas(empresasRes.data);
      if (tiposRes.data) setTiposDemanda(tiposRes.data);
    } catch (error) {
      console.error("Erro ao carregar dados de filtros:", error);
    }
  };

  const activeFiltersCount = Object.entries(filters).filter(([key, value]) => {
    if (key === "dataInicio" || key === "dataFim") return value !== undefined;
    return value !== "todos";
  }).length;

  const handleClear = () => {
    onClearFilters();
  };

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            className="flex items-center gap-2 p-0 h-auto hover:bg-transparent"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Filter className="h-4 w-4" />
            <span className="font-medium">Filtros Avançados</span>
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFiltersCount} ativo{activeFiltersCount > 1 ? "s" : ""}
              </Badge>
            )}
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 ml-2" />
            ) : (
              <ChevronDown className="h-4 w-4 ml-2" />
            )}
          </Button>
          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <X className="h-4 w-4 mr-1" />
              Limpar filtros
            </Button>
          )}
        </div>

        {isExpanded && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Data Início */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                Data Início
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !filters.dataInicio && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dataInicio ? (
                      format(filters.dataInicio, "dd/MM/yyyy", { locale: ptBR })
                    ) : (
                      <span>Selecionar</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dataInicio}
                    onSelect={(date) =>
                      onFiltersChange({ ...filters, dataInicio: date })
                    }
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Data Fim */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                Data Fim
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !filters.dataFim && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filters.dataFim ? (
                      format(filters.dataFim, "dd/MM/yyyy", { locale: ptBR })
                    ) : (
                      <span>Selecionar</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dataFim}
                    onSelect={(date) =>
                      onFiltersChange({ ...filters, dataFim: date })
                    }
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Responsável */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" />
                Responsável
              </Label>
              <Select
                value={filters.responsavelId}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, responsavelId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="sem-atribuicao">Sem atribuição</SelectItem>
                  {usuarios.map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id.toString()}>
                      {u.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Empresa */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                Empresa
              </Label>
              <Select
                value={filters.empresaId}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, empresaId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {empresas.map((e) => (
                    <SelectItem key={e.cnpj_id} value={e.cnpj_id.toString()}>
                      {e.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prioridade */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Prioridade
              </Label>
              <Select
                value={filters.prioridadeId}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, prioridadeId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {prioridades.map((p) => (
                    <SelectItem key={p.prioridade_id} value={p.prioridade_id.toString()}>
                      {p.prioridade_nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Status
              </Label>
              <Select
                value={filters.statusId}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, statusId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {statusList.map((s) => (
                    <SelectItem key={s.status_id} value={s.status_id.toString()}>
                      {s.status_nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de Demanda */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Tag className="h-3 w-3" />
                Tipo de Demanda
              </Label>
              <Select
                value={filters.tipoDemandaId}
                onValueChange={(value) =>
                  onFiltersChange({ ...filters, tipoDemandaId: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {tiposDemanda.map((t) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { initialFilters };
