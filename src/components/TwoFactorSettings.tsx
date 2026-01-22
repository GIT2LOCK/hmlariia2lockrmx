import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, ShieldCheck, ShieldOff, Loader2, QrCode, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStoredUser } from "@/services/authService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SUPABASE_URL = "https://vaszvkujzyzpoqmqpphz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhc3p2a3Vqenl6cG9xbXFwcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTIzNDgsImV4cCI6MjA3ODUyODM0OH0.vZ4JbfmzfFFs-GX-P3HnV04X1ylkxNraex5jqVpTvIM";

interface TwoFactorSettingsProps {
  userId: number;
  isEnabled: boolean;
  onStatusChange: (enabled: boolean) => void;
}

export function TwoFactorSettings({ userId, isEnabled, onStatusChange }: TwoFactorSettingsProps) {
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleGenerateQR = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/setup-2fa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ userId, action: "generate" }),
      });

      const result = await response.json();

      if (result.success) {
        setQrCodeUrl(result.qrCodeUrl);
        setSecret(result.secret);
        setShowSetupDialog(true);
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
      const response = await fetch(`${SUPABASE_URL}/functions/v1/setup-2fa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ userId, action: "verify", code: verificationCode }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "2FA Ativado!",
          description: "Autenticação de dois fatores configurada com sucesso.",
        });
        setShowSetupDialog(false);
        setVerificationCode("");
        onStatusChange(true);
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

  const handleDisable2FA = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/setup-2fa`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ userId, action: "disable" }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "2FA Desativado",
          description: "Autenticação de dois fatores foi desativada.",
        });
        setShowDisableDialog(false);
        onStatusChange(false);
      } else {
        toast({
          title: "Erro",
          description: result.error || "Erro ao desativar 2FA",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error disabling 2FA:", error);
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Autenticação de Dois Fatores (2FA)
              </CardTitle>
              <CardDescription>
                Adicione uma camada extra de segurança à sua conta
              </CardDescription>
            </div>
            <Badge variant={isEnabled ? "default" : "secondary"} className={isEnabled ? "bg-green-500" : ""}>
              {isEnabled ? (
                <>
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Ativo
                </>
              ) : (
                <>
                  <ShieldOff className="h-3 w-3 mr-1" />
                  Inativo
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A autenticação de dois fatores adiciona uma camada extra de segurança exigindo um código 
              do Google Authenticator além da sua senha ao fazer login.
            </p>

            {isEnabled ? (
              <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800 dark:text-green-200">2FA está ativo</p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      Sua conta está protegida com autenticação de dois fatores.
                    </p>
                  </div>
                </div>
                <Button 
                  variant="destructive" 
                  onClick={() => setShowDisableDialog(true)}
                  disabled={isLoading}
                >
                  Desativar 2FA
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <QrCode className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Configure o Google Authenticator</p>
                    <p className="text-sm text-muted-foreground">
                      Escaneie o QR Code com o app para começar.
                    </p>
                  </div>
                </div>
                <Button onClick={handleGenerateQR} disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Ativar 2FA
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Setup Dialog */}
      <Dialog open={showSetupDialog} onOpenChange={setShowSetupDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center">Configurar Google Authenticator</DialogTitle>
            <DialogDescription className="text-center">
              Escaneie o QR Code abaixo com o Google Authenticator
            </DialogDescription>
          </DialogHeader>

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
          </div>
        </DialogContent>
      </Dialog>

      {/* Disable Confirmation Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar Autenticação de Dois Fatores?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá a proteção extra da sua conta. Você precisará configurar novamente 
              caso queira reativar o 2FA no futuro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDisable2FA} 
              disabled={isLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Desativando...
                </>
              ) : (
                "Sim, desativar 2FA"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
