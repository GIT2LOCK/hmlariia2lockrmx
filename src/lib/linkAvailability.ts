// Executive link availability: derived from Zabbix link-outage events, never stored.

export interface OutageEvent {
  name: string;
  clock: number; // start (unix s)
  duration_sec: number;
  hostname?: string;
  host_visible?: string;
  groups?: string[];
}

const norm = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Only internet-link outages count (same wording the Zabbix dashboard classifies as "links"). */
export function isLinkOutage(name: string): boolean {
  const d = norm(name || "");
  if (d.includes("ddns")) return false;
  return d.includes("indisponibilidade de link") || d.includes("sem conexao com a unidade") || /\blink\b.*\b(down|off-?line|fora)\b/.test(d);
}

/** Union of intervals clipped to [from, till]; returns downtime seconds. */
export function mergedDowntime(intervals: Array<[number, number]>, from: number, till: number): number {
  const clipped = intervals
    .map(([s, e]) => [Math.max(s, from), Math.min(e, till)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of clipped) {
    if (!cur || iv[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [...iv];
    } else cur[1] = Math.max(cur[1], iv[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

export function availabilityPct(downtimeSec: number, from: number, till: number): number {
  const span = till - from;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, (1 - downtimeSec / span) * 100));
}

export interface MonthWindow { label: string; from: number; till: number }

/** Calendar months touched by [from, till], each clipped to the range. */
export function monthWindows(from: number, till: number): MonthWindow[] {
  const out: MonthWindow[] = [];
  const d = new Date(from * 1000);
  let cursor = new Date(d.getFullYear(), d.getMonth(), 1);
  const names = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  while (cursor.getTime() / 1000 < till) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    out.push({
      label: `${names[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`,
      from: Math.max(from, cursor.getTime() / 1000),
      till: Math.min(till, next.getTime() / 1000),
    });
    cursor = next;
  }
  return out;
}

export const fmtPct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;

export function fmtHours(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}min` : `${m}min`;
}
