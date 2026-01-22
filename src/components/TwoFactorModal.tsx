import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Shield, Loader2 } from "lucide-react";
import { verify2FA } from "@/services/authService";
import { useToast } from "@/hooks/use-toast";

interface TwoFactorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: { id: number; nome: string; permissao: string }) => void;
  userId: number;
  userName: string;
}

export function TwoFactorModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  userName,
}: TwoFactorModalProps) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast({
        title: "Erro",
        description: "Digite o código de 6 dígitos do seu autenticador.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const result = await verify2FA(userId, code);
    setIsLoading(false);

    if (result.success && result.user) {
      toast({
        title: "Login realizado!",
        description: `Bem-vindo de volta, ${result.user.nome}!`,
      });
      onSuccess(result.user as { id: number; nome: string; permissao: string });
    } else {
      toast({
        title: "Erro",
        description: result.message,
        variant: "destructive",
      });
      setCode("");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">Autenticação de Dois Fatores</DialogTitle>
          <DialogDescription className="text-center">
            Olá, <strong>{userName}</strong>! Digite o código do seu aplicativo autenticador (Google Authenticator).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center space-y-6 py-4">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(value) => setCode(value)}
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

          <Button
            onClick={handleVerify}
            disabled={isLoading || code.length !== 6}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verificando...
              </>
            ) : (
              "Verificar"
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Abra o Google Authenticator e digite o código de 6 dígitos para a conta Web Contador.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
