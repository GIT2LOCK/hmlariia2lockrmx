import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { login, signup } from "@/services/authService";
import { useUser } from "@/contexts/UserContext";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import PasswordChecklist from "@/components/PasswordChecklist";
import logo from "@/assets/logo.png";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshUser } = useUser();

  const [isSignUp, setIsSignUp] = useState(false);

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Signup state
  const [signupNome, setSignupNome] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      const result = await login({ email: loginEmail, senha: loginPassword });

      if (result.success) {
        toast({ title: "Login realizado!", description: `Bem-vindo, ${result.user?.nome}!` });
        refreshUser();
        navigate("/dashboard");
      } else {
        toast({ title: "Erro no login", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Ocorreu um erro ao fazer login.", variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (signupPassword !== signupConfirmPassword) {
      toast({ title: "Erro", description: "As senhas não coincidem.", variant: "destructive" });
      return;
    }

    setSignupLoading(true);

    try {
      const result = await signup({ nome: signupNome, email: signupEmail, senha: signupPassword });

      if (result.success) {
        toast({ title: "Conta criada!", description: "Bem-vindo ao sistema!" });
        refreshUser();
        navigate("/dashboard");
      } else {
        toast({ title: "Erro no cadastro", description: result.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Ocorreu um erro ao criar a conta.", variant: "destructive" });
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background overflow-hidden relative">
      {/* Overlay panel (blue) */}
      <div
        className="absolute top-0 bottom-0 w-[37.5%] bg-primary z-20 flex items-center justify-center pointer-events-auto"
        style={{
          transform: isSignUp ? "translateX(166.67%)" : "translateX(0)",
          transition: "transform 0.6s cubic-bezier(0.65, 0, 0.35, 1)",
        }}
      >
        <div className="text-center text-primary-foreground px-8 max-w-sm">
          {isSignUp ? (
            <>
              <h2 className="text-3xl font-bold mb-4">Olá, Amigo!</h2>
              <p className="text-primary-foreground/80 mb-8">Já possui uma conta? Entre com seus dados</p>
              <Button
                variant="outline"
                className="border-primary-foreground text-primary-foreground bg-transparent hover:bg-primary-foreground/10 px-10 py-2 rounded-full"
                onClick={() => setIsSignUp(false)}
              >ENTRAR</Button>
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold mb-4">Olá, Amigo!</h2>
              <p className="text-primary-foreground/80 mb-8">Preencha seus dados pessoais e comece sua jornada conosco</p>
              <Button
                variant="outline"
                className="border-primary-foreground text-primary-foreground bg-transparent hover:bg-primary-foreground/10 px-10 py-2 rounded-full"
                onClick={() => setIsSignUp(true)}
              >CADASTRAR</Button>
            </>
          )}
        </div>
      </div>

      {/* Login form (right side) */}
      <div
        className="w-1/2 ml-auto flex items-center justify-center p-8"
        style={{ opacity: isSignUp ? 0 : 1, pointerEvents: isSignUp ? "none" : "auto", transition: "opacity 0.3s ease" }}
      >
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center">
            <img src={logo} alt="Ariia" className="h-20 md:h-32 mb-6 mx-auto" />
            <h1 className="text-2xl font-bold text-foreground">Entrar na Conta</h1>
            <p className="text-sm text-muted-foreground mt-1">Use seu e-mail para login</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="email" placeholder="E-mail" className="pl-10 h-12 bg-muted/50 border-border"
                value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type={showLoginPassword ? "text" : "password"} placeholder="Senha"
                className="pl-10 pr-10 h-12 bg-muted/50 border-border"
                value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
              <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Button type="submit" className="w-full h-12 text-base font-semibold bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full"
              disabled={loginLoading}>
              {loginLoading ? "Entrando..." : "ENTRAR"}
            </Button>
          </form>

          <div className="md:hidden text-center">
            <p className="text-sm text-muted-foreground">
              Não tem conta? <button onClick={() => setIsSignUp(true)} className="text-secondary font-semibold hover:underline">Cadastre-se</button>
            </p>
          </div>
        </div>
      </div>

      {/* Signup form (left side) */}
      <div
        className="absolute top-0 left-0 w-1/2 h-full flex items-center justify-center p-8"
        style={{ opacity: isSignUp ? 1 : 0, pointerEvents: isSignUp ? "auto" : "none", transition: "opacity 0.3s ease" }}
      >
        <div className="w-full max-w-md space-y-5">
          <div className="flex flex-col items-center">
            <img src={logo} alt="Ariia" className="h-20 md:h-32 mb-6 mx-auto" />
            <h1 className="text-2xl font-bold text-foreground">Criar Conta</h1>
            <p className="text-sm text-muted-foreground mt-1">Preencha os dados para se cadastrar</p>
          </div>

          <form onSubmit={handleSignup} className="space-y-3">
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Nome completo" className="pl-10 h-11 bg-muted/50 border-border"
                value={signupNome} onChange={(e) => setSignupNome(e.target.value)} required />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type="email" placeholder="E-mail" className="pl-10 h-11 bg-muted/50 border-border"
                value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type={showSignupPassword ? "text" : "password"} placeholder="Senha"
                className="pl-10 pr-10 h-11 bg-muted/50 border-border"
                value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required />
              <button type="button" onClick={() => setShowSignupPassword(!showSignupPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordChecklist password={signupPassword} />
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input type={showSignupConfirmPassword ? "text" : "password"} placeholder="Confirmar senha"
                className="pl-10 pr-10 h-11 bg-muted/50 border-border"
                value={signupConfirmPassword} onChange={(e) => setSignupConfirmPassword(e.target.value)} required />
              <button type="button" onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showSignupConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Button type="submit" className="w-full h-11 text-base font-semibold bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-full"
              disabled={signupLoading}>
              {signupLoading ? "Criando conta..." : "CADASTRAR"}
            </Button>
          </form>

          <div className="md:hidden text-center">
            <p className="text-sm text-muted-foreground">
              Já tem conta? <button onClick={() => setIsSignUp(false)} className="text-secondary font-semibold hover:underline">Entrar</button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
