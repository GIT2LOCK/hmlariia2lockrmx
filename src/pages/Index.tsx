import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Mail, Lock, User, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import PasswordChecklist from "@/components/PasswordChecklist";
import { signup, login } from "@/services/authService";
import { TwoFactorModal } from "@/components/TwoFactorModal";
import { TwoFactorSetupModal } from "@/components/TwoFactorSetupModal";
import { useUser } from "@/contexts/UserContext";

// Função para aplicar máscara de CPF
const formatCpf = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

// Validação de CPF com algoritmo dos dígitos verificadores
const validateCpf = (cpf: string): boolean => {
  const digits = cpf.replace(/\D/g, "");
  
  if (digits.length !== 11) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(digits)) return false;
  
  // Calcula primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  // Calcula segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[10])) return false;
  
  return true;
};

// Validação de senha forte
const validatePassword = (password: string): { valid: boolean; message: string } => {
  if (password.length < 8) {
    return { valid: false, message: "A senha deve ter no mínimo 8 caracteres." };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "A senha deve conter pelo menos uma letra minúscula." };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "A senha deve conter pelo menos uma letra maiúscula." };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "A senha deve conter pelo menos um número." };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: "A senha deve conter pelo menos um caractere especial." };
  }
  return { valid: true, message: "" };
};

const Index = () => {
  const navigate = useNavigate();
  const { refreshUser, isAuthenticated, isLoading: isAuthLoading } = useUser();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, isAuthLoading, navigate]);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const { toast } = useToast();

  // Form states
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupNome, setSignupNome] = useState("");
  const [signupSobrenome, setSignupSobrenome] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupCpf, setSignupCpf] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  // Verification modal states
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [show2FASetupModal, setShow2FASetupModal] = useState(false);
  const [pendingUser, setPendingUser] = useState<{ id: number; nome: string; email?: string } | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    const result = await login({
      email: loginEmail,
      senha: loginPassword,
    });
    
    setIsLoading(false);
    
    if (result.success) {
      // Refresh user context to update authentication state
      refreshUser();
      toast({
        title: "Login realizado!",
        description: `Bem-vindo de volta, ${result.user?.nome}!`,
      });
      navigate("/dashboard");
    } else if (result.requires2FA && result.user) {
      // User has 2FA enabled
      setPendingUser({
        id: result.user.id,
        nome: result.user.nome,
      });
      setShow2FAModal(true);
    } else {
      toast({
        title: "Erro",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar CPF completo
    if (!validateCpf(signupCpf)) {
      toast({
        title: "Erro",
        description: "CPF inválido. Verifique os dígitos informados.",
        variant: "destructive",
      });
      return;
    }
    
    // Validar senha forte
    const passwordValidation = validatePassword(signupPassword);
    if (!passwordValidation.valid) {
      toast({
        title: "Erro",
        description: passwordValidation.message,
        variant: "destructive",
      });
      return;
    }
    
    if (signupPassword !== signupConfirmPassword) {
      toast({
        title: "Erro",
        description: "As senhas não coincidem.",
        variant: "destructive",
      });
      return;
    }
    
    // Concatenar nome e sobrenome para enviar ao banco
    const nomeCompleto = `${signupNome.trim()} ${signupSobrenome.trim()}`;
    
    setIsLoading(true);
    
    const result = await signup({
      nome: nomeCompleto,
      email: signupEmail,
      cpf: signupCpf,
      senha: signupPassword,
    });
    
    setIsLoading(false);
    
    if (result.success && result.user && result.requires2FASetup) {
      // Show 2FA setup modal - mandatory after registration
      setPendingUser({
        id: result.user.id,
        nome: result.user.nome,
        email: signupEmail,
      });
      setShow2FASetupModal(true);
      // Clear form
      setSignupNome("");
      setSignupSobrenome("");
      setSignupEmail("");
      setSignupCpf("");
      setSignupPassword("");
      setSignupConfirmPassword("");
    } else {
      toast({
        title: "Erro",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "E-mail enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
      setIsForgotPassword(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background overflow-hidden relative">
      {/* Mobile Header - Toggle between Login/Signup */}
      <div className="md:hidden bg-primary p-4 text-center">
        <h2 className="text-xl font-bold text-primary-foreground mb-2">
          {isLoginMode ? "Bem-vindo!" : "Criar Conta"}
        </h2>
        <p className="text-sm text-primary-foreground/80 mb-3">
          {isLoginMode 
            ? "Não tem uma conta?" 
            : "Já tem uma conta?"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setIsLoginMode(!isLoginMode);
            setIsForgotPassword(false);
          }}
          className="border-primary-foreground text-primary-foreground bg-transparent hover:bg-primary-foreground hover:text-primary font-semibold px-8 rounded-full"
        >
          {isLoginMode ? "CADASTRAR" : "ENTRAR"}
        </Button>
      </div>

      {/* Sliding Panel - Desktop only */}
      <div 
        className={`hidden md:flex absolute inset-y-0 w-[37.5%] bg-primary z-20 flex-col items-center justify-center text-primary-foreground p-8 transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] ${
          isLoginMode ? 'translate-x-0' : 'translate-x-[166.67%]'
        }`}
      >
        <div className={`max-w-sm text-center space-y-6 transition-opacity duration-500 ${isLoginMode ? 'opacity-100 delay-300' : 'opacity-0 pointer-events-none'}`}>
          <h2 className="text-3xl font-bold">Olá, Amigo!</h2>
          <p className="text-primary-foreground/80">
            Preencha seus dados pessoais e comece sua jornada conosco
          </p>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              setIsLoginMode(false);
              setIsForgotPassword(false);
            }}
            className="mt-4 border-primary-foreground text-primary-foreground bg-transparent hover:bg-primary-foreground hover:text-primary font-semibold px-12 rounded-full"
          >
            CADASTRAR
          </Button>
        </div>
        <div className={`max-w-sm text-center space-y-6 absolute transition-opacity duration-500 ${!isLoginMode ? 'opacity-100 delay-300' : 'opacity-0 pointer-events-none'}`}>
          <h2 className="text-3xl font-bold">Bem-vindo de Volta!</h2>
          <p className="text-primary-foreground/80">
            Para continuar conectado, faça login com suas informações pessoais
          </p>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setIsLoginMode(true)}
            className="mt-4 border-primary-foreground text-primary-foreground bg-transparent hover:bg-primary-foreground hover:text-primary font-semibold px-12 rounded-full"
          >
            ENTRAR
          </Button>
        </div>
      </div>

      {/* Forms Container */}
      <div className="flex-1 flex relative">
        {/* Login Form - Right side on desktop, full width on mobile */}
        <div 
          className={`w-full md:w-[62.5%] min-h-[calc(100vh-100px)] md:min-h-screen flex items-center justify-center p-4 md:p-8 md:absolute md:inset-y-0 md:right-0 transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] ${
            isLoginMode 
              ? 'opacity-100 translate-x-0 z-10 block' 
              : 'opacity-0 md:translate-x-[20%] z-0 pointer-events-none hidden md:flex'
          }`}
        >
          <div className={`w-full max-w-md space-y-6 md:space-y-8 transition-transform duration-700 delay-100 ${isLoginMode ? 'translate-y-0' : 'translate-y-4'}`}>
            {!isForgotPassword ? (
              <>
                <div className="text-center">
                  <img src={logo} alt="Web Contador" className="h-20 md:h-32 mx-auto mb-4 md:mb-6 mix-blend-multiply" />
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">Entrar na Conta</h1>
                  <p className="text-sm md:text-base text-muted-foreground mt-2">Use seu e-mail para login</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-3 md:space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="E-mail"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-10 md:pl-12 h-10 md:h-12 bg-muted border-0 rounded-lg text-sm md:text-base"
                      required
                    />
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Senha"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-10 md:pl-12 pr-10 md:pr-12 h-10 md:h-12 bg-muted border-0 rounded-lg text-sm md:text-base"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4 md:h-5 md:w-5" /> : <Eye className="h-4 w-4 md:h-5 md:w-5" />}
                    </button>
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-xs md:text-sm text-secondary hover:text-brand-green-light font-medium"
                    >
                      Esqueceu sua senha?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-10 md:h-12 bg-secondary hover:bg-brand-green-light text-secondary-foreground font-semibold rounded-full text-sm md:text-base"
                  >
                    {isLoading ? "ENTRANDO..." : "ENTRAR"}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <div className="text-center">
                  <img src={logo} alt="Web Contador" className="h-20 md:h-32 mx-auto mb-4 md:mb-6 mix-blend-multiply" />
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">Recuperar Senha</h1>
                  <p className="text-sm md:text-base text-muted-foreground mt-2">Digite seu e-mail para receber o link</p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-3 md:space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="E-mail"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="pl-10 md:pl-12 h-10 md:h-12 bg-muted border-0 rounded-lg text-sm md:text-base"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-10 md:h-12 bg-secondary hover:bg-brand-green-light text-secondary-foreground font-semibold rounded-full text-sm md:text-base"
                  >
                    {isLoading ? "ENVIANDO..." : "ENVIAR LINK"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsForgotPassword(false)}
                    className="w-full text-muted-foreground hover:text-foreground text-sm"
                  >
                    Voltar ao login
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Signup Form - Left side on desktop, full width on mobile */}
        <div 
          className={`w-full md:w-[62.5%] min-h-[calc(100vh-100px)] md:min-h-screen flex items-center justify-center p-4 md:p-8 md:absolute md:inset-y-0 md:left-0 transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] ${
            !isLoginMode 
              ? 'opacity-100 translate-x-0 z-10 block' 
              : 'opacity-0 md:-translate-x-[20%] z-0 pointer-events-none hidden md:flex'
          }`}
        >
          <div className={`w-full max-w-md space-y-6 md:space-y-8 transition-transform duration-700 delay-100 ${!isLoginMode ? 'translate-y-0' : 'translate-y-4'}`}>
            <div className="text-center">
              <img src={logo} alt="Web Contador" className="h-20 md:h-32 mx-auto mb-4 md:mb-6 mix-blend-multiply" />
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">Criar Conta</h1>
              <p className="text-sm md:text-base text-muted-foreground mt-2">Use seu e-mail para cadastro</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-3 md:space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <User className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Nome"
                    value={signupNome}
                    onChange={(e) => setSignupNome(e.target.value)}
                    className="pl-10 md:pl-12 h-10 md:h-12 bg-muted border-0 rounded-lg text-sm md:text-base"
                    required
                  />
                </div>
                <div className="relative flex-1">
                  <Input
                    type="text"
                    placeholder="Sobrenome"
                    value={signupSobrenome}
                    onChange={(e) => setSignupSobrenome(e.target.value)}
                    className="h-10 md:h-12 bg-muted border-0 rounded-lg text-sm md:text-base"
                    required
                  />
                </div>
              </div>

              <div className="relative">
                <Mail className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="E-mail"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  className="pl-10 md:pl-12 h-10 md:h-12 bg-muted border-0 rounded-lg text-sm md:text-base"
                  required
                />
              </div>

              <div className="relative">
                <CreditCard className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="CPF"
                  value={signupCpf}
                  onChange={(e) => setSignupCpf(formatCpf(e.target.value))}
                  className="pl-10 md:pl-12 h-10 md:h-12 bg-muted border-0 rounded-lg text-sm md:text-base"
                  required
                  maxLength={14}
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Senha"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  className="pl-10 md:pl-12 pr-10 md:pr-12 h-10 md:h-12 bg-muted border-0 rounded-lg text-sm md:text-base"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4 md:h-5 md:w-5" /> : <Eye className="h-4 w-4 md:h-5 md:w-5" />}
                </button>
              </div>
              
              <div className="-mt-1 md:-mt-2">
                <PasswordChecklist password={signupPassword} />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 h-4 w-4 md:h-5 md:w-5 text-muted-foreground" />
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirmar senha"
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  className="pl-10 md:pl-12 pr-10 md:pr-12 h-10 md:h-12 bg-muted border-0 rounded-lg text-sm md:text-base"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4 md:h-5 md:w-5" /> : <Eye className="h-4 w-4 md:h-5 md:w-5" />}
                </button>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-10 md:h-12 bg-secondary hover:bg-brand-green-light text-secondary-foreground font-semibold rounded-full text-sm md:text-base"
              >
                {isLoading ? "CADASTRANDO..." : "CADASTRAR"}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* 2FA Setup Modal - After Registration */}
      <TwoFactorSetupModal
        isOpen={show2FASetupModal}
        onClose={() => setShow2FASetupModal(false)}
        onSuccess={() => {
          setShow2FASetupModal(false);
          setIsLoginMode(true);
          toast({
            title: "2FA Configurado!",
            description: "Agora faça login para acessar sua conta.",
          });
        }}
        userId={pendingUser?.id || 0}
        userName={pendingUser?.nome || ""}
      />

      {/* 2FA Modal */}
      <TwoFactorModal
        isOpen={show2FAModal}
        onClose={() => setShow2FAModal(false)}
        onSuccess={(user) => {
          setShow2FAModal(false);
          setPendingUser(null);
          refreshUser();
          navigate("/dashboard");
        }}
        userId={pendingUser?.id || 0}
        userName={pendingUser?.nome || ""}
      />
    </div>
  );
};

export default Index;
