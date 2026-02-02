import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SaveFilterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (nome: string) => Promise<boolean>;
}

export function SaveFilterModal({ open, onOpenChange, onSave }: SaveFilterModalProps) {
  const [nome, setNome] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) return;
    
    setIsLoading(true);
    const success = await onSave(nome.trim());
    setIsLoading(false);
    
    if (success) {
      setNome("");
      onOpenChange(false);
    }
  };

  const handleClose = () => {
    setNome("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Salvar Filtro Favorito</DialogTitle>
          <DialogDescription>
            Dê um nome para este conjunto de filtros para acessá-lo rapidamente.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="filter-name">Nome do filtro</Label>
          <Input
            id="filter-name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Demandas urgentes da Empresa X"
            className="mt-2"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!nome.trim() || isLoading}>
            {isLoading ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
