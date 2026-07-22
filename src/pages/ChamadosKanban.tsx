import { type DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  Filter,
  GripVertical,
  RefreshCw,
  Search,
  Table2,
  Ticket,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUser } from "@/contexts/UserContext";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { buildStatusUpdate, updateTicketViaEdge } from "@/lib/ticketActions";
import {
  CLOSED_STATUSES,
  computeSlaSolucao,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  type TicketPriority,
  type TicketStatus,
  isClosed,
} from "@/lib/ticketSla";
import { cn } from "@/lib/utils";

interface TicketRow {
  id: number;
  codigo: string;
  titulo: string;
  status: TicketStatus;
  prioridade: TicketPriority;
  data_abertura: string;
  data_solucao: string | null;
  data_primeiro_atendimento: string | null;
  sla_atendimento_minutos: number;
  sla_solucao_minutos: number;
  sla_pausa_inicio: string | null;
  sla_pausa_total_segundos: number;
  tecnico_id: number | null;
  empresas?: { nome_fantasia: string } | null;
  unidades?: { nome_unidade: string } | null;
  usuarios?: { nome: string } | null;
}

const OPEN_COLUMNS = STATUS_ORDER.filter(
  (status) => !CLOSED_STATUSES.includes(status),
);
const CLOSED_COLUMNS = STATUS_ORDER.filter((status) =>
  CLOSED_STATUSES.includes(status),
);

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  CRITICO: "bg-destructive text-destructive-foreground",
  ALTO: "bg-orange-500 text-white",
  MEDIO: "bg-amber-500 text-white",
  BAIXO: "bg-secondary text-secondary-foreground",
};

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

const COLUMN_TONES: Record<TicketStatus, string> = {
  NOVO: "border-blue-500/45 bg-blue-500/10",
  TRIAGEM: "border-cyan-500/45 bg-cyan-500/10",
  EM_ATENDIMENTO: "border-primary/45 bg-primary/10",
  AGUARDANDO_CLIENTE: "border-amber-400/50 bg-amber-400/10",
  AGUARDANDO_OPERADORA: "border-amber-500/50 bg-amber-500/10",
  AGUARDANDO_TERCEIRO: "border-amber-600/50 bg-amber-600/10",
  AGENDADO: "border-purple-500/45 bg-purple-500/10",
  RESOLVIDO: "border-emerald-600/45 bg-emerald-600/10",
  FECHADO: "border-muted-foreground/30 bg-muted/50",
  CANCELADO: "border-zinc-500/45 bg-zinc-500/10",
};

const SLA_COLORS = {
  ok: "bg-emerald-600 text-white",
  warn: "bg-amber-500 text-white",
  overdue: "bg-destructive text-destructive-foreground",
  done: "bg-muted text-muted-foreground",
  paused: "bg-zinc-500 text-white",
};

const PRIORITY_WEIGHT: Record<TicketPriority, number> = {
  CRITICO: 4,
  ALTO: 3,
  MEDIO: 2,
  BAIXO: 1,
};

function formatDate(value?: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTicketSearchText(ticket: TicketRow) {
  return [
    ticket.codigo,
    ticket.titulo,
    ticket.status,
    ticket.prioridade,
    ticket.empresas?.nome_fantasia,
    ticket.unidades?.nome_unidade,
    ticket.usuarios?.nome,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function sortByUrgency(tickets: TicketRow[]) {
  return [...tickets].sort((a, b) => {
    const slaA = computeSlaSolucao(a);
    const slaB = computeSlaSolucao(b);
    const aOverdue = slaA.remainingSeconds !== null && slaA.remainingSeconds < 0;
    const bOverdue = slaB.remainingSeconds !== null && slaB.remainingSeconds < 0;

    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

    const priorityDiff =
      PRIORITY_WEIGHT[b.prioridade] - PRIORITY_WEIGHT[a.prioridade];
    if (priorityDiff !== 0) return priorityDiff;

    const remA = slaA.remainingSeconds ?? Number.MAX_SAFE_INTEGER;
    const remB = slaB.remainingSeconds ?? Number.MAX_SAFE_INTEGER;
    return remA - remB;
  });
}

export default function ChamadosKanban() {
  const navigate = useNavigate();
  const { user } = useUser();
  const canUpdateStatus = ["SUPERADMIN", "ADMIN", "USER"].includes(user.role);

  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"ABERTOS" | "TODOS">("ABERTOS");
  const [priority, setPriority] = useState<string>("ALL");
  const [draggingTicketId, setDraggingTicketId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);
  const [updatingTicketId, setUpdatingTicketId] = useState<number | null>(null);
  const [, setClockTick] = useState(0);

  const loadTickets = useCallback(async () => {
    setLoading(true);

    try {
      const sessionToken = localStorage.getItem("auth_token") || "";
      const { data, error } = await supabase.functions.invoke("list-tickets", {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (error) throw error;

      const rows = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.tickets)
          ? (data as any).tickets
          : [];

      setTickets(rows as TicketRow[]);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar Kanban",
        description: error?.message || "Não foi possível carregar os chamados.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setClockTick((current) => current + 1),
      30_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  const changeTicketStatus = useCallback(
    async (ticket: TicketRow, nextStatus: TicketStatus) => {
      if (ticket.status === nextStatus) return;

      if (!canUpdateStatus) {
        toast({
          title: "Sem permissão",
          description: "Seu perfil não pode alterar o status de chamados.",
          variant: "destructive",
        });
        return;
      }

      const updates = buildStatusUpdate(ticket, nextStatus);
      const previousTicket = ticket;

      setUpdatingTicketId(ticket.id);
      setTickets((current) =>
        current.map((item) =>
          item.id === ticket.id ? { ...item, ...updates, status: nextStatus } : item,
        ),
      );

      try {
        await updateTicketViaEdge({
          ticketId: ticket.id,
          updates,
          history: [
            {
              campo: "status",
              valorAnterior: ticket.status,
              valorNovo: nextStatus,
              observacao: "Status atualizado via Kanban",
            },
          ],
        });

        toast({
          title: "Status atualizado",
          description: `${ticket.codigo || `#${ticket.id}`} movido para ${
            STATUS_LABELS[nextStatus]
          }.`,
        });
      } catch (error: any) {
        setTickets((current) =>
          current.map((item) =>
            item.id === previousTicket.id ? previousTicket : item,
          ),
        );
        toast({
          title: "Erro ao atualizar status",
          description: error?.message || "Não foi possível mover o chamado.",
          variant: "destructive",
        });
      } finally {
        setUpdatingTicketId(null);
      }
    },
    [canUpdateStatus],
  );

  const handleCardDragStart = useCallback(
    (event: DragEvent<HTMLElement>, ticket: TicketRow) => {
      if (!canUpdateStatus || updatingTicketId === ticket.id) {
        event.preventDefault();
        return;
      }

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("application/x-ticket-id", String(ticket.id));
      event.dataTransfer.setData("text/plain", String(ticket.id));
      setDraggingTicketId(ticket.id);
    },
    [canUpdateStatus, updatingTicketId],
  );

  const handleCardDragEnd = useCallback(() => {
    setDraggingTicketId(null);
    setDragOverStatus(null);
  }, []);

  const handleColumnDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, status: TicketStatus) => {
      if (!canUpdateStatus || draggingTicketId === null) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDragOverStatus(status);
    },
    [canUpdateStatus, draggingTicketId],
  );

  const handleColumnDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;
    setDragOverStatus(null);
  }, []);

  const handleColumnDrop = useCallback(
    async (event: DragEvent<HTMLDivElement>, nextStatus: TicketStatus) => {
      if (!canUpdateStatus) return;

      event.preventDefault();
      const ticketId = Number(
        event.dataTransfer.getData("application/x-ticket-id") ||
          event.dataTransfer.getData("text/plain") ||
          draggingTicketId,
      );
      const ticket = tickets.find((item) => item.id === ticketId);

      setDraggingTicketId(null);
      setDragOverStatus(null);

      if (!ticket) return;
      await changeTicketStatus(ticket, nextStatus);
    },
    [canUpdateStatus, changeTicketStatus, draggingTicketId, tickets],
  );

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tickets.filter((ticket) => {
      if (scope === "ABERTOS" && isClosed(ticket.status)) return false;
      if (priority !== "ALL" && ticket.prioridade !== priority) return false;
      if (query && !getTicketSearchText(ticket).includes(query)) return false;
      return true;
    });
  }, [tickets, search, scope, priority]);

  const columns = useMemo(() => {
    return scope === "TODOS" ? [...OPEN_COLUMNS, ...CLOSED_COLUMNS] : OPEN_COLUMNS;
  }, [scope]);

  const stats = useMemo(() => {
    const openTickets = tickets.filter((ticket) => !isClosed(ticket.status));
    const overdue = openTickets.filter((ticket) => {
      const sla = computeSlaSolucao(ticket);
      return sla.remainingSeconds !== null && sla.remainingSeconds < 0;
    });
    const warning = openTickets.filter((ticket) => {
      const sla = computeSlaSolucao(ticket);
      return (
        sla.remainingSeconds !== null &&
        sla.remainingSeconds > 0 &&
        sla.remainingSeconds <= 3600
      );
    });

    return {
      total: tickets.length,
      filtered: filteredTickets.length,
      open: openTickets.length,
      overdue: overdue.length,
      warning: warning.length,
      unassigned: openTickets.filter((ticket) => !ticket.tecnico_id).length,
    };
  }, [tickets, filteredTickets]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kanban de Chamados</h1>
          <p className="text-sm text-muted-foreground">
            Arraste os cartões entre as colunas para alterar o status.
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={loadTickets} title="Atualizar">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button variant="outline" onClick={() => navigate("/dashboard/chamados")}>
            <Table2 className="mr-2 h-4 w-4" />
            Ver tabela
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard title="Total" value={loading ? "..." : stats.total} />
        <StatCard title="Filtrados" value={loading ? "..." : stats.filtered} />
        <StatCard title="Abertos" value={loading ? "..." : stats.open} accent="text-primary" />
        <StatCard title="SLA vencido" value={loading ? "..." : stats.overdue} accent="text-destructive" />
        <StatCard title="Vencendo" value={loading ? "..." : stats.warning} accent="text-amber-600" />
        <StatCard title="Sem técnico" value={loading ? "..." : stats.unassigned} accent="text-muted-foreground" />
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-2 p-3 md:grid-cols-5">
          <div className="relative md:col-span-3">
            <Search className="pointer-events-none absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código, título, cliente, unidade, técnico..."
              className="pl-8"
            />
          </div>

          <Select
            value={scope}
            onValueChange={(value) => setScope(value as "ABERTOS" | "TODOS")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ABERTOS">Somente abertos</SelectItem>
              <SelectItem value="TODOS">Todos os chamados</SelectItem>
            </SelectContent>
          </Select>

          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas prioridades</SelectItem>
              {PRIORITY_ORDER.map((item) => (
                <SelectItem key={item} value={item}>
                  {PRIORITY_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <EmptyBlock title="Carregando chamados..." />
      ) : filteredTickets.length === 0 ? (
        <EmptyBlock
          title="Nenhum chamado encontrado"
          description="Ajuste os filtros ou tente uma nova busca."
        />
      ) : (
        <div className="overflow-x-auto pb-4">
          <div
            className="grid gap-4"
            style={{
              gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))`,
              minWidth: `${columns.length * 270}px`,
            }}
          >
            {columns.map((status) => {
              const columnTickets = sortByUrgency(
                filteredTickets.filter((ticket) => ticket.status === status),
              );
              const isDropTarget = dragOverStatus === status;

              return (
                <div
                  key={status}
                  className={cn(
                    "space-y-3 rounded-xl transition-colors",
                    isDropTarget && "bg-primary/5",
                  )}
                  onDragOver={(event) => handleColumnDragOver(event, status)}
                  onDragLeave={handleColumnDragLeave}
                  onDrop={(event) => handleColumnDrop(event, status)}
                >
                  <div
                    className={cn(
                      "sticky top-0 z-10 rounded-xl border p-3 backdrop-blur transition",
                      COLUMN_TONES[status],
                      isDropTarget && "ring-1 ring-primary/50",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={STATUS_COLORS[status]}>
                        {STATUS_LABELS[status]}
                      </Badge>
                      <span className="rounded-full bg-background px-2 py-0.5 text-xs font-bold">
                        {columnTickets.length}
                      </span>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "min-h-[160px] space-y-3 rounded-xl border border-transparent p-1 transition-colors",
                      isDropTarget && "border-primary/50 bg-primary/5",
                    )}
                  >
                    {columnTickets.length === 0 ? (
                      <div
                        className={cn(
                          "flex min-h-[88px] items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground",
                          isDropTarget && "border-primary/60",
                        )}
                      >
                        Nenhum chamado
                      </div>
                    ) : (
                      columnTickets.map((ticket) => (
                        <KanbanCard
                          key={ticket.id}
                          ticket={ticket}
                          draggable={canUpdateStatus}
                          isDragging={draggingTicketId === ticket.id}
                          isUpdating={updatingTicketId === ticket.id}
                          onDragStart={(event) => handleCardDragStart(event, ticket)}
                          onDragEnd={handleCardDragEnd}
                          onClick={() => navigate(`/dashboard/chamados/${ticket.id}`)}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!canUpdateStatus && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Seu perfil pode visualizar o Kanban, mas não pode alterar status por arrastar.
        </div>
      )}
    </div>
  );
}

function KanbanCard({
  ticket,
  draggable,
  isDragging,
  isUpdating,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  ticket: TicketRow;
  draggable: boolean;
  isDragging: boolean;
  isUpdating: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const sla = computeSlaSolucao(ticket);
  const isOverdue = sla.remainingSeconds !== null && sla.remainingSeconds < 0;
  const isCritical = ticket.prioridade === "CRITICO" && !isClosed(ticket.status);

  return (
    <Card
      draggable={draggable && !isUpdating}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (!isUpdating) onClick();
      }}
      aria-busy={isUpdating}
      className={cn(
        "select-none transition hover:-translate-y-0.5 hover:shadow-md",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isOverdue && "border-destructive/70 bg-destructive/5",
        isCritical && "ring-1 ring-destructive/40",
        isDragging && "opacity-50 ring-2 ring-primary/40",
        isUpdating && "pointer-events-none opacity-70",
      )}
    >
      <CardContent className="space-y-3 p-3">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              {draggable && (
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-xs font-bold text-primary">
                {ticket.codigo || `#${ticket.id}`}
              </span>
            </div>

            <Badge className={PRIORITY_COLORS[ticket.prioridade]}>
              {PRIORITY_LABELS[ticket.prioridade]}
            </Badge>
          </div>

          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
            {ticket.titulo || "Chamado sem título"}
          </h3>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <p className="line-clamp-1">
            {ticket.empresas?.nome_fantasia || "Cliente não informado"}
          </p>
          <p className="line-clamp-1">
            {ticket.unidades?.nome_unidade || "Unidade não informada"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge className={SLA_COLORS[sla.level]}>
            <Clock className="mr-1 h-3 w-3" />
            {sla.label}
          </Badge>
          <Badge variant="outline">
            <UserRound className="mr-1 h-3 w-3" />
            {ticket.usuarios?.nome || "Sem técnico"}
          </Badge>
        </div>

        <div className="border-t pt-2 text-[11px] text-muted-foreground">
          Aberto em {formatDate(ticket.data_abertura)}
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  title,
  value,
  accent,
}: {
  title: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className={cn("mt-1 text-2xl font-bold", accent)}>{value}</p>
        </div>
        <Ticket className="h-4 w-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function EmptyBlock({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center">
      <p className="font-medium">{title}</p>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
