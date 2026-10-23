import { Copy, Flag, MoreVertical, Pencil, Reply, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export default function MessageActions({ canReply, canEdit, flagged, disabled, onReply, onEdit, onCopy, onFlag, onNote }: {
  canReply: boolean; canEdit: boolean; flagged: boolean; disabled: boolean;
  onReply: () => void; onEdit: () => void; onCopy: () => void; onFlag: () => void; onNote: () => void;
}) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={disabled} className="h-7 w-7 shrink-0 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity duration-150 focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100" aria-label="Ações da mensagem" title="Ações da mensagem"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuItem disabled={!canReply} onSelect={onReply}><Reply className="mr-2 h-4 w-4" />Responder</DropdownMenuItem>
      <DropdownMenuItem onSelect={onCopy}><Copy className="mr-2 h-4 w-4" />Copiar</DropdownMenuItem>
      {canEdit && <DropdownMenuItem onSelect={onEdit}><Pencil className="mr-2 h-4 w-4" />Editar no WhatsApp</DropdownMenuItem>}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground">Somente técnicos</DropdownMenuLabel>
      <DropdownMenuItem onSelect={onFlag}><Flag className="mr-2 h-4 w-4" />{flagged ? "Remover minha sinalização" : "Sinalizar"}</DropdownMenuItem>
      <DropdownMenuItem onSelect={onNote}><StickyNote className="mr-2 h-4 w-4" />Nota / marcação interna</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}