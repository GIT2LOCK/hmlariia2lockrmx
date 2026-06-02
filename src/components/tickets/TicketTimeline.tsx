import { useMemo } from "react";
import {
  MessageSquare,
  Paperclip,
  Trash2,
  Pencil,
  CheckCircle2,
  RefreshCcw,
  UserCog,
  Flag,
  Activity,
  PlusCircle,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { fieldLabel, formatValue } from "@/lib/ticketHistory";

interface Props {
  ticket: any;
  history: any[];
  comments: any[];
  attachments: any[];
}

interface TimelineItem {
  id: string;
  at: string;
  author?: string | null;
  icon: React.ReactNode;
  tone: string; // bg color class for icon bullet
  title: string;
  description?: React.ReactNode;
}

const fmt = (d?: string | null) =>
  d ? format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

export function TicketTimeline({ ticket, history, comments, attachments }: Props) {
  const items: TimelineItem[] = useMemo(() => {
    const arr: TimelineItem[] = [];

    // creation
    arr.push({
      id: `create-${ticket.id}`,
      at: ticket.data_abertura,
      author: ticket.solicitante_nome || ticket.usuarios?.nome || "Sistema",
      icon: <PlusCircle className="h-3.5 w-3.5" />,
      tone: "bg-primary text-primary-foreground",
      title: "Chamado criado",
      description: ticket.titulo,
    });

    for (const h of history) {
      const base = {
        id: `h-${h.id}`,
        at: h.criado_em,
        author: h.autor_nome,
      };
      switch (h.campo) {
        case "status":
          arr.push({
            ...base,
            icon: <Activity className="h-3.5 w-3.5" />,
            tone: "bg-blue-500 text-white",
            title: "Status alterado",
            description: (
              <span>
                <span className="text-muted-foreground line-through">
                  {formatValue("status", h.valor_anterior)}
                </span>
                <span className="mx-2">→</span>
                <span className="font-medium">{formatValue("status", h.valor_novo)}</span>
              </span>
            ),
          });
          break;
        case "prioridade":
          arr.push({
            ...base,
            icon: <Flag className="h-3.5 w-3.5" />,
            tone: "bg-amber-500 text-white",
            title: "Prioridade alterada",
            description: (
              <span>
                <span className="text-muted-foreground line-through">
                  {formatValue("prioridade", h.valor_anterior)}
                </span>
                <span className="mx-2">→</span>
                <span className="font-medium">{formatValue("prioridade", h.valor_novo)}</span>
              </span>
            ),
          });
          break;
        case "tecnico_id":
          arr.push({
            ...base,
            icon: <UserCog className="h-3.5 w-3.5" />,
            tone: "bg-purple-500 text-white",
            title: "Responsável alterado",
            description: (
              <span>
                <span className="text-muted-foreground line-through">{h.valor_anterior || "—"}</span>
                <span className="mx-2">→</span>
                <span className="font-medium">{h.valor_novo || "—"}</span>
              </span>
            ),
          });
          break;
        case "comentario":
          arr.push({
            ...base,
            icon: <MessageSquare className="h-3.5 w-3.5" />,
            tone: "bg-secondary text-secondary-foreground",
            title: h.valor_novo === "INTERNO" ? "Nota interna adicionada" : "Comentário adicionado",
            description: h.observacao,
          });
          break;
        case "anexo_add":
          arr.push({
            ...base,
            icon: <Paperclip className="h-3.5 w-3.5" />,
            tone: "bg-emerald-600 text-white",
            title: "Anexo adicionado",
            description: h.valor_novo,
          });
          break;
        case "anexo_remove":
          arr.push({
            ...base,
            icon: <PaperclipIcon className="h-3.5 w-3.5" />,
            tone: "bg-destructive text-destructive-foreground",
            title: "Anexo removido",
            description: h.valor_anterior,
          });
          break;
        case "encerramento":
          arr.push({
            ...base,
            icon: <CheckCircle2 className="h-3.5 w-3.5" />,
            tone: "bg-emerald-600 text-white",
            title: "Chamado encerrado",
            description: (
              <div className="space-y-1">
                <div><b>Motivo:</b> {h.valor_novo || "—"}</div>
                {h.observacao && (
                  <div className="text-muted-foreground whitespace-pre-wrap">{h.observacao}</div>
                )}
              </div>
            ),
          });
          break;
        case "reabertura":
          arr.push({
            ...base,
            icon: <RefreshCcw className="h-3.5 w-3.5" />,
            tone: "bg-orange-500 text-white",
            title: "Chamado reaberto",
            description: (
              <div className="space-y-1">
                <div>
                  <span className="text-muted-foreground line-through">
                    {formatValue("status", h.valor_anterior)}
                  </span>
                  <span className="mx-2">→</span>
                  <span className="font-medium">{formatValue("status", h.valor_novo)}</span>
                </div>
                {h.observacao && (
                  <div className="text-muted-foreground whitespace-pre-wrap">
                    <b>Motivo:</b> {h.observacao}
                  </div>
                )}
              </div>
            ),
          });
          break;
        default:
          arr.push({
            ...base,
            icon: <Pencil className="h-3.5 w-3.5" />,
            tone: "bg-zinc-500 text-white",
            title: `${fieldLabel(h.campo)} alterado`,
            description: (
              <span>
                <span className="text-muted-foreground line-through">{h.valor_anterior || "—"}</span>
                <span className="mx-2">→</span>
                <span className="font-medium">{h.valor_novo || "—"}</span>
              </span>
            ),
          });
      }
    }

    // Order chronologically (oldest first)
    arr.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return arr;
  }, [ticket, history, comments, attachments]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Sem eventos</p>;
  }

  return (
    <div className="relative pl-6 space-y-5">
      <div className="absolute left-[11px] top-1 bottom-1 w-px bg-border" />
      {items.map((it) => (
        <div key={it.id} className="relative">
          <div
            className={`absolute -left-[18px] top-0.5 h-6 w-6 rounded-full flex items-center justify-center shadow ${it.tone}`}
          >
            {it.icon}
          </div>
          <div className="ml-2">
            <div className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="font-semibold">{it.title}</span>
              <span className="text-xs text-muted-foreground">
                · {fmt(it.at)} · {it.author || "Sistema"}
              </span>
            </div>
            {it.description && (
              <div className="text-sm text-foreground/90 mt-0.5">{it.description}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
