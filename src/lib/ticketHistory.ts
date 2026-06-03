import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABELS, PRIORITY_LABELS, TicketStatus, TicketPriority } from "@/lib/ticketSla";

export interface AuditUser {
  id?: number | string | null;
  nome?: string | null;
}

export interface LogEventInput {
  ticketId: number;
  campo: string;
  valorAnterior?: string | null;
  valorNovo?: string | null;
  observacao?: string | null;
  user?: AuditUser | null;
}

export async function logTicketEvent(input: LogEventInput) {
  const { ticketId, campo, valorAnterior, valorNovo, observacao, user } = input;
  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    campo,
    valor_anterior: valorAnterior ?? null,
    valor_novo: valorNovo ?? null,
    observacao: observacao ?? null,
    autor_id: user?.id ? Number(user.id) : null,
    autor_nome: user?.nome || null,
  });
}

/**
 * Diff util — log one entry per changed field.
 * Pass a map of { fieldKey: { before, after, label? } } and we generate one history entry per diff.
 */
export async function logDiff(
  ticketId: number,
  user: AuditUser | null | undefined,
  diff: Record<string, { before: any; after: any; label?: string }>,
) {
  const inserts: any[] = [];
  for (const [key, val] of Object.entries(diff)) {
    const a = val.before ?? null;
    const b = val.after ?? null;
    if ((a ?? "") === (b ?? "")) continue;
    inserts.push({
      ticket_id: ticketId,
      campo: val.label || key,
      valor_anterior: a == null ? null : String(a),
      valor_novo: b == null ? null : String(b),
      autor_id: user?.id ? Number(user.id) : null,
      autor_nome: user?.nome || null,
    });
  }
  if (inserts.length) {
    await supabase.from("ticket_history").insert(inserts);
  }
}

/**
 * Friendly label for a field name (used by Histórico and Timeline).
 */
export function fieldLabel(campo: string): string {
  const map: Record<string, string> = {
    status: "Status",
    prioridade: "Prioridade",
    tecnico_id: "Técnico responsável",
    titulo: "Título",
    descricao: "Descrição",
    empresa_id: "Cliente",
    unidade_id: "Unidade",
    operadora_id: "Operadora",
    fila_id: "Fila",
    categoria_id: "Categoria",
    ativo: "Ativo",
    solicitante_nome: "Solicitante",
    solicitante_email: "E-mail do solicitante",
    solicitante_telefone: "Telefone do solicitante",
    comentario: "Comentário",
    anexo_add: "Anexo adicionado",
    anexo_remove: "Anexo removido",
    encerramento: "Encerramento",
    reabertura: "Reabertura",
    assigned: "Atribuição",
    assigned_group_id: "Equipe responsável",
    transferred_user: "Transferência (técnico)",
    transferred_group: "Transferência (equipe)",
    escalated: "Escalonamento",
    demoted: "Rebaixamento de nível",
    aguardando_cliente: "Aguardando cliente",
    client_replied: "Resposta do cliente",
  };
  return map[campo] || campo;
}

/**
 * Pretty-format a value based on the field (status / priority labels, etc.)
 */
export function formatValue(campo: string, value?: string | null): string {
  if (!value) return "—";
  if (campo === "status") return STATUS_LABELS[value as TicketStatus] || value;
  if (campo === "prioridade") return PRIORITY_LABELS[value as TicketPriority] || value;
  return value;
}

/**
 * Compute total time spent in each status based on the ticket_history rows for `campo = 'status'`.
 * Returns a map: statusKey -> total minutes.
 *
 * Strategy: walk history in chronological order. Each transition record gives the start time
 * of a new status. The previous status accumulates the delta from its start until this record.
 * The initial status (before first transition) starts at `dataAbertura`.
 * The current status accumulates until `now`.
 */
export function computeTimePerStatus(
  history: any[],
  initialStatus: string,
  dataAbertura: string,
  currentStatus: string,
): Record<string, number> {
  const transitions = history
    .filter((h) => h.campo === "status" && h.criado_em)
    .slice()
    .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime());

  const totals: Record<string, number> = {};
  let prevStatus = initialStatus;
  let prevTime = new Date(dataAbertura).getTime();

  for (const t of transitions) {
    const ts = new Date(t.criado_em).getTime();
    const delta = Math.max(0, ts - prevTime);
    totals[prevStatus] = (totals[prevStatus] || 0) + delta;
    prevStatus = t.valor_novo || prevStatus;
    prevTime = ts;
  }
  // tail until now
  const tail = Math.max(0, Date.now() - prevTime);
  totals[currentStatus] = (totals[currentStatus] || 0) + tail;

  // convert ms -> minutes
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(totals)) out[k] = Math.round(v / 60000);
  return out;
}

export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return "0min";
  const days = Math.floor(minutes / (60 * 24));
  const hours = Math.floor((minutes % (60 * 24)) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || parts.length === 0) parts.push(`${mins}min`);
  return parts.join(" ");
}
