import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface NovaPessoaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (cpfId: number, nome: string) => void;
  addPessoa: (nome: string, cpfNumero: string) => Promise<{ success: boolean; cpf_id?: number; error?: string }>;
}

// Função para aplicar máscara de CPF
const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .slice(0, 14);
};

export function NovaPessoaModal({ open, onOpenChange, onSuccess, addPessoa }: NovaPessoaModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    if (cpf.replace(/\D/g, "").length !== 11) {
      toast.error("CPF deve ter 11 dígitos");
      return;
    }

    setIsLoading(true);
    
    const result = await addPessoa(nome, cpf);
    
    if (result.success && result.cpf_id) {
      toast.success("Pessoa cadastrada com sucesso!");
      onSuccess?.(result.cpf_id, nome);
      onOpenChange(false);
      setNome("");
      setCpf("");
    } else {
      toast.error(result.error || "Erro ao cadastrar pessoa");
    }
    
    setIsLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Nova Pessoa</DialogTitle>
              <DialogDescription>
                Cadastre uma nova pessoa para vincular a empresas
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome Completo *</Label>
            <Input
              id="nome"
              placeholder="Nome da pessoa"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cpf">CPF *</Label>
            <Input
              id="cpf"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCPF(e.target.value))}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cadastrando...
                </>
              ) : (
                "Cadastrar"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
