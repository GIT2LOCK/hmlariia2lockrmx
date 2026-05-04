// SLA helpers para o módulo de Tickets

export type TicketStatus =
  | "NOVO"
  | "TRIAGEM"
  | "EM_ATENDIMENTO"
  | "AGUARDANDO_CLIENTE"
  | "AGUARDANDO_OPERADORA"
  | "AGUARDANDO_TERCEIRO"
  | "AGENDADO"
  | "RESOLVIDO"
  | "FECHADO"
  | "CANCELADO";

export type TicketPriority = "CRITICO" | "ALTO" | "MEDIO" | "BAIXO";

export const STATUS_LABELS: Record<TicketStatus, string> = {
  NOVO: "Novo",
  TRIAGEM: "Triagem",
  EM_ATENDIMENTO: "Em atendimento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  AGUARDANDO_OPERADORA: "Aguardando operadora",
  AGUARDANDO_TERCEIRO: "Aguardando terceiro",
  AGENDADO: "Agendado",
  RESOLVIDO: "Resolvido",
  FECHADO: "Fechado",
  CANCELADO: "Cancelado",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  CRITICO: "Crítico",
  ALTO: "Alto",
  MEDIO: "Médio",
  BAIXO: "Baixo",
};

// SLA em minutos
export const SLA_ATENDIMENTO: Record<TicketPriority, number> = {
  CRITICO: 15,
  ALTO: 30,
  MEDIO: 120,
  BAIXO: 480,
};

export const SLA_SOLUCAO: Record<TicketPriority, number> = {
  CRITICO: 240,
  ALTO: 480,
  MEDIO: 1440,
  BAIXO: 4320,
};

export const PAUSED_STATUSES: TicketStatus[] = [
  "AGUARDANDO_CLIENTE",
  "AGUARDANDO_OPERADORA",
  "AGUARDANDO_TERCEIRO",
  "AGENDADO",
  "TRIAGEM",
];

export const CLOSED_STATUSES: TicketStatus[] = ["RESOLVIDO", "FECHADO", "CANCELADO"];

export function isPaused(status: TicketStatus) {
  return PAUSED_STATUSES.includes(status);
}
export function isClosed(status: TicketStatus) {
  return CLOSED_STATUSES.includes(status);
}

export interface TicketSlaInput {
  status: TicketStatus;
  data_abertura: string;
  data_solucao?: string | null;
  data_primeiro_atendimento?: string | null;
  sla_atendimento_minutos: number;
  sla_solucao_minutos: number;
  sla_pausa_inicio?: string | null;
  sla_pausa_total_segundos?: number | null;
}

export interface SlaState {
  /** segundos restantes até o vencimento (negativo = vencido). null = encerrado */
  remainingSeconds: number | null;
  /** rótulo de tempo formatado */
  label: string;
  /** ok | warn | overdue | done */
  level: "ok" | "warn" | "overdue" | "done" | "paused";
}

function fmtDuration(totalSeconds: number) {
  const abs = Math.abs(totalSeconds);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Calcula estado do SLA de SOLUÇÃO (o mais usado para o badge da lista). */
export function computeSlaSolucao(t: TicketSlaInput, now = new Date()): SlaState {
  if (isClosed(t.status)) {
    return { remainingSeconds: null, label: STATUS_LABELS[t.status], level: "done" };
  }
  const opened = new Date(t.data_abertura).getTime();
  const pausedAccum = (t.sla_pausa_total_segundos || 0) * 1000;
  let pausedNow = 0;
  if (isPaused(t.status) && t.sla_pausa_inicio) {
    pausedNow = now.getTime() - new Date(t.sla_pausa_inicio).getTime();
  }
  const elapsedMs = now.getTime() - opened - pausedAccum - pausedNow;
  const targetMs = t.sla_solucao_minutos * 60 * 1000;
  const remainingMs = targetMs - elapsedMs;
  const remainingSeconds = Math.round(remainingMs / 1000);

  if (isPaused(t.status)) {
    return {
      remainingSeconds,
      label: `Pausado · ${fmtDuration(remainingSeconds)}`,
      level: "paused",
    };
  }
  if (remainingSeconds < 0) {
    return { remainingSeconds, label: `Vencido ${fmtDuration(remainingSeconds)}`, level: "overdue" };
  }
  // <= 20% do tempo total restante => warn
  if (remainingMs <= targetMs * 0.2) {
    return { remainingSeconds, label: `${fmtDuration(remainingSeconds)} restantes`, level: "warn" };
  }
  return { remainingSeconds, label: `${fmtDuration(remainingSeconds)} restantes`, level: "ok" };
}

export const PRIORITY_ORDER: TicketPriority[] = ["CRITICO", "ALTO", "MEDIO", "BAIXO"];
export const STATUS_ORDER: TicketStatus[] = [
  "NOVO",
  "TRIAGEM",
  "EM_ATENDIMENTO",
  "AGUARDANDO_CLIENTE",
  "AGUARDANDO_OPERADORA",
  "AGUARDANDO_TERCEIRO",
  "AGENDADO",
  "RESOLVIDO",
  "FECHADO",
  "CANCELADO",
];
