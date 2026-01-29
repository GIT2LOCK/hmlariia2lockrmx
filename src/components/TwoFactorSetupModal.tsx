import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, Loader2, QrCode, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getDeviceToken } from "@/services/authService";

const SUPABASE_URL = "https://vaszvkujzyzpoqmqpphz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhc3p2a3Vqenl6cG9xbXFwcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTIzNDgsImV4cCI6MjA3ODUyODM0OH0.vZ4JbfmzfFFs-GX-P3HnV04X1ylkxNraex5jqVpTvIM";

interface TwoFactorSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (session?: { token: string; expires_at: string }, user?: { id: number; nome: string; email?: string; permissao: string }) => void;
  userId: number;
  userName: string;
  userEmail?: string;
  setupToken?: string; // Token from signup for 2FA setup
}

export function TwoFactorSetupModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  userName,
  userEmail,
  setupToken,
}: TwoFactorSetupModalProps) {
  const [step, setStep] = useState<"generate" | "verify">("generate");
  const [isLoading, setIsLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true); // Default to checked
  const { toast } = useToast();

  const handleGenerateQR = async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
      };
      
      // Use setup token if available (from signup flow)
      if (setupToken) {
        headers["Authorization"] = `Bearer ${setupToken}`;
      }
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/setup-2fa`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "generate" }),
      });

      const result = await response.json();

      if (result.success) {
        setQrCodeUrl(result.qrCodeUrl);
        setSecret(result.secret);
        setStep("verify");
      } else {
        toast({
          title: "Erro",
          description: result.error || "Erro ao gerar QR Code",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error generating QR:", error);
      toast({
        title: "Erro",
        description: "Erro de conexão. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAndEnable = async () => {
    if (verificationCode.length !== 6) {
      toast({
        title: "Erro",
        description: "Digite o código de 6 dígitos do seu autenticador.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
      };
      
      // Use setup token if available (from signup flow)
      if (setupToken) {
        headers["Authorization"] = `Bearer ${setupToken}`;
      }
      
      const deviceToken = getDeviceToken();
      
      const response = await fetch(`${SUPABASE_URL}/functions/v1/setup-2fa`, {
        method: "POST",
        headers,
        body: JSON.stringify({ 
          action: "verify", 
          code: verificationCode,
          rememberDevice,
          deviceToken,
          userAgent: navigator.userAgent,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "2FA Ativado!",
          description: "Sua conta está protegida. Bem-vindo!",
        });
        // Pass session and user data to parent for auto-login
        onSuccess(result.session, result.user);
      } else {
        toast({
          title: "Erro",
          description: result.error || "Código inválido",
          variant: "destructive",
        });
        setVerificationCode("");
      }
    } catch (error) {
      console.error("Error verifying 2FA:", error);
      toast({
        title: "Erro",
        description: "Erro de conexão. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Copiado!",
      description: "Chave secreta copiada para a área de transferência.",
    });
  };

  // Prevent closing the modal - 2FA setup is mandatory
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      toast({
        title: "Configuração Obrigatória",
        description: "Você precisa configurar o 2FA para usar sua conta.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">Configurar Autenticação 2FA</DialogTitle>
          <DialogDescription className="text-center">
            {step === "generate" ? (
              <>Olá, <strong>{userName}</strong>! Para proteger sua conta, é necessário configurar a autenticação de dois fatores.</>
            ) : (
              "Escaneie o QR Code com o Google Authenticator e digite o código gerado."
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "generate" ? (
          <div className="flex flex-col items-center space-y-6 py-4">
            <div className="text-center space-y-2">
              <QrCode className="h-16 w-16 text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">
                A autenticação de dois fatores protege sua conta exigindo um código do Google Authenticator além da senha.
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <p className="font-medium">Você vai precisar:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Instalar o Google Authenticator no seu celular</li>
                <li>Escanear o QR Code que será gerado</li>
                <li>Digitar o código de 6 dígitos para confirmar</li>
              </ul>
            </div>

            <Button
              onClick={handleGenerateQR}
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando QR Code...
                </>
              ) : (
                <>
                  <QrCode className="mr-2 h-4 w-4" />
                  Gerar QR Code
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-6 py-4">
            {/* QR Code */}
            <div className="p-4 bg-white rounded-lg border shadow-sm">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="QR Code para Google Authenticator" className="w-48 h-48" />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center bg-muted">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              )}
            </div>

            {/* Manual entry */}
            <div className="w-full space-y-2">
              <p className="text-sm text-center text-muted-foreground">
                Ou digite a chave manualmente:
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-muted rounded text-xs font-mono text-center break-all">
                  {secret}
                </code>
                <Button variant="outline" size="icon" onClick={copySecret}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            {/* Verification code input */}
            <div className="space-y-3 w-full">
              <p className="text-sm text-center font-medium">
                Digite o código de 6 dígitos do app:
              </p>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={verificationCode}
                  onChange={(value) => setVerificationCode(value)}
                  disabled={isLoading}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>

            {/* Remember device checkbox */}
            <div className="flex items-center space-x-2 w-full">
              <Checkbox
                id="remember-device-setup"
                checked={rememberDevice}
                onCheckedChange={(checked) => setRememberDevice(checked === true)}
              />
              <label
                htmlFor="remember-device-setup"
                className="text-sm text-muted-foreground cursor-pointer"
              >
                Lembrar este dispositivo por 30 dias
              </label>
            </div>

            <Button
              onClick={handleVerifyAndEnable}
              disabled={isLoading || verificationCode.length !== 6}
              className="w-full"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Verificar e Ativar 2FA"
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Abra o Google Authenticator e digite o código de 6 dígitos.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
