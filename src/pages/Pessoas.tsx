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
import { Plus, Search, User, Building2, Loader2, Link as LinkIcon } from "lucide-react";
import { usePessoas, formatCpf, formatCnpj, Pessoa } from "@/hooks/usePessoas";
import { NovaPessoaModal } from "@/components/NovaPessoaModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Empresa {
  cnpj_id: number;
  razao_social: string;
  cnpj_numero: string;
}

const Pessoas = () => {
  const { pessoas, isLoading, error, refetch, addPessoa, addVinculo } = usePessoas();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPessoa, setSelectedPessoa] = useState<Pessoa | null>(null);
  const [novaModalOpen, setNovaModalOpen] = useState(false);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState("");
  const [isAddingVinculo, setIsAddingVinculo] = useState(false);

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

  const filteredPessoas = pessoas.filter(
    (pessoa) =>
      pessoa.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pessoa.cpf_numero.includes(searchTerm.replace(/\D/g, ""))
  );

  const handleAddVinculo = async () => {
    if (!selectedPessoa || !selectedEmpresa) return;
    
    setIsAddingVinculo(true);
    const result = await addVinculo(selectedPessoa.cpf_id, parseInt(selectedEmpresa));
    
    if (result.success) {
      toast.success("Vínculo adicionado com sucesso!");
      setSelectedEmpresa("");
      // Atualizar a pessoa selecionada
      const updated = pessoas.find(p => p.cpf_id === selectedPessoa.cpf_id);
      if (updated) setSelectedPessoa(updated);
    } else {
      toast.error(result.error || "Erro ao adicionar vínculo");
    }
    
    setIsAddingVinculo(false);
  };

  // Empresas disponíveis para vincular (excluindo as já vinculadas)
  const empresasDisponiveis = empresas.filter(
    emp => !selectedPessoa?.vinculos.some(v => v.cnpj_id === emp.cnpj_id)
  );

  // Atualizar selectedPessoa quando pessoas mudar
  useEffect(() => {
    if (selectedPessoa) {
      const updated = pessoas.find(p => p.cpf_id === selectedPessoa.cpf_id);
      if (updated) setSelectedPessoa(updated);
    }
  }, [pessoas]);

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
            Gerenciar pessoas e seus vínculos com empresas
          </p>
        </div>
        <Button onClick={() => setNovaModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Pessoa
        </Button>
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
                      <TableHead>Vínculos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPessoas.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                          Nenhuma pessoa encontrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredPessoas.map((pessoa) => (
                        <TableRow
                          key={pessoa.cpf_id}
                          className={`cursor-pointer hover:bg-muted/50 ${
                            selectedPessoa?.cpf_id === pessoa.cpf_id ? "bg-muted" : ""
                          }`}
                          onClick={() => setSelectedPessoa(pessoa)}
                        >
                          <TableCell className="font-medium">{pessoa.nome}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatCpf(pessoa.cpf_numero)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {pessoa.vinculos.length} empresa(s)
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
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Vínculos com Empresas
                  </h4>
                  {selectedPessoa.vinculos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum vínculo cadastrado
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {selectedPessoa.vinculos.map((vinculo) => (
                        <div
                          key={vinculo.cnpj_id}
                          className="p-3 rounded-lg bg-muted/50 text-sm"
                        >
                          <div className="font-medium">{vinculo.razao_social}</div>
                          <div className="text-muted-foreground">
                            {formatCnpj(vinculo.cnpj_numero)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

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
        addPessoa={addPessoa}
      />
    </div>
  );
};

export default Pessoas;
