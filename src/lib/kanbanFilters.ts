import { computeSlaSolucao, isClosed, STATUS_LABELS, PRIORITY_LABELS, type TicketSlaInput, type TicketPriority } from "./ticketSla";

export interface KanbanFilterTicket extends TicketSlaInput {
  id: number;
  codigo: string;
  titulo: string;
  prioridade: TicketPriority;
  tecnico_id: number | null;
  empresas?: { nome_fantasia: string } | null;
  unidades?: { nome_unidade: string } | null;
  usuarios?: { nome: string } | null;
}

export type KanbanQuickFilter = "ALL" | "MINE" | "UNASSIGNED" | "OVERDUE";
export type KanbanSort = "URGENCY" | "NEWEST" | "OLDEST";
export const normalizeKanbanSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();

export function filterKanbanTickets<T extends KanbanFilterTicket>(tickets: T[], filters: {
  search: string; scope: "ABERTOS" | "TODOS"; priority: string; quick: KanbanQuickFilter; userId: number;
}, now = new Date()): T[] {
  const query = normalizeKanbanSearch(filters.search);
  return tickets.filter(ticket => {
    if (filters.scope === "ABERTOS" && isClosed(ticket.status)) return false;
    if (filters.priority !== "ALL" && ticket.prioridade !== filters.priority) return false;
    if (filters.quick === "MINE" && ticket.tecnico_id !== filters.userId) return false;
    if (filters.quick === "UNASSIGNED" && ticket.tecnico_id != null) return false;
    if (filters.quick === "OVERDUE") {
      const remaining = computeSlaSolucao(ticket, now).remainingSeconds;
      if (remaining === null || remaining >= 0) return false;
    }
    const text = [ticket.id, ticket.codigo, ticket.titulo, STATUS_LABELS[ticket.status], PRIORITY_LABELS[ticket.prioridade], ticket.empresas?.nome_fantasia, ticket.unidades?.nome_unidade, ticket.usuarios?.nome].filter(value => value != null).join(" ");
    return !query || normalizeKanbanSearch(text).includes(query);
  });
}

export function sortKanbanTickets<T extends KanbanFilterTicket>(tickets: T[], mode: KanbanSort, now = new Date()): T[] {
  const weights: Record<TicketPriority, number> = { CRITICO: 4, ALTO: 3, MEDIO: 2, BAIXO: 1 };
  return [...tickets].sort((a, b) => {
    if (mode !== "URGENCY") {
      const diff = Date.parse(a.data_abertura) - Date.parse(b.data_abertura);
      return (mode === "OLDEST" ? diff : -diff) || a.id - b.id;
    }
    const remA = computeSlaSolucao(a, now).remainingSeconds ?? Number.MAX_SAFE_INTEGER;
    const remB = computeSlaSolucao(b, now).remainingSeconds ?? Number.MAX_SAFE_INTEGER;
    if ((remA < 0) !== (remB < 0)) return remA < 0 ? -1 : 1;
    return weights[b.prioridade] - weights[a.prioridade] || remA - remB || a.id - b.id;
  });
}