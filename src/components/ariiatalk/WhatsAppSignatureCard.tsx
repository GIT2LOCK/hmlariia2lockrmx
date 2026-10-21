import { useEffect, useState } from "react";
import { PenLine, LoaderCircle, Save, Trash2 } from "lucide-react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export function WhatsAppSignatureCard() {
  const [signature, setSignature] = useState("");
  const [savedSignature, setSavedSignature] = useState("");
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
    setError(null);
    setBusy(true);
    try { const data = await request("get_signature"); setSignature(data.assinatura); setSavedSignature(data.assinatura); setLoaded(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao carregar assinatura."); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!loaded) return;
    setError(null);
    setBusy(true);
    try { await request("save_signature", signature); setSavedSignature(signature); }
    catch (err) { setError(err instanceof Error ? err.message : "Falha ao salvar assinatura."); }
    finally { setBusy(false); }
  }

  useEffect(() => { void load(); }, []);

  const preview = signature.trim().replace(/:+$/, "");
  const dirty = loaded && signature !== savedSignature;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PenLine className="h-5 w-5" /> Assinatura do WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Sua assinatura pessoal nas mensagens do AriiaTalk. No WhatsApp ela aparece antes da mensagem
          (ex: "Analista 01:"); no AriiaTalk ela não é enviada — seu nome já aparece acima da mensagem.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        ) : !loaded ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Carregando assinatura...</div>
        ) : (
          <>
            <div className="space-y-2 max-w-md">
              <Label htmlFor="talk-signature">Assinatura</Label>
              <Input
                id="talk-signature"
                value={signature}
                onChange={(event) => setSignature(event.target.value)}
                maxLength={80}
                placeholder="Analista 01"
                disabled={busy}
              />
            </div>
            <div className="space-y-2 max-w-md">
              <p className="text-xs font-medium text-muted-foreground">Pré-visualização no WhatsApp</p>
              <div className="whitespace-pre-wrap rounded-md border bg-muted p-3 text-sm">
                {preview ? `${preview}:\n\n` : ""}Bom dia!
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void save()} disabled={busy || !dirty} className="gap-2">
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </Button>
              {preview && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setSignature("")} className="gap-2 text-destructive">
                  <Trash2 className="h-4 w-4" /> Remover assinatura
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
