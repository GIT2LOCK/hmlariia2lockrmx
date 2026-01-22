import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Mail, Lock, User, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import PasswordChecklist from "@/components/PasswordChecklist";
import { signup, login } from "@/services/authService";
import { EmailVerificationModal } from "@/components/EmailVerificationModal";
import { TwoFactorModal } from "@/components/TwoFactorModal";
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
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
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
    } else if (result.requiresEmailVerification && result.user) {
      // User needs to verify email
      setPendingUser({
        id: result.user.id,
        nome: result.user.nome,
        email: result.user.email || loginEmail,
      });
      setShowEmailVerification(true);
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
    
    if (result.success && result.user) {
      // Show email verification modal
      setPendingUser({
        id: result.user.id,
        nome: result.user.nome,
        email: signupEmail,
      });
      setShowEmailVerification(true);
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
    <div className="min-h-screen flex bg-background overflow-hidden relative">
      {/* Sliding Panel */}
      <div 
        className={`absolute inset-y-0 w-[37.5%] bg-primary z-20 flex flex-col items-center justify-center text-primary-foreground p-8 transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] ${
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
      <div className="w-full flex relative">
        {/* Login Form - Right side */}
        <div 
          className={`w-[62.5%] min-h-screen flex items-center justify-center p-8 absolute inset-y-0 right-0 transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] ${
            isLoginMode 
              ? 'opacity-100 translate-x-0 z-10' 
              : 'opacity-0 translate-x-[20%] z-0 pointer-events-none'
          }`}
        >
          <div className={`w-full max-w-md space-y-8 transition-transform duration-700 delay-100 ${isLoginMode ? 'translate-y-0' : 'translate-y-4'}`}>
            {!isForgotPassword ? (
              <>
                <div className="text-center">
                  <img src={logo} alt="Web Contador" className="h-14 mx-auto mb-6" />
                  <h1 className="text-3xl font-bold text-foreground">Entrar na Conta</h1>
                  <p className="text-muted-foreground mt-2">Use seu e-mail para login</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="E-mail"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="pl-12 h-12 bg-muted border-0 rounded-lg"
                      required
                    />
                  </div>

                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Senha"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="pl-12 pr-12 h-12 bg-muted border-0 rounded-lg"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => setIsForgotPassword(true)}
                      className="text-sm text-secondary hover:text-brand-green-light font-medium"
                    >
                      Esqueceu sua senha?
                    </button>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-secondary hover:bg-brand-green-light text-secondary-foreground font-semibold rounded-full"
                  >
                    {isLoading ? "ENTRANDO..." : "ENTRAR"}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <div className="text-center">
                  <img src={logo} alt="Web Contador" className="h-14 mx-auto mb-6" />
                  <h1 className="text-3xl font-bold text-foreground">Recuperar Senha</h1>
                  <p className="text-muted-foreground mt-2">Digite seu e-mail para receber o link</p>
                </div>

                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="E-mail"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className="pl-12 h-12 bg-muted border-0 rounded-lg"
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full h-12 bg-secondary hover:bg-brand-green-light text-secondary-foreground font-semibold rounded-full"
                  >
                    {isLoading ? "ENVIANDO..." : "ENVIAR LINK"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setIsForgotPassword(false)}
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    Voltar ao login
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>

        {/* Signup Form - Left side */}
        <div 
          className={`w-[62.5%] min-h-screen flex items-center justify-center p-8 absolute inset-y-0 left-0 transition-all duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] ${
            !isLoginMode 
              ? 'opacity-100 translate-x-0 z-10' 
              : 'opacity-0 -translate-x-[20%] z-0 pointer-events-none'
          }`}
        >
          <div className={`w-full max-w-md space-y-8 transition-transform duration-700 delay-100 ${!isLoginMode ? 'translate-y-0' : 'translate-y-4'}`}>
            <div className="text-center">
              <img src={logo} alt="Web Contador" className="h-14 mx-auto mb-6" />
              <h1 className="text-3xl font-bold text-foreground">Criar Conta</h1>
              <p className="text-muted-foreground mt-2">Use seu e-mail para cadastro</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Nome"
                    value={signupNome}
                    onChange={(e) => setSignupNome(e.target.value)}
                    className="pl-12 h-12 bg-muted border-0 rounded-lg"
                    required
                  />
                </div>
                <div className="relative flex-1">
                  <Input
                    type="text"
                    placeholder="Sobrenome"
                    value={signupSobrenome}
                    onChange={(e) => setSignupSobrenome(e.target.value)}
                    className="h-12 bg-muted border-0 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="E-mail"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  className="pl-12 h-12 bg-muted border-0 rounded-lg"
                  required
                />
              </div>

              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="CPF"
                  value={signupCpf}
                  onChange={(e) => setSignupCpf(formatCpf(e.target.value))}
                  className="pl-12 h-12 bg-muted border-0 rounded-lg"
                  required
                  maxLength={14}
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Senha"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  className="pl-12 pr-12 h-12 bg-muted border-0 rounded-lg"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              
              <div className="-mt-2">
                <PasswordChecklist password={signupPassword} />
              </div>

              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirmar senha"
                  value={signupConfirmPassword}
                  onChange={(e) => setSignupConfirmPassword(e.target.value)}
                  className="pl-12 pr-12 h-12 bg-muted border-0 rounded-lg"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 bg-secondary hover:bg-brand-green-light text-secondary-foreground font-semibold rounded-full"
              >
                {isLoading ? "CADASTRANDO..." : "CADASTRAR"}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Email Verification Modal */}
      <EmailVerificationModal
        isOpen={showEmailVerification}
        onClose={() => setShowEmailVerification(false)}
        onSuccess={() => {
          setShowEmailVerification(false);
          setIsLoginMode(true);
          toast({
            title: "E-mail verificado!",
            description: "Agora você pode fazer login.",
          });
        }}
        userId={pendingUser?.id || 0}
        email={pendingUser?.email || ""}
        nome={pendingUser?.nome || ""}
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
