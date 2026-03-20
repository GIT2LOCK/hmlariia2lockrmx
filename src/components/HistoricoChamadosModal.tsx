import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Chamado {
  id: number;
  link_id: number;
  protocolo: string;
  codigo_servico: string | null;
  aberto_por: string | null;
  criado_em: string;
  operadora_nome: string;
}

interface HistoricoChamadosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unidadeId: number | null;
  unidadeNome?: string;
}

export function HistoricoChamadosModal({ open, onOpenChange, unidadeId, unidadeNome }: HistoricoChamadosModalProps) {
  const { toast } = useToast();
  const { canManageUsers } = useUser();
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && unidadeId) loadChamados(unidadeId);
    else setChamados([]);
  }, [open, unidadeId]);

  const loadChamados = async (id: number) => {
    setLoading(true);
    const { data } = await supabase
      .from("chamados" as any)
      .select("*, links_internet!inner(operadoras(nome))")
      .eq("unidade_id", id)
      .order("criado_em", { ascending: false });

    if (data) {
      setChamados(
        (data as any[]).map((c) => ({
          id: c.id,
          link_id: c.link_id,
          protocolo: c.protocolo,
          codigo_servico: c.codigo_servico,
          aberto_por: c.aberto_por,
          criado_em: c.criado_em,
          operadora_nome: c.links_internet?.operadoras?.nome || "—",
        }))
      );
    }
    setLoading(false);
  };

  const removeChamado = async (chamadoId: number) => {
    if (!confirm("Remover este registro de chamado?")) return;
    await supabase.from("chamados" as any).delete().eq("id", chamadoId);
    toast({ title: "Chamado removido" });
    if (unidadeId) loadChamados(unidadeId);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Chamados — {unidadeNome || ""}
          </DialogTitle>
        </DialogHeader>

        {loading && <p className="text-muted-foreground text-center py-8">Carregando...</p>}

        {!loading && chamados.length === 0 && (
          <p className="text-muted-foreground text-center py-8">Nenhum chamado registrado para esta unidade.</p>
        )}

        {!loading && chamados.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operadora</TableHead>
                <TableHead>Protocolo</TableHead>
                <TableHead>Cód. Serviço</TableHead>
                <TableHead>Aberto por</TableHead>
                <TableHead>Data</TableHead>
                {canManageUsers && <TableHead className="w-10"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {chamados.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><Badge variant="outline">{c.operadora_nome}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{c.protocolo}</TableCell>
                  <TableCell className="font-mono text-xs">{c.codigo_servico || "—"}</TableCell>
                  <TableCell className="text-sm">{c.aberto_por || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(c.criado_em)}</TableCell>
                  {canManageUsers && (
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => removeChamado(c.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
