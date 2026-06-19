import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";

const ForgotPassword = () => {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
      toast({ title: "E-mail enviado", description: "Se o e-mail existir, você receberá o link de redefinição." });
    } catch (err: any) {
      console.error("[forgot-password]", err);
      // Por privacidade, mostramos a mesma mensagem mesmo em erro
      setSent(true);
      toast({ title: "E-mail enviado", description: "Se o e-mail existir, você receberá o link de redefinição." });
    } finally {
      setLoading(false);
    }
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
          <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3">
            <Mail className="h-10 w-10 mx-auto text-secondary" />
            <p className="text-sm text-foreground">
              Se o e-mail <strong>{email}</strong> estiver cadastrado, você receberá em instantes um link
              para redefinir sua senha. Verifique também a caixa de spam.
            </p>
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
