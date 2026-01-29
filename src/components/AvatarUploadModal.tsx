import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Upload, X, Loader2 } from "lucide-react";

interface AvatarUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: number;
  currentAvatar?: string;
  userName: string;
  onSuccess: (newAvatarUrl: string) => void;
}

export function AvatarUploadModal({
  isOpen,
  onClose,
  userId,
  currentAvatar,
  userName,
  onSuccess,
}: AvatarUploadModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione uma imagem.",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "A imagem deve ter no máximo 2MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${userId}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, selectedFile, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const avatarUrl = urlData.publicUrl;

      // Update user record via edge function
      const token = localStorage.getItem("auth_token");
      const response = await fetch(
        "https://vaszvkujzyzpoqmqpphz.supabase.co/functions/v1/update-avatar",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhc3p2a3Vqenl6cG9xbXFwcGh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI5NTIzNDgsImV4cCI6MjA3ODUyODM0OH0.vZ4JbfmzfFFs-GX-P3HnV04X1ylkxNraex5jqVpTvIM",
          },
          body: JSON.stringify({ userId, avatarUrl }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erro ao atualizar avatar");
      }

      toast({
        title: "Foto atualizada!",
        description: "Sua foto de perfil foi alterada com sucesso.",
      });

      onSuccess(avatarUrl);
      handleClose();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Erro ao enviar foto",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setPreviewUrl(null);
    setSelectedFile(null);
    onClose();
  };

  const getInitials = () => {
    const parts = userName.split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0]?.[0]?.toUpperCase() || "?";
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar foto de perfil</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          <Avatar className="h-32 w-32">
            <AvatarImage
              src={previewUrl || currentAvatar}
              alt="Preview"
            />
            <AvatarFallback className="text-3xl">
              {getInitials()}
            </AvatarFallback>
          </Avatar>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!selectedFile ? (
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Escolher imagem
            </Button>
          ) : (
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => {
                  setPreviewUrl(null);
                  setSelectedFile(null);
                }}
                className="flex-1"
              >
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Salvar
                  </>
                )}
              </Button>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Formatos aceitos: JPG, PNG, GIF. Tamanho máximo: 2MB.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
