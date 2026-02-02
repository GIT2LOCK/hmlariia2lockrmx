import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Shield, FileText, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

const Configuracoes = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const [novoTipoDemandaOpen, setNovoTipoDemandaOpen] = useState(false);
  const [novoTipoNome, setNovoTipoNome] = useState("");
  const [novoTipoSLA, setNovoTipoSLA] = useState("");
  const [novoTipoTipo, setNovoTipoTipo] = useState("1");
  const [deleteTipoId, setDeleteTipoId] = useState<number | null>(null);
  const [deleteTipoNome, setDeleteTipoNome] = useState("");

  // Verificar se usuário é Admin ou superior
  const isAdmin = user?.role === "SUPERADMIN" || user?.role === "ADMIN";

  // Fetch permissões
  const { data: permissoes, isLoading: loadingPermissoes } = useQuery({
    queryKey: ["config-permissoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tb_permissao")
        .select("*")
        .order("permissao_id", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch tipos de demanda com prazo
  const { data: tiposDemanda, isLoading: loadingTipos } = useQuery({
    queryKey: ["config-tipodemanda"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tb_tipodemanda")
        .select(`
          id,
          nome,
          tipo,
          prazo_id,
          tb_prazo:prazo_id(id, descricao, prazo_minutos)
        `)
        .order("tipo", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch prazos disponíveis
  const { data: prazos } = useQuery({
    queryKey: ["config-prazos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tb_prazo")
        .select("*")
        .order("prazo_minutos", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Mutation para criar novo tipo de demanda
  const createTipoDemanda = useMutation({
    mutationFn: async (data: { nome: string; prazo_id: number; tipo: number }) => {
      const { error } = await supabase
        .from("tb_tipodemanda")
        .insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-tipodemanda"] });
      toast.success("Tipo de demanda criado com sucesso!");
      setNovoTipoDemandaOpen(false);
      setNovoTipoNome("");
      setNovoTipoSLA("");
      setNovoTipoTipo("1");
    },
    onError: (error: any) => {
      toast.error("Erro ao criar tipo de demanda: " + error.message);
    },
  });

  // Mutation para deletar tipo de demanda
  const deleteTipoDemanda = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("tb_tipodemanda")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["config-tipodemanda"] });
      toast.success("Tipo de demanda excluído com sucesso!");
      setDeleteTipoId(null);
      setDeleteTipoNome("");
    },
    onError: (error: any) => {
      toast.error("Erro ao excluir tipo de demanda: " + error.message);
    },
  });

  const handleDeleteTipoDemanda = (id: number, nome: string) => {
    setDeleteTipoId(id);
    setDeleteTipoNome(nome);
  };

  const confirmDeleteTipoDemanda = () => {
    if (deleteTipoId) {
      deleteTipoDemanda.mutate(deleteTipoId);
    }
  };

  const handleCreateTipoDemanda = () => {
    if (!novoTipoNome.trim()) {
      toast.error("Informe o nome do tipo de demanda");
      return;
    }
    if (!novoTipoSLA) {
      toast.error("Selecione o prazo de SLA");
      return;
    }
    
    createTipoDemanda.mutate({
      nome: novoTipoNome.trim(),
      prazo_id: parseInt(novoTipoSLA),
      tipo: parseInt(novoTipoTipo),
    });
  };

  const formatSLA = (minutos: number) => {
    if (minutos < 60) return `${minutos} min`;
    if (minutos < 1440) return `${Math.round(minutos / 60)}h`;
    return `${Math.round(minutos / 1440)} dia(s)`;
  };

  const getTipoLabel = (tipo: number) => {
    const labels: Record<number, string> = {
      1: "Tipo 1 - Rápido",
      2: "Tipo 2 - Médio",
      3: "Tipo 3 - Longo",
    };
    return labels[tipo] || `Tipo ${tipo}`;
  };

  const getTipoBadgeVariant = (tipo: number) => {
    if (tipo === 1) return "default";
    if (tipo === 2) return "secondary";
    return "outline";
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Configurações</h2>
        <p className="text-muted-foreground">
          Gerenciar tabelas de apoio do sistema
        </p>
      </div>

      <Tabs defaultValue="permissoes" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="permissoes" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Permissões</span>
          </TabsTrigger>
          <TabsTrigger value="tipodemanda" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Tipo de Demanda</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissoes">
          <Card>
            <CardHeader>
              <CardTitle>Permissões</CardTitle>
              <CardDescription>
                Níveis de acesso do sistema (somente leitura)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loadingPermissoes ? (
                <div className="p-4 space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Descrição</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permissoes?.map((permissao) => (
                      <TableRow key={permissao.permissao_id}>
                        <TableCell>
                          <Badge variant="outline">{permissao.permissao_id}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {permissao.nome}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {permissao.descricao || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tipodemanda">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tipos de Demanda</CardTitle>
                <CardDescription>
                  Tipificação de serviços com prazo de SLA
                </CardDescription>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={() => setNovoTipoDemandaOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Tipo
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {loadingTipos ? (
                <div className="p-4 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>SLA</TableHead>
                      {isAdmin && <TableHead className="w-[80px]">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiposDemanda?.map((tipo) => (
                      <TableRow key={tipo.id}>
                        <TableCell>
                          <Badge variant="outline">{tipo.id}</Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {tipo.nome}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getTipoBadgeVariant(tipo.tipo)}>
                            {getTipoLabel(tipo.tipo)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {tipo.tb_prazo 
                              ? formatSLA((tipo.tb_prazo as any).prazo_minutos) 
                              : "-"}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteTipoDemanda(tipo.id, tipo.nome)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal para novo tipo de demanda */}
      <Dialog open={novoTipoDemandaOpen} onOpenChange={setNovoTipoDemandaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Tipo de Demanda</DialogTitle>
            <DialogDescription>
              Cadastre um novo tipo de demanda com seu prazo de SLA
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do Tipo</Label>
              <Input
                id="nome"
                placeholder="Ex: Nota Fiscal, Boleto, etc."
                value={novoTipoNome}
                onChange={(e) => setNovoTipoNome(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria</Label>
              <Select value={novoTipoTipo} onValueChange={setNovoTipoTipo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Tipo 1 - Rápido (até 20min)</SelectItem>
                  <SelectItem value="2">Tipo 2 - Médio (até 60min)</SelectItem>
                  <SelectItem value="3">Tipo 3 - Longo (até 48h)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sla">Prazo de SLA</Label>
              <Select value={novoTipoSLA} onValueChange={setNovoTipoSLA}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o prazo" />
                </SelectTrigger>
                <SelectContent>
                  {prazos?.map((prazo) => (
                    <SelectItem key={prazo.id} value={prazo.id.toString()}>
                      {prazo.descricao} ({formatSLA(prazo.prazo_minutos)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoTipoDemandaOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateTipoDemanda}
              disabled={createTipoDemanda.isPending}
            >
              {createTipoDemanda.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog para confirmação de exclusão */}
      <AlertDialog open={!!deleteTipoId} onOpenChange={(open) => !open && setDeleteTipoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o tipo de demanda "{deleteTipoNome}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTipoDemanda}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTipoDemanda.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Configuracoes;
