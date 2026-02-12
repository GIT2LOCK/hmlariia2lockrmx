import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { login, signup } from "@/services/authService";
import { useUser } from "@/contexts/UserContext";
import { Eye, EyeOff, LogIn, UserPlus } from "lucide-react";
import PasswordChecklist from "@/components/PasswordChecklist";
import { TwoFactorModal } from "@/components/TwoFactorModal";
import { TwoFactorSetupModal } from "@/components/TwoFactorSetupModal";
import logo from "@/assets/logo.png";

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refreshUser } = useUser();

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Signup state
  const [signupNome, setSignupNome] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupCpf, setSignupCpf] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupLoading, setSignupLoading] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);

  // 2FA state
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [show2FASetupModal, setShow2FASetupModal] = useState(false);
  const [pending2FAUserId, setPending2FAUserId] = useState<number | null>(null);
  const [pending2FAUserName, setPending2FAUserName] = useState<string>("");
  const [pending2FASetupToken, setPending2FASetupToken] = useState<string>("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      const result = await login({ email: loginEmail, senha: loginPassword });

      if (result.requires2FA && result.user) {
        setPending2FAUserId(result.user.id);
        setPending2FAUserName(result.user.nome);
        setShow2FAModal(true);
        setLoginLoading(false);
        return;
      }

      if (result.success) {
        toast({
          title: "Login realizado!",
          description: `Bem-vindo de volta, ${result.user?.nome}!`,
        });
        refreshUser();
        navigate("/dashboard");
      } else {
        toast({
          title: "Erro no login",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao fazer login.",
        variant: "destructive",
      });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    if (signupPassword !== signupConfirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }

    setSignupLoading(true);

    try {
      const result = await signup({
        nome: signupNome,
        email: signupEmail,
        cpf: signupCpf,
        senha: signupPassword,
      });

      if (result.success) {
        if (result.requires2FASetup && result.setupToken) {
          setPending2FASetupToken(result.setupToken);
          setPending2FAUserId(result.user?.id || null);
          setShow2FASetupModal(true);
        } else {
          toast({
            title: "Conta criada!",
            description: result.message,
          });
        }
      } else {
        toast({
          title: "Erro no cadastro",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao criar a conta.",
        variant: "destructive",
      });
    } finally {
      setSignupLoading(false);
    }
  };

  const handle2FASuccess = (user: { id: number; nome: string; permissao: string }) => {
    setShow2FAModal(false);
    setPending2FAUserId(null);
    setPending2FAUserName("");
    refreshUser();
    navigate("/dashboard");
  };

  const handle2FASetupSuccess = (session?: { token: string; expires_at: string }, user?: { id: number; nome: string; email?: string; permissao: string }) => {
    setShow2FASetupModal(false);
    setPending2FASetupToken("");
    setPending2FAUserId(null);
    setPending2FAUserName("");
    if (session && user) {
      localStorage.setItem("auth_token", session.token);
      localStorage.setItem("auth_expires", session.expires_at);
      localStorage.setItem("auth_user", JSON.stringify(user));
    }
    refreshUser();
    navigate("/dashboard");
  };

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="Logo" className="h-16 w-auto" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">WebCount</h1>
            <p className="text-sm text-muted-foreground">Sistema de Gestão de Demandas</p>
          </div>
        </div>

        <Card>
          <Tabs defaultValue="login" className="w-full">
            <CardHeader className="pb-2">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar Conta</TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">E-mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Senha</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={loginLoading}>
                    {loginLoading ? "Entrando..." : (
                      <>
                        <LogIn className="h-4 w-4 mr-2" />
                        Entrar
                      </>
                    )}
                  </Button>
                </CardContent>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-nome">Nome completo</Label>
                    <Input
                      id="signup-nome"
                      placeholder="Seu nome completo"
                      value={signupNome}
                      onChange={(e) => setSignupNome(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">E-mail</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="seu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-cpf">CPF</Label>
                    <Input
                      id="signup-cpf"
                      placeholder="000.000.000-00"
                      value={signupCpf}
                      onChange={(e) => setSignupCpf(formatCpf(e.target.value))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Senha</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showSignupPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword(!showSignupPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <PasswordChecklist password={signupPassword} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">Confirmar senha</Label>
                    <div className="relative">
                      <Input
                        id="signup-confirm-password"
                        type={showSignupConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupConfirmPassword(!showSignupConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSignupConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={signupLoading}>
                    {signupLoading ? "Criando conta..." : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        Criar Conta
                      </>
                    )}
                  </Button>
                </CardContent>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      {show2FAModal && pending2FAUserId && (
        <TwoFactorModal
          isOpen={show2FAModal}
          onClose={() => {
            setShow2FAModal(false);
            setPending2FAUserId(null);
            setPending2FAUserName("");
          }}
          onSuccess={handle2FASuccess}
          userId={pending2FAUserId}
          userName={pending2FAUserName}
        />
      )}

      {show2FASetupModal && pending2FAUserId && (
        <TwoFactorSetupModal
          isOpen={show2FASetupModal}
          onClose={() => {
            setShow2FASetupModal(false);
            setPending2FASetupToken("");
            setPending2FAUserId(null);
            setPending2FAUserName("");
          }}
          onSuccess={handle2FASetupSuccess}
          userId={pending2FAUserId}
          userName={pending2FAUserName}
          setupToken={pending2FASetupToken}
        />
      )}
    </div>
  );
};

export default Index;
