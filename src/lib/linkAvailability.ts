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

/** Merge intervals (clipped) into a sorted disjoint list. */
export function mergeIntervals(intervals: Array<[number, number]>, from: number, till: number): Array<[number, number]> {
  const clipped = intervals
    .map(([s, e]) => [Math.max(s, from), Math.min(e, till)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const iv of clipped) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push([...iv]);
  }
  return out;
}

/** Seconds where ALL given interval lists are down at the same time (unit fully offline). */
export function simultaneousDowntime(lists: Array<Array<[number, number]>>, from: number, till: number): number {
  if (!lists.length) return 0;
  let acc = mergeIntervals(lists[0], from, till);
  for (const l of lists.slice(1)) {
    const b = mergeIntervals(l, from, till);
    const next: Array<[number, number]> = [];
    let i = 0, j = 0;
    while (i < acc.length && j < b.length) {
      const s = Math.max(acc[i][0], b[j][0]);
      const e = Math.min(acc[i][1], b[j][1]);
      if (e > s) next.push([s, e]);
      if (acc[i][1] < b[j][1]) i++; else j++;
    }
    acc = next;
  }
  return acc.reduce((s, [a, b]) => s + (b - a), 0);
}

export interface LinkRef { id: number; abrev: string; index: number; operadora: string }

/** Pick which link of the unit an event belongs to: exact W<n> host, then operator abbreviation, then operator name. */
export function matchLink(ev: OutageEvent, links: LinkRef[]): LinkRef | null {
  const host = norm(`${ev.hostname || ""} ${ev.host_visible || ""}`);
  const text = norm(`${host} ${ev.name || ""}`);
  const ab = (l: LinkRef) => norm(l.abrev);
  return (
    links.find((l) => l.abrev && host.includes(`${ab(l)}w${l.index}`)) ||
    links.find((l) => l.abrev && new RegExp(`_${ab(l)}w?\\d`).test(host)) ||
    links.find((l) => l.operadora && text.includes(norm(l.operadora))) ||
    null
  );
}
