import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import PasswordChecklist from "@/components/PasswordChecklist";
import logo from "@/assets/logo.png";

const ResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [valid, setValid] = useState(false);
  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setValidating(false);
        setValid(false);
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("validate-reset-token", {
          body: { token },
        });
        if (cancelled) return;
        if (error || !data?.valid) {
          setValid(false);
        } else {
          setValid(true);
          setEmailMasked(data.email_masked ?? null);
        }
      } catch (e) {
        if (!cancelled) setValid(false);
      } finally {
        if (!cancelled) setValidating(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [token]);

  const passwordOk =
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordOk) {
      toast({ title: "Senha fraca", description: "Atenda a todos os requisitos.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Senhas não coincidem", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("confirm-password-reset", {
        body: { token, password, confirm },
      });
      if (error || !data?.ok) {
        const msg = (data as any)?.message || "Não foi possível redefinir a senha. Solicite um novo link.";
        toast({ title: "Erro", description: msg, variant: "destructive" });
        return;
      }
      setSuccess(true);
      toast({ title: "Senha redefinida!", description: "Faça login com a nova senha." });
      await supabase.auth.signOut().catch(() => {});
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err: any) {
      toast({ title: "Erro ao redefinir senha", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <img src={logo} alt="Ariia" className="max-h-20 w-auto mx-auto" />
          <p className="text-destructive">Link inválido ou expirado. Solicite uma nova redefinição de senha.</p>
          <Button onClick={() => navigate("/forgot-password")}>Pedir novo link</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center">
          <img src={logo} alt="Ariia" className="max-h-20 w-auto mb-4 object-contain" />
          <h1 className="text-2xl font-bold text-foreground">Definir nova senha</h1>
          {emailMasked && (
            <p className="text-sm text-muted-foreground mt-1">Conta: {emailMasked}</p>
          )}
        </div>

        {success ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 mx-auto text-secondary" />
            <p>Senha redefinida com sucesso. Redirecionando para o login…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={show ? "text" : "password"}
                placeholder="Nova senha"
                className="pl-10 pr-10 h-12 bg-muted/50 border-border"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordChecklist password={password} />
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type={show ? "text" : "password"}
                placeholder="Confirmar nova senha"
                className="pl-10 h-12 bg-muted/50 border-border"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full h-12 rounded-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redefinir senha"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
