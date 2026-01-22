import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Mail, Lock, User, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import logo from "@/assets/logo.png";
import PasswordChecklist from "@/components/PasswordChecklist";

// Função para aplicar máscara de CPF
const formatCpf = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Login realizado!",
        description: "Bem-vindo de volta ao Web Contador.",
      });
      navigate("/dashboard");
    }, 1500);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validar CPF completo
    const cpfDigits = signupCpf.replace(/\D/g, "");
    if (cpfDigits.length !== 11) {
      toast({
        title: "Erro",
        description: "CPF inválido. Digite os 11 dígitos.",
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
    
    // Usuário será criado com permissão VIEWER por padrão
    console.log("Criando usuário:", {
      nome: nomeCompleto,
      email: signupEmail,
      cpf: signupCpf,
      permissao: "VIEWER" // Permissão padrão
    });
    
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Conta criada!",
        description: "Sua conta foi criada com sucesso. Você está no grupo VIEWER.",
      });
      setIsLoginMode(true);
      // Limpar campos
      setSignupNome("");
      setSignupSobrenome("");
      setSignupEmail("");
      setSignupCpf("");
      setSignupPassword("");
      setSignupConfirmPassword("");
    }, 1500);
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
    </div>
  );
};

export default Index;
