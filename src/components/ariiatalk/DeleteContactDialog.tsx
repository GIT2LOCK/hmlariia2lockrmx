import { useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { ContactRecord } from "@/lib/ariiatalkContacts";

export default function DeleteContactDialog({ contact, onClose, onDeleted }: { contact: ContactRecord; onClose: () => void; onDeleted: (id: number) => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    setError(null); setSaving(true);
    try {
      const result = await supabase.functions.invoke("ariiatalk-conversas", { body: { action: "delete_contact", contact_id: contact.id } });
      let data = result.data;
      if (result.error && (result.error as any).context?.json) {
        try { data = await (result.error as any).context.json(); } catch { /* fallback */ }
      }
      if (result.error || !data?.success) {
        setError(data?.error === "contact_in_use" ? "Este contato está vinculado a outros cadastros e não pode ser excluído." : data?.error === "unknown_action" ? "A exclusão ainda não está disponível nesta conexão. Tente novamente em instantes." : "Não foi possível excluir o contato. Tente novamente.");
        return;
      }
      onDeleted(contact.id);
      onClose();
    } catch { setError("Não foi possível excluir o contato. Tente novamente."); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent className="max-w-[calc(100vw-24px)] sm:max-w-md">
    <DialogHeader><DialogTitle>Excluir contato</DialogTitle><DialogDescription>Excluir <strong>{contact.nome}</strong>? As conversas e mensagens continuam no histórico, apenas sem vínculo com este contato. Esta ação não pode ser desfeita.</DialogDescription></DialogHeader>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <DialogFooter><Button variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button variant="destructive" disabled={saving} onClick={() => void remove()}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Excluir</Button></DialogFooter>
  </DialogContent></Dialog>;
}
