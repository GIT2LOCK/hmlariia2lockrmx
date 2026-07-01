import { TicketStatus } from "@/lib/ticketSla";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface TicketHistoryEventInput {
  campo: string;
  valorAnterior?: string | null;
  valorNovo?: string | null;
  observacao?: string | null;
}

export interface TicketCommentInput {
  conteudo: string;
  tipo?: "INTERNO" | "CLIENTE";
}

export async function updateTicketViaEdge(opts: {
  ticketId: number;
  updates: Record<string, unknown>;
  history?: TicketHistoryEventInput[];
  comment?: TicketCommentInput | null;
}) {
  const ariiaToken = localStorage.getItem("auth_token");
  if (!ariiaToken) throw new Error("Sessão expirada. Faça login novamente.");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/update-ticket`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${ariiaToken}`,
    },
    body: JSON.stringify({
      ticket_id: opts.ticketId,
      updates: opts.updates,
      history: opts.history ?? [],
      comment: opts.comment ?? null,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) {
    throw new Error(result?.error || `update-ticket status=${response.status}`);
  }
  return result as { ok: true; ticket: any };
}

const PAUSED_STATUSES: TicketStatus[] = [
  "AGUARDANDO_CLIENTE",
  "AGUARDANDO_OPERADORA",
  "AGUARDANDO_TERCEIRO",
  "AGENDADO",
  "TRIAGEM",
];

export function buildStatusUpdate(ticket: any, status: TicketStatus) {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status };
  const wasPaused = PAUSED_STATUSES.includes(ticket.status);
  const willPause = PAUSED_STATUSES.includes(status);

  if (!wasPaused && willPause) {
    update.sla_pausa_inicio = now;
  } else if (wasPaused && !willPause && ticket.sla_pausa_inicio) {
    update.sla_pausa_inicio = null;
    update.sla_pausa_total_segundos =
      (ticket.sla_pausa_total_segundos || 0) +
      Math.round((Date.now() - new Date(ticket.sla_pausa_inicio).getTime()) / 1000);
  }

  if (status === "EM_ATENDIMENTO" && !ticket.data_primeiro_atendimento) update.data_primeiro_atendimento = now;
  if (status === "RESOLVIDO" && !ticket.data_solucao) update.data_solucao = now;
  if (status === "FECHADO") update.data_fechamento = now;

  return update;
}