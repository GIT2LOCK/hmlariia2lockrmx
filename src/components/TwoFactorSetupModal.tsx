import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Shield, Copy, Check } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface TwoFactorSetupModalProps {
  open: boolean;
  userId: number;
  setupToken: string;
  onComplete: (user: any, session: any) => void;
  onSkip?: () => void;
}

export default function TwoFactorSetupModal({ open, userId, setupToken, onComplete, onSkip }: TwoFactorSetupModalProps) {
  const { toast } = useToast();
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open && userId) {
      fetchSecret();
    }
  }, [open, userId]);

  const fetchSecret = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/setup-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
        body: JSON.stringify({ userId, setupToken }),
      });
      const data = await res.json();
      if (data.success) {
        setQrCodeUrl(data.qrCodeUrl);
        setSecret(data.secret);
      } else {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Falha ao configurar 2FA", variant: "destructive" });
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
        body: JSON.stringify({ userId, code, isSetup: true, setupToken }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "2FA ativado!", description: "Autenticação de dois fatores configurada." });
        onComplete(data.user, data.session);
      } else {
        toast({ title: "Código inválido", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Falha na verificação", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Configurar 2FA
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR Code com o Google Authenticator para ativar a autenticação de dois fatores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {qrCodeUrl && (
            <div className="flex justify-center">
              <img src={qrCodeUrl} alt="QR Code 2FA" className="rounded-lg border" />
            </div>
          )}

          {secret && (
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="text-xs flex-1 break-all font-mono">{secret}</code>
              <Button variant="ghost" size="icon" onClick={copySecret}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Digite o código de 6 dígitos do app:</p>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center text-2xl tracking-[0.5em] font-mono h-14"
              maxLength={6}
            />
          </div>

          <Button onClick={handleVerify} disabled={code.length !== 6 || loading} className="w-full">
            {loading ? "Verificando..." : "Ativar 2FA"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
