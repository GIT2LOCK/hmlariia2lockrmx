import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mail, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import logo from "@/assets/logo.png";

const RESEND_COOLDOWN_SECONDS = 45;

const ForgotPassword = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (cooldown <= 0) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      return;
    }
    timerRef.current = window.setInterval(() => {
      setCooldown((c) => (c <= 1 ? 0 : c - 1));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [cooldown]);

  const requestReset = async (targetEmail: string) => {
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("request-password-reset", {
        body: { email: targetEmail },
      });
      if (error) console.error("[forgot-password] invoke error", error);
    } catch (err: any) {
      console.error("[forgot-password]", err);
    } finally {
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast({
        title: "Solicitação recebida",
        description:
          "Se este e-mail estiver cadastrado, enviaremos as instruções para redefinição de senha.",
      });
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      toast({ title: "E-mail inválido", description: "Informe um e-mail válido.", variant: "destructive" });
      return;
    }
    await requestReset(normalized);
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    await requestReset(email.trim().toLowerCase());
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center">
          <img src={logo} alt="Ariia" className="max-h-20 w-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-foreground">Recuperar senha</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Informe seu e-mail e enviaremos um link para redefinir sua senha
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center space-y-4">
            <Mail className="h-10 w-10 mx-auto text-secondary" />
            <p className="text-sm text-foreground">
              Se o e-mail <strong>{email}</strong> estiver cadastrado, você receberá em instantes um link
              para redefinir sua senha. Verifique também a caixa de spam.
            </p>
            <div className="space-y-2">
              <Button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
                variant="outline"
                className="w-full h-11 rounded-full"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : cooldown > 0 ? (
                  `Reenviar em ${cooldown}s`
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" /> Reenviar link
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setCooldown(0);
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Usar outro e-mail
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="seu@email.com"
                className="pl-10 h-12 bg-muted/50 border-border"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 rounded-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar link de recuperação"}
            </Button>
          </form>
        )}

        <Link to="/" className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Voltar para o login
        </Link>
      </div>
    </div>
  );
};

export default ForgotPassword;
