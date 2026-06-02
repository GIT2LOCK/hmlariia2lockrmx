import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User, CalendarClock, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  STATUS_LABELS,
  TicketStatus,
} from "@/lib/ticketSla";
import { computeTimePerStatus, formatDuration } from "@/lib/ticketHistory";

const STATUS_COLORS: Record<TicketStatus, string> = {
  NOVO: "bg-blue-500 text-white",
  TRIAGEM: "bg-cyan-500 text-white",
  EM_ATENDIMENTO: "bg-primary text-primary-foreground",
  AGUARDANDO_CLIENTE: "bg-amber-400 text-black",
  AGUARDANDO_OPERADORA: "bg-amber-500 text-white",
  AGUARDANDO_TERCEIRO: "bg-amber-600 text-white",
  AGENDADO: "bg-purple-500 text-white",
  RESOLVIDO: "bg-emerald-600 text-white",
  FECHADO: "bg-muted text-muted-foreground",
  CANCELADO: "bg-zinc-500 text-white",
};

const fmt = (d?: string | null) =>
  d ? format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

interface Props {
  ticket: any;
  history: any[];
}

export function TicketHeaderInfo({ ticket, history }: Props) {
  const opened = new Date(ticket.data_abertura).getTime();
  const totalMin = Math.max(0, Math.round((Date.now() - opened) / 60000));
  const pausedMin = Math.round((ticket.sla_pausa_total_segundos || 0) / 60);
  const activeMin = Math.max(0, totalMin - pausedMin);

  // figure out the initial status: oldest "status" transition's valor_anterior, or current
  const statusEvents = history
    .filter((h) => h.campo === "status")
    .slice()
    .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());
  const initialStatus =
    statusEvents[0]?.valor_anterior || ticket.status;

  const perStatus = computeTimePerStatus(
    history,
    initialStatus,
    ticket.data_abertura,
    ticket.status,
  );

  return (
    <Card>
      <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCell
          icon={<CalendarClock className="h-4 w-4" />}
          label="Aberto em"
          value={fmt(ticket.data_abertura)}
        />
        <InfoCell
          icon={<RefreshCw className="h-4 w-4" />}
          label="Última atualização"
          value={fmt(ticket.atualizado_em)}
        />
        <InfoCell
          icon={<User className="h-4 w-4" />}
          label="Técnico responsável"
          value={ticket.usuarios?.nome || "Não atribuído"}
        />
        <InfoCell
          icon={<Clock className="h-4 w-4" />}
          label="Tempo total"
          value={`${formatDuration(activeMin)}${pausedMin ? ` (pausa ${formatDuration(pausedMin)})` : ""}`}
        />

        <div className="col-span-2 md:col-span-4 mt-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Tempo em cada status
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(perStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([s, m]) => (
                <Badge
                  key={s}
                  className={`${STATUS_COLORS[s as TicketStatus] || "bg-muted text-muted-foreground"} gap-1.5`}
                >
                  <span>{STATUS_LABELS[s as TicketStatus] || s}</span>
                  <span className="opacity-80">·</span>
                  <span>{formatDuration(m)}</span>
                </Badge>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          {label}
        </div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </div>
  );
}
