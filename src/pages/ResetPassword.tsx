import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Supabase já processa o token automaticamente quando a URL contém #access_token=...
  useEffect(() => {
    let cancelled = false;
    async function init() {
      // Aguarda Supabase processar o hash de recovery
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session) {
        // Tentar detectar evento PASSWORD_RECOVERY
        const sub = supabase.auth.onAuthStateChange((event, sess) => {
          if (event === "PASSWORD_RECOVERY" || sess) {
            setReady(true);
            sub.data.subscription.unsubscribe();
          }
        });
        setTimeout(() => {
          if (!cancelled && !ready) {
            setSessionError("Link inválido ou expirado. Solicite um novo e-mail de recuperação.");
          }
        }, 2000);
      } else {
        setReady(true);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Senha muito curta", description: "Use pelo menos 8 caracteres.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Senhas não coincidem", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const { data: { user }, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Limpar campo legacy de senha_hash do Ariia para evitar divergência
      if (user?.id) {
        try {
          await supabase.from("usuarios").update({ senha_hash: null }).eq("auth_user_id", user.id);
        } catch (e) {
          console.warn("[reset-password] não foi possível limpar senha_hash legacy", e);
        }
      }

      setSuccess(true);
      toast({ title: "Senha redefinida!", description: "Você já pode entrar com a nova senha." });
      // Sign out para forçar novo login com a senha nova
      await supabase.auth.signOut();
      setTimeout(() => navigate("/", { replace: true }), 1500);
    } catch (err: any) {
      console.error("[reset-password]", err);
      toast({ title: "Erro ao redefinir senha", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (sessionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md text-center space-y-4">
          <img src={logo} alt="Ariia" className="max-h-20 w-auto mx-auto" />
          <p className="text-destructive">{sessionError}</p>
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
                disabled={!ready}
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
                disabled={!ready}
              />
            </div>
            <Button type="submit" disabled={loading || !ready} className="w-full h-12 rounded-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-semibold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redefinir senha"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ResetPassword;
