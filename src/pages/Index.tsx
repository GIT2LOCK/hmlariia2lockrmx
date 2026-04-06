import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { login, signup } from "@/services/authService";
import { useUser } from "@/contexts/UserContext";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import PasswordChecklist from "@/components/PasswordChecklist";
import TwoFactorModal from "@/components/TwoFactorModal";
import TwoFactorSetupModal from "@/components/TwoFactorSetupModal";
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

  // 2FA state
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [pending2FAUserId, setPending2FAUserId] = useState<number>(0);
  const [setupToken, setSetupToken] = useState("");

  const completeLogin = (user: any, session: any) => {
    localStorage.setItem("auth_token", session.token);
    localStorage.setItem("auth_expires", session.expires_at);
    localStorage.setItem("auth_user", JSON.stringify(user));
    setShow2FAModal(false);
    setShow2FASetup(false);
    toast({ title: "Login realizado!", description: `Bem-vindo, ${user.nome}!` });
    refreshUser();
    navigate("/dashboard");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      const result = await login({ email: loginEmail, senha: loginPassword });

      if (result.success) {
        if ((result as any).requires2FA) {
          setPending2FAUserId((result as any).userId);
          setShow2FAModal(true);
        } else if (result.session) {
          completeLogin(result.user, result.session);
        }
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
        const data = result as any;
        if (data.requiresSetup2FA) {
          setPending2FAUserId(data.user.id);
          setSetupToken(data.setupToken);
          setShow2FASetup(true);
        } else if (result.session) {
          completeLogin(result.user!, result.session);
        }
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
      {/* Overlay panel (blue) with wave edges */}
      <div
        className="absolute top-0 bottom-0 z-20 pointer-events-auto"
        style={{
          width: "42%",
          left: isSignUp ? "58%" : "0%",
          transition: "left 0.8s cubic-bezier(0.76, 0, 0.24, 1)",
        }}
      >
        {/* Wave edge - leading side */}
        <svg
          className="absolute top-0 h-full z-10"
          style={{
            width: "80px",
            right: isSignUp ? "auto" : "-40px",
            left: isSignUp ? "-40px" : "auto",
            transform: isSignUp ? "scaleX(-1)" : "scaleX(1)",
            transition: "right 0.8s cubic-bezier(0.76, 0, 0.24, 1), left 0.8s cubic-bezier(0.76, 0, 0.24, 1), transform 0.8s cubic-bezier(0.76, 0, 0.24, 1)",
          }}
          viewBox="0 0 80 900"
          preserveAspectRatio="none"
          fill="hsl(var(--primary))"
        >
          <path d="M80,0 L80,900 L0,900 C30,750 10,600 40,450 C70,300 20,150 0,0 Z" />
        </svg>

        {/* Main panel body */}
        <div
          className="absolute inset-0 bg-primary flex items-center justify-center"
        >
          <div
            className="text-center text-primary-foreground px-8 max-w-sm"
            style={{
              opacity: 1,
              animation: "overlayFadeIn 0.5s ease-out 0.3s both",
            }}
            key={isSignUp ? "signup-overlay" : "login-overlay"}
          >
            {isSignUp ? (
              <>
                <h2 className="text-3xl font-bold mb-4">Olá, Amigo!</h2>
                <p className="text-primary-foreground/80 mb-8">Já possui uma conta? Entre com seus dados</p>
                <Button
                  variant="outline"
                  className="border-primary-foreground text-primary-foreground bg-transparent hover:bg-primary-foreground/10 px-10 py-2 rounded-full transition-all duration-300 hover:scale-105"
                  onClick={() => setIsSignUp(false)}
                >ENTRAR</Button>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-bold mb-4">Olá, Amigo!</h2>
                <p className="text-primary-foreground/80 mb-8">Preencha seus dados pessoais e comece sua jornada conosco</p>
                <Button
                  variant="outline"
                  className="border-primary-foreground text-primary-foreground bg-transparent hover:bg-primary-foreground/10 px-10 py-2 rounded-full transition-all duration-300 hover:scale-105"
                  onClick={() => setIsSignUp(true)}
                >CADASTRAR</Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Login form (right side) */}
      <div
        className="w-1/2 ml-auto flex items-center justify-center p-8"
        style={{ opacity: isSignUp ? 0 : 1, pointerEvents: isSignUp ? "none" : "auto", transition: "opacity 0.3s ease" }}
      >
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center">
            <img src={logo} alt="Ariia" className="max-h-16 md:max-h-24 w-auto mb-6 mx-auto object-contain" />
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
            <img src={logo} alt="Ariia" className="max-h-16 md:max-h-24 w-auto mb-6 mx-auto object-contain" />
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

      {/* 2FA Modals */}
      <TwoFactorModal
        open={show2FAModal}
        userId={pending2FAUserId}
        onComplete={completeLogin}
        onCancel={() => setShow2FAModal(false)}
      />

      <TwoFactorSetupModal
        open={show2FASetup}
        userId={pending2FAUserId}
        setupToken={setupToken}
        onComplete={completeLogin}
      />
    </div>
  );
};

export default Index;
