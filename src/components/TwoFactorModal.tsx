import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Shield } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

interface TwoFactorModalProps {
  open: boolean;
  userId: number;
  challengeToken?: string;
  onComplete: (user: any, session: any) => void;
  onCancel: () => void;
}

export default function TwoFactorModal({ open, userId, challengeToken, onComplete, onCancel }: TwoFactorModalProps) {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": ANON_KEY },
        body: JSON.stringify({ challengeToken, code, isSetup: false }),
      });

      const data = await res.json();
      if (data.success) {
        onComplete(data.user, data.session);
      } else {
        toast({ title: "Código inválido", description: data.error, variant: "destructive" });
        setCode("");
      }
    } catch {
      toast({ title: "Erro", description: "Falha na verificação", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Verificação 2FA
          </DialogTitle>
          <DialogDescription>
            Digite o código de 6 dígitos do Google Authenticator.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="text-center text-2xl tracking-[0.5em] font-mono h-14"
            maxLength={6}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) handleVerify(); }}
          />
          <Button onClick={handleVerify} disabled={code.length !== 6 || loading} className="w-full">
            {loading ? "Verificando..." : "Verificar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
