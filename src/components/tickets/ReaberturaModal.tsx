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
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { logTicketEvent } from "@/lib/ticketHistory";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: any;
  onReopened?: () => void;
}

export function ReaberturaModal({ open, onOpenChange, ticket, onReopened }: Props) {
  const { user } = useUser();
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!motivo.trim()) {
      toast({ title: "Informe o motivo da reabertura", variant: "destructive" });
      return;
    }
    setSaving(true);
    const previousStatus = ticket.status;
    const newStatus = "EM_ATENDIMENTO";

    const update: any = {
      status: newStatus,
      data_solucao: null,
      data_fechamento: null,
    };
    const { error } = await supabase.from("tickets").update(update).eq("id", ticket.id);
    if (error) {
      setSaving(false);
      toast({ title: "Erro ao reabrir", description: error.message, variant: "destructive" });
      return;
    }

    await logTicketEvent({
      ticketId: ticket.id,
      campo: "status",
      valorAnterior: previousStatus,
      valorNovo: newStatus,
      user,
    });

    await logTicketEvent({
      ticketId: ticket.id,
      campo: "reabertura",
      valorAnterior: previousStatus,
      valorNovo: newStatus,
      observacao: motivo.trim(),
      user,
    });

    await supabase.from("ticket_comments").insert({
      ticket_id: ticket.id,
      conteudo: `Chamado reaberto. Motivo: ${motivo.trim()}`,
      tipo: "INTERNO",
      autor_id: user?.id ? Number(user.id) : null,
      autor_nome: user?.nome || null,
    });

    setSaving(false);
    setMotivo("");
    toast({ title: "Chamado reaberto" });
    onOpenChange(false);
    onReopened?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setMotivo(""); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reabrir chamado {ticket?.codigo}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Motivo da reabertura *</Label>
            <Textarea
              rows={4}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explique por que o chamado precisa ser reaberto..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? "Reabrindo..." : "Reabrir chamado"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
