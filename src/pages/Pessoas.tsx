import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Search, User, Building2, Loader2, Link as LinkIcon, Phone, Mail, MapPin, Trash2 } from "lucide-react";
import { useResponsaveis, formatCpf, formatCnpj, formatPhone, Responsavel } from "@/hooks/useResponsaveis";
import { NovaPessoaModal } from "@/components/NovaPessoaModal";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";

interface Empresa {
  cnpj_id: number;
  razao_social: string;
  cnpj_numero: string;
}

const Pessoas = () => {
  const { canManageUsers, canEdit } = useUser();
  const { responsaveis, isLoading, error, refetch, addVinculo, removeVinculo } = useResponsaveis();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPessoa, setSelectedPessoa] = useState<Responsavel | null>(null);
  const [novaModalOpen, setNovaModalOpen] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState("");
  const [isAddingVinculo, setIsAddingVinculo] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Buscar empresas para vincular
  useEffect(() => {
    const fetchEmpresas = async () => {
      const { data } = await supabase
        .from("tb_cnpj")
        .select("cnpj_id, razao_social, cnpj_numero")
        .order("razao_social");
      
      if (data) setEmpresas(data);
    };
    fetchEmpresas();
  }, []);

  const filteredPessoas = responsaveis.filter(
    (pessoa) =>
      pessoa.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pessoa.cpf_numero.includes(searchTerm.replace(/\D/g, ""))
  );

  const handleAddVinculo = async () => {
    if (!selectedPessoa || !selectedEmpresa) return;
    
    setIsAddingVinculo(true);
    const result = await addVinculo(selectedPessoa.responsavel_id, parseInt(selectedEmpresa));
    
    if (result.success) {
      toast.success("Vínculo adicionado com sucesso!");
      setSelectedEmpresa("");
    } else {
      toast.error(result.error || "Erro ao adicionar vínculo");
    }
    
    setIsAddingVinculo(false);
  };

  const handleRemoveVinculo = async (cnpjId: number) => {
    if (!selectedPessoa) return;
    
    const result = await removeVinculo(selectedPessoa.responsavel_id, cnpjId);
    
    if (result.success) {
      toast.success("Vínculo removido com sucesso!");
    } else {
      toast.error(result.error || "Erro ao remover vínculo");
    }
  };

  const handleDeletePessoa = async () => {
    if (!selectedPessoa) return;

    setIsDeleting(true);
    try {
      // Deletar vínculos primeiro
      await supabase
        .from("tb_responsavel_cnpj")
        .delete()
        .eq("responsavel_id", selectedPessoa.responsavel_id);

      // Buscar end_id do responsável
      const { data: respData } = await supabase
        .from("tb_responsavel")
        .select("end_id")
        .eq("responsavel_id", selectedPessoa.responsavel_id)
        .single();

      // Deletar o responsável
      const { error: deleteError } = await supabase
        .from("tb_responsavel")
        .delete()
        .eq("responsavel_id", selectedPessoa.responsavel_id);

      if (deleteError) throw deleteError;

      // Deletar endereço se existir
      if (respData?.end_id) {
        await supabase.from("tb_endereco").delete().eq("end_id", respData.end_id);
      }

      toast.success("Pessoa excluída com sucesso!");
      setSelectedPessoa(null);
      refetch();
    } catch (error: any) {
      console.error("Erro ao excluir pessoa:", error);
      toast.error(error.message || "Erro ao excluir pessoa");
    } finally {
      setIsDeleting(false);
    }
  };

  // Empresas disponíveis para vincular (excluindo as já vinculadas)
  const empresasDisponiveis = empresas.filter(
    emp => !selectedPessoa?.empresas.some(e => e.cnpj_id === emp.cnpj_id)
  );

  // Atualizar selectedPessoa quando responsaveis mudar
  useEffect(() => {
    if (selectedPessoa) {
      const updated = responsaveis.find(p => p.responsavel_id === selectedPessoa.responsavel_id);
      if (updated) setSelectedPessoa(updated);
    }
  }, [responsaveis]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Erro ao carregar pessoas: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Pessoas</h2>
          <p className="text-muted-foreground">
            Gerenciar responsáveis e seus vínculos com empresas
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setNovaModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Pessoa
          </Button>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou CPF..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Pessoas</CardTitle>
              <CardDescription>
                {isLoading ? "Carregando..." : `${filteredPessoas.length} pessoa(s) encontrada(s)`}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Empresas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPessoas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhuma pessoa encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPessoas.map((pessoa) => (
                        <TableRow
                          key={pessoa.responsavel_id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            selectedPessoa?.responsavel_id === pessoa.responsavel_id ? "bg-muted" : ""
                          }`}
                          onClick={() => setSelectedPessoa(pessoa)}
                        >
                          <TableCell className="font-medium">{pessoa.nome}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatCpf(pessoa.cpf_numero)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {pessoa.telefone_principal ? formatPhone(pessoa.telefone_principal) : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {pessoa.empresas.length} empresa(s)
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          {selectedPessoa ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Detalhes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-lg">{selectedPessoa.nome}</h3>
                  <p className="text-sm text-muted-foreground">
                    CPF: {formatCpf(selectedPessoa.cpf_numero)}
                  </p>
                  {selectedPessoa.rg && (
                    <p className="text-sm text-muted-foreground">
                      RG: {selectedPessoa.rg}
                    </p>
                  )}
                </div>

                {/* Contato */}
                {(selectedPessoa.telefone_principal || selectedPessoa.email_principal) && (
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2 flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4" />
                      Contato
                    </h4>
                    <div className="space-y-1 text-sm">
                      {selectedPessoa.telefone_principal && (
                        <p className="text-muted-foreground">
                          Tel: {formatPhone(selectedPessoa.telefone_principal)}
                        </p>
                      )}
                      {selectedPessoa.telefone_alternativo && (
                        <p className="text-muted-foreground">
                          Alt: {formatPhone(selectedPessoa.telefone_alternativo)}
                        </p>
                      )}
                      {selectedPessoa.email_principal && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {selectedPessoa.email_principal}
                        </p>
                      )}
                      {selectedPessoa.email_alternativo && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {selectedPessoa.email_alternativo}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Endereço */}
                {selectedPessoa.endereco && (
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2 flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4" />
                      Endereço
                    </h4>
                    <div className="text-sm text-muted-foreground">
                      <p>{selectedPessoa.endereco.logradouro}, {selectedPessoa.endereco.numero}</p>
                      {selectedPessoa.endereco.complemento && <p>{selectedPessoa.endereco.complemento}</p>}
                      <p>{selectedPessoa.endereco.bairro} - {selectedPessoa.endereco.uf}</p>
                      <p>CEP: {selectedPessoa.endereco.cep}</p>
                    </div>
                  </div>
                )}

                {/* Empresas vinculadas */}
                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Empresas Vinculadas
                  </h4>
                  {selectedPessoa.empresas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum vínculo cadastrado
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedPessoa.empresas.map((empresa) => (
                        <div
                          key={empresa.cnpj_id}
                          className="p-3 rounded-lg bg-muted/50 text-sm flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium">{empresa.razao_social}</div>
                            <div className="text-muted-foreground">
                              {formatCnpj(empresa.cnpj_numero)}
                            </div>
                          </div>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveVinculo(empresa.cnpj_id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Adicionar vínculo - apenas para quem pode editar */}
                {canEdit && (
                  <div className="pt-4 border-t space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      Adicionar Vínculo
                    </h4>
                    <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {empresasDisponiveis.length === 0 ? (
                          <SelectItem value="none" disabled>
                            Nenhuma empresa disponível
                          </SelectItem>
                        ) : (
                          empresasDisponiveis.map((emp) => (
                            <SelectItem key={emp.cnpj_id} value={emp.cnpj_id.toString()}>
                              <div className="flex flex-col">
                                <span className="font-medium">{emp.razao_social}</span>
                                <span className="text-xs text-muted-foreground">
                                  {formatCnpj(emp.cnpj_numero)}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button 
                      className="w-full" 
                      onClick={handleAddVinculo}
                      disabled={!selectedEmpresa || isAddingVinculo}
                    >
                      {isAddingVinculo ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Adicionando...
                        </>
                      ) : (
                        "Adicionar vínculo"
                      )}
                    </Button>
                  </div>
                )}

                {/* Botão Excluir Pessoa - apenas Admin/Superadmin */}
                {canManageUsers && (
                  <div className="pt-4 border-t">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          className="w-full" 
                          variant="destructive"
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir Pessoa
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir "{selectedPessoa.nome}"? 
                            Esta ação não pode ser desfeita e todos os vínculos com empresas serão removidos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={handleDeletePessoa}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {isDeleting ? "Excluindo..." : "Excluir"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
                Selecione uma pessoa para ver os detalhes
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <NovaPessoaModal
        open={novaModalOpen}
        onOpenChange={setNovaModalOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
};

export default Pessoas;
