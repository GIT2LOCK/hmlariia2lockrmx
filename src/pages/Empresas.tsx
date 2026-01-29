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
import { Plus, Search, Building2, Mail, Phone, MapPin, Loader2, Eye, Trash2 } from "lucide-react";
import { NovaEmpresaModal } from "@/components/NovaEmpresaModal";
import { VisualizarEmpresaModal } from "@/components/VisualizarEmpresaModal";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
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

interface Empresa {
  cnpj_id: number;
  razao_social: string;
  cnpj_numero: string;
  responsavel_nome: string | null;
  email_principal: string | null;
  telefone_principal: string | null;
  endereco_completo: string | null;
  demandas_ativas: number;
  superior_cnpj: string | null;
}

const Empresas = () => {
  const { canManageUsers } = useUser();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresa | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetalhesModalOpen, setIsDetalhesModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchEmpresas = async () => {
    setIsLoading(true);
    try {
      // Buscar empresas com dados relacionados
      const { data, error } = await supabase
        .from("tb_cnpj")
        .select(`
          cnpj_id,
          razao_social,
          cnpj_numero,
          responsavel_nome,
          superior_cnpj,
          agencia,
          tb_categoria:cat_id(categoria),
          tb_email:email_id(email_principal),
          tb_numero:tel_id(telefone_principal),
          tb_endereco:end_id(logradouro, numero, bairro, uf)
        `)
        .order("razao_social", { ascending: true });

      if (error) throw error;

      // Buscar contagem de demandas por empresa
      const { data: demandasData, error: demandasError } = await supabase
        .from("tb_demanda")
        .select(`
          cnpj_cpf_id,
          tb_cpf_cnpj:cnpj_cpf_id(cnpj_id)
        `);

      if (demandasError) throw demandasError;

      // Contar demandas por cnpj_id
      const demandasCount: Record<number, number> = {};
      (demandasData || []).forEach((d: any) => {
        const cnpjId = d.tb_cpf_cnpj?.cnpj_id;
        if (cnpjId) {
          demandasCount[cnpjId] = (demandasCount[cnpjId] || 0) + 1;
        }
      });

      // Função para formatar CNPJ
      const formatCnpj = (cnpj: string | null) => {
        if (!cnpj) return null;
        const cleaned = cnpj.replace(/\D/g, '');
        if (cleaned.length !== 14) return cnpj;
        return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      };

      // Função para calcular o valor de "Superior" baseado na categoria
      // Agora buscamos o nome da empresa superior pelo CNPJ
      const calcularSuperior = (categoria: string | null, agencia: string | null, superiorCnpj: string | null): string | null => {
        if (!categoria) return null;
        
        // MFA/LA → usar agencia
        if (categoria === "MFA/LA") {
          return agencia;
        }
        
        // MFB/LU ou LP/Consultor → buscar nome da empresa pelo superior_cnpj
        if (categoria === "MFB/LU" || categoria === "LP/Consultor") {
          if (!superiorCnpj) return null;
          // Buscar o nome da empresa superior na lista de dados
          const empresaSuperior = (data || []).find((emp: any) => emp.cnpj_numero === superiorCnpj);
          return empresaSuperior?.razao_social || formatCnpj(superiorCnpj);
        }
        
        return null;
      };

      const empresasFormatadas = (data || []).map((e: any) => {
        const categoria = e.tb_categoria?.categoria || null;
        
        return {
          cnpj_id: e.cnpj_id,
          razao_social: e.razao_social,
          cnpj_numero: e.cnpj_numero,
          responsavel_nome: e.responsavel_nome,
          email_principal: e.tb_email?.email_principal || null,
          telefone_principal: e.tb_numero?.telefone_principal || null,
          endereco_completo: e.tb_endereco
            ? `${e.tb_endereco.logradouro}${e.tb_endereco.numero ? `, ${e.tb_endereco.numero}` : ""} - ${e.tb_endereco.bairro}/${e.tb_endereco.uf}`
            : null,
          demandas_ativas: demandasCount[e.cnpj_id] || 0,
          superior_cnpj: calcularSuperior(categoria, e.agencia, e.superior_cnpj),
        };
      });

      setEmpresas(empresasFormatadas);
    } catch (error) {
      console.error("Erro ao buscar empresas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmpresas();
  }, []);

  const filteredEmpresas = empresas.filter(
    (empresa) =>
      empresa.razao_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
      empresa.cnpj_numero.includes(searchTerm)
  );

  const handleEmpresaCadastrada = () => {
    fetchEmpresas();
  };

  const handleDeleteEmpresa = async () => {
    if (!selectedEmpresa) return;

    setIsDeleting(true);
    try {
      // Buscar dados relacionados da empresa
      const { data: empresaData } = await supabase
        .from("tb_cnpj")
        .select("email_id, tel_id, end_id")
        .eq("cnpj_id", selectedEmpresa.cnpj_id)
        .single();

      // Deletar vínculos de responsáveis
      await supabase
        .from("tb_responsavel_cnpj")
        .delete()
        .eq("cnpj_id", selectedEmpresa.cnpj_id);

      // Deletar vínculos de cpf_cnpj
      await supabase
        .from("tb_cpf_cnpj")
        .delete()
        .eq("cnpj_id", selectedEmpresa.cnpj_id);

      // Deletar a empresa
      const { error: deleteError } = await supabase
        .from("tb_cnpj")
        .delete()
        .eq("cnpj_id", selectedEmpresa.cnpj_id);

      if (deleteError) throw deleteError;

      // Deletar registros relacionados (email, telefone, endereço)
      if (empresaData?.email_id) {
        await supabase.from("tb_email").delete().eq("email_id", empresaData.email_id);
      }
      if (empresaData?.tel_id) {
        await supabase.from("tb_numero").delete().eq("tel_id", empresaData.tel_id);
      }
      if (empresaData?.end_id) {
        await supabase.from("tb_endereco").delete().eq("end_id", empresaData.end_id);
      }

      toast.success("Empresa excluída com sucesso!");
      setSelectedEmpresa(null);
      fetchEmpresas();
    } catch (error: any) {
      console.error("Erro ao excluir empresa:", error);
      toast.error(error.message || "Erro ao excluir empresa");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Empresas</h2>
          <p className="text-muted-foreground">
            Cadastro e consulta de empresas/clientes
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Empresa
        </Button>
      </div>

      <NovaEmpresaModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSuccess={handleEmpresaCadastrada}
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por razão social ou CNPJ..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lista de Empresas</CardTitle>
              <CardDescription>
                {filteredEmpresas.length} empresa(s) encontrada(s)
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Carregando empresas...</span>
                </div>
              ) : filteredEmpresas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Building2 className="h-12 w-12 mb-4 opacity-50" />
                  <p>Nenhuma empresa cadastrada</p>
                  <p className="text-sm">Clique em "Nova Empresa" para cadastrar</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Responsável</TableHead>
                      <TableHead>Superior</TableHead>
                      <TableHead>Demandas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEmpresas.map((empresa) => (
                      <TableRow
                        key={empresa.cnpj_id}
                        className={`cursor-pointer hover:bg-muted/50 ${
                          selectedEmpresa?.cnpj_id === empresa.cnpj_id ? "bg-muted" : ""
                        }`}
                        onClick={() => setSelectedEmpresa(empresa)}
                      >
                        <TableCell>
                          <div>
                            <div className="font-medium">{empresa.razao_social}</div>
                            <div className="text-sm text-muted-foreground">
                              {empresa.cnpj_numero}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {empresa.responsavel_nome || (
                            <span className="text-muted-foreground italic">Não informado</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {empresa.superior_cnpj ? (
                            <span className="text-sm font-mono">{empresa.superior_cnpj}</span>
                          ) : (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={empresa.demandas_ativas > 0 ? "default" : "secondary"}>
                            {empresa.demandas_ativas} ativa(s)
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          {selectedEmpresa ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Detalhes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {selectedEmpresa.razao_social}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedEmpresa.cnpj_numero}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {selectedEmpresa.email_principal && (
                      <div className="flex items-center gap-2 text-sm">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedEmpresa.email_principal}</span>
                      </div>
                    )}
                    {selectedEmpresa.telefone_principal && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{selectedEmpresa.telefone_principal}</span>
                      </div>
                    )}
                    {selectedEmpresa.endereco_completo && (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span>{selectedEmpresa.endereco_completo}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Informações</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Responsável:</span>
                        <span>{selectedEmpresa.responsavel_nome || "Não informado"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Demandas ativas:</span>
                        <Badge variant={selectedEmpresa.demandas_ativas > 0 ? "default" : "secondary"}>
                          {selectedEmpresa.demandas_ativas}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full" variant="outline">
                    Ver demandas desta empresa
                  </Button>
                  <Button 
                    className="w-full" 
                    variant="secondary"
                    onClick={() => setIsDetalhesModalOpen(true)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Detalhes
                  </Button>
                  
                  {canManageUsers && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          className="w-full" 
                          variant="destructive"
                          disabled={isDeleting}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir Empresa
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir a empresa "{selectedEmpresa.razao_social}"? 
                            Esta ação não pode ser desfeita e todos os vínculos serão removidos.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={handleDeleteEmpresa}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {isDeleting ? "Excluindo..." : "Excluir"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </CardContent>
              </Card>

              <VisualizarEmpresaModal
                open={isDetalhesModalOpen}
                onOpenChange={setIsDetalhesModalOpen}
                cnpjId={selectedEmpresa.cnpj_id}
                onUpdate={fetchEmpresas}
              />
            </>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-64 text-muted-foreground">
                Selecione uma empresa para ver os detalhes
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Empresas;
