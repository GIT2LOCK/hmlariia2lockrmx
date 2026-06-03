// Helpers para SLA de chamados
export type SlaStatus = "pending" | "in_progress" | "paused" | "met" | "breached";

export interface SlaSnapshot {
  status: SlaStatus;
  dueAt: Date | null;
  targetMinutes: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  pausedMinutes: number;
}

export interface SlaView extends SlaSnapshot {
  elapsedMinutes: number;
  remainingMinutes: number;
  percentConsumed: number; // 0-100+
  level: "ok" | "warn" | "critical" | "breached" | "paused" | "met";
  remainingLabel: string;
}

export function formatMinutes(min: number): string {
  const abs = Math.abs(Math.round(min));
  const d = Math.floor(abs / (60 * 24));
  const h = Math.floor((abs % (60 * 24)) / 60);
  const m = abs % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || parts.length === 0) parts.push(`${m}min`);
  return (min < 0 ? "-" : "") + parts.join(" ");
}

export function computeSla(snap: SlaSnapshot, now: Date = new Date()): SlaView {
  const reference = snap.completedAt ?? now;
  const startedMs = snap.startedAt?.getTime() ?? null;
  const dueMs = snap.dueAt?.getTime() ?? null;
  const target = snap.targetMinutes ?? null;

  let elapsedMinutes = 0;
  if (startedMs && target) {
    const grossMin = Math.max(0, (reference.getTime() - startedMs) / 60000);
    elapsedMinutes = Math.max(0, grossMin - snap.pausedMinutes);
  }

  let remainingMinutes = 0;
  let percent = 0;
  if (target && target > 0) {
    remainingMinutes = target - elapsedMinutes;
    percent = Math.min(999, (elapsedMinutes / target) * 100);
  } else if (dueMs) {
    remainingMinutes = (dueMs - reference.getTime()) / 60000;
  }

  let level: SlaView["level"];
  if (snap.status === "met") level = "met";
  else if (snap.status === "breached" || (target && percent >= 100)) level = "breached";
  else if (snap.status === "paused") level = "paused";
  else if (percent >= 90) level = "critical";
  else if (percent >= 75) level = "warn";
  else level = "ok";

  const remainingLabel =
    snap.status === "met"
      ? "Cumprido"
      : level === "breached"
      ? `Estourado há ${formatMinutes(Math.abs(remainingMinutes))}`
      : snap.status === "paused"
      ? "Pausado"
      : `${formatMinutes(remainingMinutes)} restantes`;

  return {
    ...snap,
    elapsedMinutes,
    remainingMinutes,
    percentConsumed: percent,
    level,
    remainingLabel,
  };
}

export const slaLevelClass: Record<SlaView["level"], string> = {
  ok: "bg-secondary/15 text-secondary border-secondary/40",
  warn: "bg-amber-500/15 text-amber-600 border-amber-500/40",
  critical: "bg-orange-500/15 text-orange-600 border-orange-500/40",
  breached: "bg-destructive/15 text-destructive border-destructive/40",
  paused: "bg-muted text-muted-foreground border-border",
  met: "bg-primary/10 text-primary border-primary/30",
};

export const slaLevelLabel: Record<SlaView["level"], string> = {
  ok: "Dentro do prazo",
  warn: "Atenção",
  critical: "Crítico",
  breached: "Estourado",
  paused: "Pausado",
  met: "Cumprido",
};
