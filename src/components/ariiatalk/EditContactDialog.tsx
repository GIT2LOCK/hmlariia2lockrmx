import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import type { ContactRecord } from "@/lib/ariiatalkContacts";

export default function EditContactDialog<T extends ContactRecord>({ contact, onClose, onSaved }: { contact: T; onClose: () => void; onSaved: (contact: T) => void }) {
  const [form, setForm] = useState({ nome: contact.nome, telefone: contact.telefone ?? "", email: contact.email ?? "", categoria: contact.categoria ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSaving(true);
    try {
      const result = await supabase.functions.invoke("ariiatalk-conversas", { body: { action: "edit_contact", contact_id: contact.id, ...form } });
      let data = result.data;
      if (result.error && (result.error as any).context?.json) {
        try { data = await (result.error as any).context.json(); } catch { /* fallback below */ }
      }
      if (result.error || data?.error || !data?.contact) {
        setError(data?.error === "unknown_action" ? "A edição ainda não está disponível nesta conexão. Seus dados foram mantidos; tente salvar novamente." : data?.error === "duplicate_phone" ? "Este telefone já pertence a outro contato." : data?.error === "invalid_contact" ? "Confira o nome, telefone e e-mail informados." : "Não foi possível salvar o contato. Tente novamente.");
        return;
      }
      onSaved(data.contact as T);
      onClose();
    } catch { setError("Não foi possível salvar o contato. Tente novamente."); }
    finally { setSaving(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}><DialogContent aria-describedby={undefined} className="max-h-[90dvh] max-w-[calc(100vw-24px)] overflow-y-auto sm:max-w-lg">
    <DialogHeader><DialogTitle>Editar contato</DialogTitle></DialogHeader>
    <form onSubmit={save} className="space-y-4">
      <label className="block space-y-1.5 text-sm font-medium">Nome<Input autoFocus required minLength={2} maxLength={120} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} disabled={saving} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1.5 text-sm font-medium">Telefone<Input inputMode="tel" maxLength={30} value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} disabled={saving} /></label><label className="block space-y-1.5 text-sm font-medium">E-mail<Input type="email" maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={saving} /></label></div>
      <label className="block space-y-1.5 text-sm font-medium">Categoria<Input maxLength={40} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} disabled={saving} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar alterações</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>;
}