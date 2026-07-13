import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { updateTicketViaEdge } from "@/lib/ticketActions";

export const MOTIVOS_ENCERRAMENTO = [
  { value: "PROBLEMA_RESOLVIDO", label: "Problema resolvido" },
  { value: "SOLICITACAO_ATENDIDA", label: "Solicitação atendida" },
  { value: "AJUSTE_REALIZADO", label: "Ajuste realizado" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "DUPLICIDADE", label: "Duplicidade" },
  { value: "OUTRO", label: "Outro" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: any;
  onClosed?: () => void;
}

export function EncerramentoModal({ open, onOpenChange, ticket, onClosed }: Props) {
  const [diagnostico, setDiagnostico] = useState("");
  const [procedimentos, setProcedimentos] = useState("");
  const [correcao, setCorrecao] = useState("");
  const [resultado, setResultado] = useState("");
  const [mensagemCliente, setMensagemCliente] = useState("");
  const [motivo, setMotivo] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDiagnostico("");
    setProcedimentos("");
    setCorrecao("");
    setResultado("");
    setMensagemCliente("");
    setMotivo("");
    setMotivoOutro("");
  };

  const handleConfirm = async () => {
    if (!diagnostico.trim() || !procedimentos.trim() || !correcao.trim() || !resultado.trim()) {
      toast({
        title: "Preencha todos os campos da solução",
        description: "Diagnóstico, procedimentos, correção e resultado são obrigatórios.",
        variant: "destructive",
      });
      return;
    }
    if (!mensagemCliente.trim()) {
      toast({
        title: "Mensagem final para o cliente é obrigatória",
        description: "Escreva a mensagem que será enviada ao cliente informando a solução.",
        variant: "destructive",
      });
      return;
    }
    if (!motivo) {
      toast({ title: "Selecione um motivo de encerramento", variant: "destructive" });
      return;
    }
    if (motivo === "OUTRO" && !motivoOutro.trim()) {
      toast({ title: "Informe o motivo (Outro)", variant: "destructive" });
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const motivoLabel =
      motivo === "OUTRO"
        ? motivoOutro.trim()
        : MOTIVOS_ENCERRAMENTO.find((m) => m.value === motivo)?.label || motivo;

    const solucao =
      `Diagnóstico:\n${diagnostico.trim()}\n\n` +
      `Procedimentos:\n${procedimentos.trim()}\n\n` +
      `Correção:\n${correcao.trim()}\n\n` +
      `Resultado:\n${resultado.trim()}`;

    // 1. Update ticket
    const update: any = {
      status: "RESOLVIDO",
      data_solucao: ticket.data_solucao || now,
      solucao_aplicada: solucao,
      motivo_encerramento: motivo,
      motivo_encerramento_outro: motivo === "OUTRO" ? motivoOutro.trim() : null,
    };
    // resume any paused SLA
    if (ticket.sla_pausa_inicio) {
      const acc =
        (ticket.sla_pausa_total_segundos || 0) +
        Math.round((Date.now() - new Date(ticket.sla_pausa_inicio).getTime()) / 1000);
      update.sla_pausa_inicio = null;
      update.sla_pausa_total_segundos = acc;
    }

    try {
      await updateTicketViaEdge({
        ticketId: ticket.id,
        updates: update,
        history: [
          { campo: "status", valorAnterior: ticket.status, valorNovo: "RESOLVIDO" },
          { campo: "encerramento", valorAnterior: null, valorNovo: motivoLabel, observacao: solucao },
        ],
        comment: {
          conteudo: mensagemCliente.trim(),
          tipo: "CLIENTE",
        },
      });
    } catch (e: any) {
      setSaving(false);
      toast({ title: "Erro ao encerrar", description: e?.message || String(e), variant: "destructive" });
      return;
    }

    setSaving(false);
    toast({ title: "Chamado encerrado" });
    reset();
    onOpenChange(false);
    onClosed?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Encerrar chamado {ticket?.codigo}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3">
            <div>
              <Label>Diagnóstico realizado *</Label>
              <Textarea
                rows={2}
                value={diagnostico}
                onChange={(e) => setDiagnostico(e.target.value)}
                placeholder="O que foi identificado?"
              />
            </div>
            <div>
              <Label>Procedimentos executados *</Label>
              <Textarea
                rows={2}
                value={procedimentos}
                onChange={(e) => setProcedimentos(e.target.value)}
                placeholder="Quais passos foram seguidos?"
              />
            </div>
            <div>
              <Label>Correção aplicada *</Label>
              <Textarea
                rows={2}
                value={correcao}
                onChange={(e) => setCorrecao(e.target.value)}
                placeholder="O que foi corrigido?"
              />
            </div>
            <div>
              <Label>Resultado obtido *</Label>
              <Textarea
                rows={2}
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                placeholder="Qual o resultado final?"
              />
            </div>
          </div>

          <div>
            <Label>Motivo do encerramento *</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_ENCERRAMENTO.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {motivo === "OUTRO" && (
            <div>
              <Label>Descreva o motivo *</Label>
              <Input
                value={motivoOutro}
                onChange={(e) => setMotivoOutro(e.target.value)}
                placeholder="Motivo personalizado"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? "Encerrando..." : "Encerrar chamado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
