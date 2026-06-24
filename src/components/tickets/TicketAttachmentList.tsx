import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  Paperclip,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  X,
} from "lucide-react";

export interface AttachmentRow {
  id: number;
  file_name: string;
  mime_type?: string | null;
  tamanho_bytes?: number | null;
  storage_path: string;
  criado_em?: string | null;
  autor_nome?: string | null;
}

function isImage(mime?: string | null, name?: string) {
  if (mime?.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name || "");
}
function isPdf(mime?: string | null, name?: string) {
  if (mime === "application/pdf") return true;
  return /\.pdf$/i.test(name || "");
}

async function signedUrl(path: string, seconds = 300) {
  const { data, error } = await supabase.storage
    .from("ticket-attachments")
    .createSignedUrl(path, seconds);
  if (error || !data?.signedUrl) {
    toast({
      title: "Erro ao gerar link",
      description: error?.message || "Tente novamente.",
      variant: "destructive",
    });
    return null;
  }
  return data.signedUrl;
}

function ThumbImage({ att }: { att: AttachmentRow }) {
  const [url, setUrl] = useState<string | null>(null);
  // lazy: gera URL na montagem
  if (!url) {
    signedUrl(att.storage_path, 600).then((u) => u && setUrl(u));
  }
  return (
    <div className="h-24 w-24 rounded-md overflow-hidden border bg-muted flex items-center justify-center">
      {url ? (
        <img
          src={url}
          alt={att.file_name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <ImageIcon className="h-6 w-6 text-muted-foreground" />
      )}
    </div>
  );
}

export function TicketAttachmentList({
  items,
  onRemove,
  compact = false,
}: {
  items: AttachmentRow[];
  onRemove?: (att: AttachmentRow) => void;
  compact?: boolean;
}) {
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  const open = async (att: AttachmentRow) => {
    const url = await signedUrl(att.storage_path, 600);
    if (!url) return;
    if (isImage(att.mime_type, att.file_name)) {
      setLightbox({ url, name: att.file_name });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };
  const download = async (att: AttachmentRow) => {
    const url = await signedUrl(att.storage_path, 120);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = att.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (!items?.length) return null;

  return (
    <>
      <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-2"}`}>
        {items.map((att) => {
          const img = isImage(att.mime_type, att.file_name);
          const pdf = isPdf(att.mime_type, att.file_name);
          return (
            <div
              key={att.id}
              className="group flex items-center gap-2 border rounded-md bg-card p-2 max-w-full"
            >
              {img ? (
                <button type="button" onClick={() => open(att)} className="flex-shrink-0">
                  <ThumbImage att={att} />
                </button>
              ) : (
                <div className="h-10 w-10 rounded-md border bg-muted flex items-center justify-center flex-shrink-0">
                  {pdf ? (
                    <FileText className="h-5 w-5 text-destructive" />
                  ) : (
                    <Paperclip className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              )}
              <div className="min-w-0 max-w-[220px]">
                <div className="text-xs font-medium truncate" title={att.file_name}>
                  {att.file_name}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {att.tamanho_bytes ? `${Math.round(att.tamanho_bytes / 1024)} KB` : ""}
                </div>
                <div className="flex gap-1 mt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5"
                    onClick={() => open(att)}
                    title={img ? "Visualizar" : "Abrir"}
                  >
                    {img ? <Eye className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5"
                    onClick={() => download(att)}
                    title="Baixar"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {onRemove && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 text-destructive hover:text-destructive"
                      onClick={() => onRemove(att)}
                      title="Remover"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-5xl p-2 bg-background">
          {lightbox && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-sm font-medium truncate">{lightbox.name}</span>
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Abrir em nova aba <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex items-center justify-center bg-black/80 rounded-md max-h-[80vh] overflow-auto">
                <img
                  src={lightbox.url}
                  alt={lightbox.name}
                  className="max-h-[80vh] max-w-full object-contain"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function translateTicketError(msg?: string | null): string {
  if (!msg) return "Erro desconhecido.";
  const m = msg.toLowerCase();
  if (m.includes("tecnico_invalido_cliente_nao_permitido"))
    return "O responsável selecionado não possui permissão para tratar chamados.";
  if (m.includes("tecnico_invalido_sem_acesso_ariia"))
    return "O responsável selecionado não tem acesso ao Ariia.";
  if (m.includes("tecnico_invalido_usuario_inativo"))
    return "O responsável selecionado está inativo.";
  if (m.includes("cliente_cannot_modify_internal_fields"))
    return "Você não tem permissão para alterar campos técnicos deste chamado.";
  if (m.includes("cliente_cannot_change_empresa"))
    return "Não é permitido alterar a empresa de um chamado.";
  if (m.includes("row-level security") || m.includes("violates row-level"))
    return "Você não tem permissão para esta operação.";
  return msg;
}
