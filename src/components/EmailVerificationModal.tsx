import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Mail, Loader2, RefreshCw } from "lucide-react";
import { sendVerificationEmail, verifyEmail } from "@/services/authService";
import { useToast } from "@/hooks/use-toast";

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  userId: number;
  email: string;
  nome: string;
}

export function EmailVerificationModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  email,
  nome,
}: EmailVerificationModalProps) {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { toast } = useToast();

  // Send verification email when modal opens
  useEffect(() => {
    if (isOpen && userId && email) {
      handleSendCode();
    }
  }, [isOpen, userId, email]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    setIsSending(true);
    const result = await sendVerificationEmail(userId, email, nome);
    setIsSending(false);

    if (result.success) {
      setCountdown(60); // 60 seconds cooldown
      toast({
        title: "Código enviado!",
        description: "Verifique sua caixa de entrada e spam.",
      });
    } else {
      toast({
        title: "Erro",
        description: result.message,
        variant: "destructive",
      });
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast({
        title: "Erro",
        description: "Digite o código de 6 dígitos.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    const result = await verifyEmail(userId, code);
    setIsLoading(false);

    if (result.success) {
      toast({
        title: "E-mail verificado!",
        description: "Sua conta foi ativada com sucesso.",
      });
      onSuccess();
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
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center">Verifique seu e-mail</DialogTitle>
          <DialogDescription className="text-center">
            Enviamos um código de 6 dígitos para <strong>{email}</strong>
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
              "Verificar E-mail"
            )}
          </Button>

          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Não recebeu o código?
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSendCode}
              disabled={isSending || countdown > 0}
            >
              {isSending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : countdown > 0 ? (
                `Reenviar em ${countdown}s`
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reenviar código
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
