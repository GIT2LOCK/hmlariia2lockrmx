import { useState } from "react";
import { PenLine, LoaderCircle, Save } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

export function SignatureSettings() {
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(action: string, assinatura?: string) {
    const result = await supabase.functions.invoke("ariiatalk-mensagens", {
      body: { action, ...(assinatura !== undefined ? { assinatura } : {}) },
    });
    if (result.error || result.data?.error) {
      const details = result.error instanceof FunctionsHttpError ? await result.error.context.text() : result.error?.message;
      console.error("AriiaTalk signature:", details || result.data?.error);
      throw new Error("Não foi possível acessar sua assinatura. Tente novamente.");
    }
    return result.data;
  }

  async function load() {
    setOpen(true);
    setError(null);
    setSignature("");
    setLoaded(false);
    setBusy(true);
    try { const data = await request("get_signature"); setSignature(data.assinatura); setLoaded(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar assinatura."); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!loaded) return;
    setError(null);
    setBusy(true);
    try { await request("save_signature", signature); setOpen(false); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao salvar assinatura."); }
    finally { setBusy(false); }
  }

  return <>
    <Button variant="outline" size="sm" onClick={() => void load()} title="Minha assinatura">
      <PenLine /> Minha assinatura
    </Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Minha assinatura</DialogTitle>
          <DialogDescription>Assinatura pessoal do WhatsApp</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="talk-signature" className="text-sm font-medium">Assinatura</label>
            <input id="talk-signature" value={signature} onChange={(event) => setSignature(event.target.value)} maxLength={80} placeholder="Analista 01" disabled={busy} className="h-10 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">WhatsApp</p>
            <div className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm">{signature.trim().replace(/:+$/, "") ? `${signature.trim().replace(/:+$/, "")}:\n\n` : ""}Bom dia!</div>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setSignature("")}>Remover assinatura</Button>
            <Button type="submit" disabled={busy || !loaded}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}