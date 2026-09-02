import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Eraser,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Search,
  Timer,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, startOfISOWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const SEVERITY_OPTIONS = [
  { value: 5, label: "Disaster", color: "#7c0a0a" },
  { value: 4, label: "High", color: "#dc2626" },
  { value: 3, label: "Average", color: "#f59e0b" },
  { value: 2, label: "Warning", color: "#eab308" },
  { value: 1, label: "Information", color: "#3b82f6" },
  { value: 0, label: "Not classified", color: "#6b7280" },
];

const severityLabel = (s: number) => SEVERITY_OPTIONS.find((o) => o.value === s)?.label || String(s);
const severityColor = (s: number) => SEVERITY_OPTIONS.find((o) => o.value === s)?.color || "#6b7280";

const PERIOD_PRESETS = [
  { value: "24h", label: "Últimas 24 horas", days: 1 },
  { value: "7d", label: "Últimos 7 dias", days: 7 },
  { value: "30d", label: "Últimos 30 dias", days: 30 },
  { value: "60d", label: "Últimos 60 dias", days: 60 },
  { value: "90d", label: "Últimos 90 dias", days: 90 },
  { value: "6m", label: "Últimos 6 meses", days: 180 },
  { value: "12m", label: "Últimos 12 meses", days: 365 },
  { value: "custom", label: "Período personalizado (timestamp)", days: 0 },
];

const AMBIENTES = [{ value: "z2", label: "2LOCK" }];

const WEEKDAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const DURATION_BUCKETS = [
  { label: "< 15 min", min: 0, max: 900 },
  { label: "15–60 min", min: 900, max: 3600 },
  { label: "1–4 h", min: 3600, max: 14400 },
  { label: "4–12 h", min: 14400, max: 43200 },
  { label: "12–24 h", min: 43200, max: 86400 },
  { label: "1–7 dias", min: 86400, max: 604800 },
  { label: "> 7 dias", min: 604800, max: Infinity },
];

interface EventTag { tag: string; value: string }

interface ZabbixEvent {
  eventid: string;
  clock: number;
  name: string;
  triggerid?: string | null;
  severity: number;
  hostid?: string | null;
  hostname: string;
  host_visible: string;
  groups: string[];
  groupids?: string[];
  tags?: EventTag[];
  duration_sec: number;
  status: "OPEN" | "RESOLVED";
  resolved_at: number | null;
  acknowledged: boolean;
}

interface Empresa { id: number; nome_fantasia: string }
interface Unidade {
  id: number;
  empresa_id: number;
  nome_unidade: string;
  hostname: string | null;
  abreviacao: string | null;
  cidade: string | null;
  estado: string | null;
}
interface HostGroup { groupid: string; name: string }

const fmtDuration = (sec: number) => {
  if (!sec || sec < 0) return "-";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || (!d && !h)) parts.push(`${m}m`);
  return parts.join(" ");
};

const fmtDate = (ts: number | null) => (ts ? format(new Date(ts * 1000), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }) : "-");
const fmtDateShort = (ts: number | null) => (ts ? format(new Date(ts * 1000), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-");

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : "0%");

const median = (values: number[]) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx];
};

const buildPositiveIntegerTicks = (maxValue: number) => {
  const safeMax = Math.max(0, Math.ceil(maxValue || 0));
  if (safeMax === 0) return [0, 1];
  const roughStep = Math.max(1, Math.ceil(safeMax / 4));
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceNormalized * magnitude;
  const top = Math.ceil(safeMax / step) * step;
  return Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
};

const bucketKey = (date: Date, granularity: string) => {
  if (granularity === "hour") return format(date, "yyyy-MM-dd HH:00");
  if (granularity === "day") return format(date, "yyyy-MM-dd");
  if (granularity === "week") return format(startOfISOWeek(date), "yyyy-MM-dd");
  return format(date, "yyyy-MM");
};

const bucketLabel = (key: string, granularity: string) => {
  if (granularity === "hour") return format(new Date(key.replace(" ", "T") + ":00"), "dd/MM HH'h'", { locale: ptBR });
  if (granularity === "day") return format(new Date(key + "T00:00:00"), "dd/MM", { locale: ptBR });
  if (granularity === "week") return `sem ${format(new Date(key + "T00:00:00"), "dd/MM", { locale: ptBR })}`;
  const [y, m] = key.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMM/yy", { locale: ptBR });
};

export default function RelatorioAlertasZabbix() {
  // Consulta (backend)
  const [ambiente, setAmbiente] = useState("z2");
  const [period, setPeriod] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [severities, setSeverities] = useState<number[]>([4]);
  const [hostgroupId, setHostgroupId] = useState("all");
  const [search, setSearch] = useState("");
  const [apiMinDurationMin, setApiMinDurationMin] = useState("5");

  // Filtros locais (granulares)
  const [empresaId, setEmpresaId] = useState("all");
  const [unidadeId, setUnidadeId] = useState("all");
  const [estado, setEstado] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ackFilter, setAckFilter] = useState("all");
  const [minDurationH, setMinDurationH] = useState("0");
  const [maxDurationH, setMaxDurationH] = useState("");
  const [hourFrom, setHourFrom] = useState("0");
  const [hourTo, setHourTo] = useState("23");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [hostFilter, setHostFilter] = useState("all");
  const [groupNameFilter, setGroupNameFilter] = useState("all");
  const [triggerContains, setTriggerContains] = useState("");
  const [excludeTerms, setExcludeTerms] = useState("");
  const [tagKey, setTagKey] = useState("all");
  const [tagValue, setTagValue] = useState("");
  const [resolvedWindow, setResolvedWindow] = useState("all");
  const [granularity, setGranularity] = useState("day");
  const [topN, setTopN] = useState("10");

  const [loading, setLoading] = useState(false);
  const [rawEvents, setRawEvents] = useState<ZabbixEvent[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [hostgroups, setHostgroups] = useState<HostGroup[]>([]);
  const [queriedRange, setQueriedRange] = useState<{ from: number; till: number } | null>(null);

  useEffect(() => {
    supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia").then(({ data }) => {
      setEmpresas(((data as Empresa[]) || []).filter((e) => !!e.nome_fantasia));
    });
    supabase
      .from("unidades")
      .select("id, empresa_id, nome_unidade, hostname, abreviacao, cidade, estado")
      .then(({ data }) => setUnidades((data as Unidade[]) || []));
  }, []);

  useEffect(() => {
    setHostgroupId("all");
    supabase.functions
      .invoke("zabbix-dashboard", { body: { action: "hostgroups_by_source", source: ambiente } })
      .then(({ data, error }) => {
        if (error) return;
        setHostgroups((data as HostGroup[]) || []);
      });
  }, [ambiente]);

  const computeRange = (): { from: number; till: number } | null => {
    const now = Math.floor(Date.now() / 1000);
    if (period === "custom") {
      if (!customFrom || !customTo) return null;
      const from = Math.floor(new Date(customFrom).getTime() / 1000);
      const till = Math.floor(new Date(customTo).getTime() / 1000);
      if (!from || !till || from >= till) return null;
      return { from, till };
    }
    const preset = PERIOD_PRESETS.find((p) => p.value === period);
    return { from: now - (preset?.days || 30) * 86400, till: now };
  };

  const fetchEvents = async () => {
    const range = computeRange();
    if (!range) return toast.error("Período inválido");
    if (severities.length === 0) return toast.error("Selecione ao menos uma severidade");
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        action: "events_history",
        source: ambiente,
        time_from: range.from,
        time_till: range.till,
        severities,
        search: search || undefined,
        min_duration_sec: Math.max(0, Math.round((Number(apiMinDurationMin) || 0) * 60)),
      };
      if (hostgroupId !== "all") body.hostgroup_ids = [hostgroupId];
      const [historyRes, openRes] = await Promise.all([
        supabase.functions.invoke("zabbix-dashboard", { body }),
        supabase.functions.invoke("zabbix-dashboard", {
          body: {
            action: "current_open_problems",
            source: ambiente,
            severities,
            search: search || undefined,
            ...(hostgroupId !== "all" ? { hostgroup_ids: [hostgroupId] } : {}),
          },
        }),
      ]);
      if (historyRes.error) throw historyRes.error;
      setRawEvents((historyRes.data?.events as ZabbixEvent[]) || []);
      setOpenCount(Number(openRes.data?.count ?? 0));
      setQueriedRange(range);
      if (historyRes.data?.truncated) toast.warning("Resultado truncado pelo Zabbix — reduza o período.");
      toast.success(`${historyRes.data?.total ?? 0} alertas encontrados`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao consultar Zabbix");
    } finally {
      setLoading(false);
    }
  };

  const clearLocalFilters = () => {
    setEmpresaId("all");
    setUnidadeId("all");
    setEstado("all");
    setStatusFilter("all");
    setAckFilter("all");
    setMinDurationH("0");
    setMaxDurationH("");
    setHourFrom("0");
    setHourTo("23");
    setWeekdays([]);
    setHostFilter("all");
    setGroupNameFilter("all");
    setTriggerContains("");
    setExcludeTerms("");
    setTagKey("all");
    setTagValue("");
    setResolvedWindow("all");
  };

  const unidadesFiltradas = useMemo(
    () =>
      unidades
        .filter((u) => (empresaId === "all" ? true : String(u.empresa_id) === empresaId))
        .sort((a, b) => a.nome_unidade.localeCompare(b.nome_unidade)),
    [unidades, empresaId],
  );

  const estados = useMemo(
    () => Array.from(new Set(unidades.map((u) => u.estado).filter((v): v is string => !!v))).sort(),
    [unidades],
  );

  const tokensFor = (list: Unidade[]) =>
    Array.from(
      new Set(
        list
          .flatMap((u) => [u.hostname, u.abreviacao, u.nome_unidade])
          .filter((v): v is string => !!v && v.trim().length >= 2)
          .map((v) => v.trim().toLowerCase()),
      ),
    );

  const scopeTokens = useMemo(() => {
    if (unidadeId !== "all") {
      const u = unidades.find((x) => String(x.id) === unidadeId);
      return u ? tokensFor([u]) : [];
    }
    if (estado !== "all") {
      const list = unidades.filter(
        (u) => u.estado === estado && (empresaId === "all" || String(u.empresa_id) === empresaId),
      );
      return tokensFor(list);
    }
    if (empresaId !== "all") return tokensFor(unidades.filter((u) => String(u.empresa_id) === empresaId));
    return null;
  }, [unidadeId, estado, empresaId, unidades]);

  const haystack = (e: ZabbixEvent) =>
    `${e.hostname || ""} ${e.host_visible || ""} ${(e.groups || []).join(" ")}`.toLowerCase();

  // Mapeia evento -> unidade/empresa
  const unitIndex = useMemo(() => {
    const entries = unidades.map((u) => ({
      unidade: u,
      tokens: tokensFor([u]).sort((a, b) => b.length - a.length),
    }));
    return entries.sort((a, b) => (b.tokens[0]?.length || 0) - (a.tokens[0]?.length || 0));
  }, [unidades]);

  const empresaNome = (id: number) => empresas.find((e) => e.id === id)?.nome_fantasia || "—";

  const resolveUnidade = (e: ZabbixEvent) => {
    const hs = haystack(e);
    for (const entry of unitIndex) if (entry.tokens.some((t) => hs.includes(t))) return entry.unidade;
    return null;
  };

  const events = useMemo(() => {
    const minSec = (Number(minDurationH) || 0) * 3600;
    const maxSec = maxDurationH.trim() ? Number(maxDurationH) * 3600 : Infinity;
    const hf = Math.max(0, Math.min(23, Number(hourFrom) || 0));
    const ht = Math.max(0, Math.min(23, Number(hourTo) === 0 && hourTo !== "0" ? 23 : Number(hourTo)));
    const excl = excludeTerms
      .split(/[;,]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const trg = triggerContains.trim().toLowerCase();
    const tv = tagValue.trim().toLowerCase();
    const now = Math.floor(Date.now() / 1000);

    return rawEvents.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (ackFilter === "ack" && !e.acknowledged) return false;
      if (ackFilter === "unack" && e.acknowledged) return false;
      if (e.duration_sec < minSec || e.duration_sec > maxSec) return false;

      const d = new Date(e.clock * 1000);
      const h = d.getHours();
      if (hf <= ht ? h < hf || h > ht : !(h >= hf || h <= ht)) return false;
      if (weekdays.length && !weekdays.includes(d.getDay())) return false;

      if (hostFilter !== "all" && (e.host_visible || e.hostname) !== hostFilter) return false;
      if (groupNameFilter !== "all" && !(e.groups || []).includes(groupNameFilter)) return false;
      if (trg && !e.name.toLowerCase().includes(trg)) return false;
      if (excl.length) {
        const blob = `${e.name} ${e.hostname} ${e.host_visible}`.toLowerCase();
        if (excl.some((t) => blob.includes(t))) return false;
      }
      if (tagKey !== "all") {
        const matches = (e.tags || []).filter((t) => t.tag === tagKey);
        if (!matches.length) return false;
        if (tv && !matches.some((t) => (t.value || "").toLowerCase().includes(tv))) return false;
      }
      if (resolvedWindow !== "all") {
        if (!e.resolved_at) return false;
        const limitSec = resolvedWindow === "24h" ? 86400 : resolvedWindow === "7d" ? 604800 : 2592000;
        if (now - e.resolved_at > limitSec) return false;
      }
      if (scopeTokens) {
        if (scopeTokens.length === 0) return false;
        const hs = haystack(e);
        if (!scopeTokens.some((t) => hs.includes(t))) return false;
      }
      return true;
    });
  }, [
    rawEvents, statusFilter, ackFilter, minDurationH, maxDurationH, hourFrom, hourTo, weekdays,
    hostFilter, groupNameFilter, triggerContains, excludeTerms, tagKey, tagValue, resolvedWindow, scopeTokens,
  ]);

  const hostOptions = useMemo(
    () => Array.from(new Set(rawEvents.map((e) => e.host_visible || e.hostname).filter(Boolean))).sort(),
    [rawEvents],
  );
  const groupOptions = useMemo(
    () => Array.from(new Set(rawEvents.flatMap((e) => e.groups || []))).sort(),
    [rawEvents],
  );
  const tagKeyOptions = useMemo(
    () => Array.from(new Set(rawEvents.flatMap((e) => (e.tags || []).map((t) => t.tag)).filter(Boolean))).sort(),
    [rawEvents],
  );

  // ---------- Métricas ----------
  const total = events.length;
  const resolved = events.filter((e) => e.status === "RESOLVED").length;
  const stillOpen = events.filter((e) => e.status === "OPEN").length;
  const acked = events.filter((e) => e.acknowledged).length;
  const durations = events.map((e) => e.duration_sec);
  const avgDuration = total ? Math.round(durations.reduce((s, v) => s + v, 0) / total) : 0;
  const medDuration = median(durations);
  const p90Duration = percentile(durations, 90);
  const maxDuration = durations.length ? Math.max(...durations) : 0;
  const totalDowntime = durations.reduce((s, v) => s + v, 0);
  const uniqueHosts = new Set(events.map((e) => e.host_visible || e.hostname)).size;
  const uniqueTriggers = new Set(events.map((e) => e.name)).size;
  const rangeDays = queriedRange ? Math.max(1, (queriedRange.till - queriedRange.from) / 86400) : 1;
  const alertsPerDay = Math.round((total / rangeDays) * 10) / 10;

  const series = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const e of events) {
      const key = bucketKey(new Date(e.clock * 1000), granularity);
      map[key] = map[key] || { total: 0 };
      map[key].total += 1;
      const sl = severityLabel(e.severity);
      map[key][sl] = (map[key][sl] || 0) + 1;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ bucket: bucketLabel(k, granularity), key: k, ...v }) as { bucket: string; key: string; total: number } & Record<string, number | string>);
  }, [events, granularity]);

  const seriesTicks = useMemo(
    () => buildPositiveIntegerTicks(Math.max(0, ...series.map((s) => Number(s.total) || 0))),
    [series],
  );

  const mttrSeries = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const e of events) {
      if (e.status !== "RESOLVED") continue;
      const key = bucketKey(new Date(e.clock * 1000), granularity);
      (map[key] = map[key] || []).push(e.duration_sec);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, arr]) => ({
        bucket: bucketLabel(k, granularity),
        mttrH: Math.round((arr.reduce((s, v) => s + v, 0) / arr.length / 3600) * 100) / 100,
        eventos: arr.length,
      }));
  }, [events, granularity]);

  const bySeverity = useMemo(() => {
    const map: Record<number, number> = {};
    for (const e of events) map[e.severity] = (map[e.severity] || 0) + 1;
    return SEVERITY_OPTIONS.filter((o) => map[o.value]).map((o) => ({
      name: o.label,
      value: map[o.value],
      color: o.color,
    }));
  }, [events]);

  const byHourOfDay = useMemo(() => {
    const arr = Array.from({ length: 24 }, (_, h) => ({ hora: `${String(h).padStart(2, "0")}h`, count: 0 }));
    for (const e of events) arr[new Date(e.clock * 1000).getHours()].count += 1;
    return arr;
  }, [events]);

  const byWeekday = useMemo(() => {
    const map: Record<number, number> = {};
    for (const e of events) {
      const d = new Date(e.clock * 1000).getDay();
      map[d] = (map[d] || 0) + 1;
    }
    return WEEKDAYS.map((w) => ({ dia: w.label, count: map[w.value] || 0 }));
  }, [events]);

  const heatmap = useMemo(() => {
    const grid: Record<number, number[]> = {};
    for (const w of WEEKDAYS) grid[w.value] = Array.from({ length: 24 }, () => 0);
    for (const e of events) {
      const d = new Date(e.clock * 1000);
      grid[d.getDay()][d.getHours()] += 1;
    }
    const max = Math.max(1, ...Object.values(grid).flat());
    return { grid, max };
  }, [events]);

  const durationDist = useMemo(
    () =>
      DURATION_BUCKETS.map((b) => ({
        faixa: b.label,
        count: events.filter((e) => e.duration_sec >= b.min && e.duration_sec < b.max).length,
      })),
    [events],
  );

  const ackDist = useMemo(
    () => [
      { name: "Reconhecidos", value: acked, color: "hsl(215 85% 65%)" },
      { name: "Não reconhecidos", value: total - acked, color: "#dc2626" },
    ].filter((d) => d.value > 0),
    [acked, total],
  );

  const limit = Number(topN) || 10;

  const aggregate = (keyFn: (e: ZabbixEvent) => string) => {
    const map: Record<string, ZabbixEvent[]> = {};
    for (const e of events) {
      const k = keyFn(e) || "—";
      (map[k] = map[k] || []).push(e);
    }
    return Object.entries(map)
      .map(([key, list]) => {
        const durs = list.map((x) => x.duration_sec);
        const res = list.filter((x) => x.status === "RESOLVED");
        return {
          key,
          count: list.length,
          abertos: list.length - res.length,
          ack: list.filter((x) => x.acknowledged).length,
          mttr: res.length ? Math.round(res.reduce((s, x) => s + x.duration_sec, 0) / res.length) : 0,
          maxDur: durs.length ? Math.max(...durs) : 0,
          downtime: durs.reduce((s, v) => s + v, 0),
          criticos: list.filter((x) => x.severity >= 4).length,
        };
      })
      .sort((a, b) => b.count - a.count);
  };

  const byHost = useMemo(() => aggregate((e) => e.host_visible || e.hostname), [events]);
  const byTrigger = useMemo(() => aggregate((e) => e.name), [events]);
  const byGroup = useMemo(() => {
    const map: Record<string, ZabbixEvent[]> = {};
    for (const e of events) for (const g of e.groups?.length ? e.groups : ["—"]) (map[g] = map[g] || []).push(e);
    return Object.entries(map)
      .map(([key, list]) => ({
        key,
        count: list.length,
        abertos: list.filter((x) => x.status === "OPEN").length,
        criticos: list.filter((x) => x.severity >= 4).length,
        downtime: list.reduce((s, x) => s + x.duration_sec, 0),
        mttr: (() => {
          const r = list.filter((x) => x.status === "RESOLVED");
          return r.length ? Math.round(r.reduce((s, x) => s + x.duration_sec, 0) / r.length) : 0;
        })(),
      }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  const byUnidade = useMemo(() => {
    const map: Record<string, { unidade: Unidade | null; list: ZabbixEvent[] }> = {};
    for (const e of events) {
      const u = resolveUnidade(e);
      const k = u ? `${u.id}` : "sem-vinculo";
      map[k] = map[k] || { unidade: u, list: [] };
      map[k].list.push(e);
    }
    return Object.values(map)
      .map(({ unidade, list }) => {
        const r = list.filter((x) => x.status === "RESOLVED");
        return {
          unidade: unidade ? unidade.nome_unidade : "Sem vínculo com unidade",
          empresa: unidade ? empresaNome(unidade.empresa_id) : "—",
          cidade: unidade?.cidade || "—",
          estado: unidade?.estado || "—",
          count: list.length,
          criticos: list.filter((x) => x.severity >= 4).length,
          abertos: list.filter((x) => x.status === "OPEN").length,
          mttr: r.length ? Math.round(r.reduce((s, x) => s + x.duration_sec, 0) / r.length) : 0,
          downtime: list.reduce((s, x) => s + x.duration_sec, 0),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [events, unitIndex, empresas]);

  const byEmpresa = useMemo(() => {
    const map: Record<string, ZabbixEvent[]> = {};
    for (const e of events) {
      const u = resolveUnidade(e);
      const k = u ? empresaNome(u.empresa_id) : "Sem vínculo";
      (map[k] = map[k] || []).push(e);
    }
    return Object.entries(map)
      .map(([key, list]) => {
        const r = list.filter((x) => x.status === "RESOLVED");
        return {
          key,
          count: list.length,
          criticos: list.filter((x) => x.severity >= 4).length,
          abertos: list.filter((x) => x.status === "OPEN").length,
          mttr: r.length ? Math.round(r.reduce((s, x) => s + x.duration_sec, 0) / r.length) : 0,
          downtime: list.reduce((s, x) => s + x.duration_sec, 0),
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [events, unitIndex, empresas]);

  const byTag = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events)
      for (const t of e.tags || []) {
        const k = t.value ? `${t.tag}: ${t.value}` : t.tag;
        map[k] = (map[k] || 0) + 1;
      }
    return Object.entries(map)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  }, [events]);

  const pareto = useMemo(() => {
    const top = byTrigger.slice(0, limit);
    let acc = 0;
    return top.map((t) => {
      acc += t.count;
      return {
        name: t.key.length > 40 ? t.key.slice(0, 39) + "…" : t.key,
        count: t.count,
        acumulado: total ? Math.round((acc / total) * 1000) / 10 : 0,
      };
    });
  }, [byTrigger, limit, total]);

  const topHostsChart = useMemo(
    () => byHost.slice(0, limit).map((h) => ({ host: h.key, count: h.count })),
    [byHost, limit],
  );
  const topTriggersChart = useMemo(
    () => byTrigger.slice(0, limit).map((t) => ({ host: t.key.length > 60 ? t.key.slice(0, 59) + "…" : t.key, count: t.count })),
    [byTrigger, limit],
  );

  const rangeLabel = () => (queriedRange ? `${fmtDate(queriedRange.from)} → ${fmtDate(queriedRange.till)}` : "");

  // ---------- Export ----------
  const detailRows = () =>
    events.map((e) => {
      const u = resolveUnidade(e);
      const d = new Date(e.clock * 1000);
      return {
        "Event ID": e.eventid,
        "Data/Hora início": fmtDate(e.clock),
        "Timestamp (epoch)": e.clock,
        Data: format(d, "dd/MM/yyyy"),
        Hora: format(d, "HH:mm:ss"),
        "Hora do dia": d.getHours(),
        "Dia da semana": format(d, "EEEE", { locale: ptBR }),
        Empresa: u ? empresaNome(u.empresa_id) : "—",
        Unidade: u?.nome_unidade || "—",
        Cidade: u?.cidade || "—",
        UF: u?.estado || "—",
        Host: e.host_visible || e.hostname,
        Hostname: e.hostname,
        "Host Groups": (e.groups || []).join(" | "),
        Trigger: e.name,
        "Trigger ID": e.triggerid || "",
        Severidade: severityLabel(e.severity),
        "Severidade (nº)": e.severity,
        Tags: (e.tags || []).map((t) => (t.value ? `${t.tag}=${t.value}` : t.tag)).join(" | "),
        Reconhecido: e.acknowledged ? "Sim" : "Não",
        "Status atual": e.status === "RESOLVED" ? "Resolvido" : "Aberto",
        "Resolvido em": fmtDate(e.resolved_at),
        "Duração": fmtDuration(e.duration_sec),
        "Duração (segundos)": e.duration_sec,
        "Duração (horas)": Math.round((e.duration_sec / 3600) * 100) / 100,
      };
    });

  const exportSheets = () => {
    const dur = (s: number) => fmtDuration(s);
    return {
      Detalhamento: detailRows(),
      Resumo: [
        { Indicador: "Período", Valor: rangeLabel() },
        { Indicador: "Total de alertas", Valor: total },
        { Indicador: "Resolvidos", Valor: resolved },
        { Indicador: "Ainda abertos (no recorte)", Valor: stillOpen },
        { Indicador: "Em aberto agora (Zabbix)", Valor: openCount },
        { Indicador: "Reconhecidos", Valor: `${acked} (${pct(acked, total)})` },
        { Indicador: "Duração média (MTTR)", Valor: dur(avgDuration) },
        { Indicador: "Duração mediana", Valor: dur(medDuration) },
        { Indicador: "Duração P90", Valor: dur(p90Duration) },
        { Indicador: "Maior duração", Valor: dur(maxDuration) },
        { Indicador: "Indisponibilidade somada", Valor: dur(totalDowntime) },
        { Indicador: "Hosts distintos", Valor: uniqueHosts },
        { Indicador: "Triggers distintas", Valor: uniqueTriggers },
        { Indicador: "Alertas por dia", Valor: alertsPerDay },
      ],
      "Série temporal": series.map((s) => ({ Período: s.bucket, Total: s.total, ...s })),
      "MTTR por período": mttrSeries.map((s) => ({ Período: s.bucket, "MTTR (h)": s.mttrH, Eventos: s.eventos })),
      "Por severidade": bySeverity.map((s) => ({ Severidade: s.name, Alertas: s.value, "%": pct(s.value, total) })),
      "Por hora do dia": byHourOfDay.map((h) => ({ Hora: h.hora, Alertas: h.count })),
      "Por dia da semana": byWeekday.map((d) => ({ Dia: d.dia, Alertas: d.count })),
      "Faixas de duração": durationDist.map((d) => ({ Faixa: d.faixa, Alertas: d.count, "%": pct(d.count, total) })),
      "Por host": byHost.map((h) => ({
        Host: h.key, Alertas: h.count, Críticos: h.criticos, Abertos: h.abertos, Reconhecidos: h.ack,
        MTTR: dur(h.mttr), "Maior duração": dur(h.maxDur), "Indisponibilidade": dur(h.downtime),
      })),
      "Por trigger": byTrigger.map((t) => ({
        Trigger: t.key, Alertas: t.count, Críticos: t.criticos, Abertos: t.abertos,
        MTTR: dur(t.mttr), "Maior duração": dur(t.maxDur), "Indisponibilidade": dur(t.downtime),
      })),
      "Por host group": byGroup.map((g) => ({
        "Host Group": g.key, Alertas: g.count, Críticos: g.criticos, Abertos: g.abertos,
        MTTR: dur(g.mttr), "Indisponibilidade": dur(g.downtime),
      })),
      "Por unidade": byUnidade.map((u) => ({
        Unidade: u.unidade, Empresa: u.empresa, Cidade: u.cidade, UF: u.estado,
        Alertas: u.count, Críticos: u.criticos, Abertos: u.abertos, MTTR: dur(u.mttr), "Indisponibilidade": dur(u.downtime),
      })),
      "Por empresa": byEmpresa.map((e) => ({
        Empresa: e.key, Alertas: e.count, Críticos: e.criticos, Abertos: e.abertos,
        MTTR: dur(e.mttr), "Indisponibilidade": dur(e.downtime),
      })),
      "Por tag": byTag.map((t) => ({ Tag: t.key, Alertas: t.count })),
      "Pareto triggers": pareto.map((p) => ({ Trigger: p.name, Alertas: p.count, "Acumulado %": p.acumulado })),
    } as Record<string, Record<string, unknown>[]>;
  };

  const downloadCsv = (rows: Record<string, unknown>[], name: string) => {
    if (!rows.length) return toast.error("Sem dados para exportar");
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(";"),
      ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(";")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => downloadCsv(detailRows(), `alertas-zabbix-${ambiente}`);

  const exportXLSX = () => {
    if (!events.length) return toast.error("Sem dados para exportar");
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(exportSheets())) {
      if (!rows.length) continue;
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name.slice(0, 31));
    }
    XLSX.writeFile(wb, `relatorio-zabbix-${ambiente}-${Date.now()}.xlsx`);
  };

  const exportPDF = () => {
    if (!events.length) return toast.error("Sem dados para exportar");
    const doc = new jsPDF({ orientation: "landscape" });
    const ambienteLabel = AMBIENTES.find((a) => a.value === ambiente)?.label || ambiente;
    doc.setFontSize(16);
    doc.text("Relatório de Alertas Zabbix", 14, 16);
    doc.setFontSize(10);
    doc.text(`Ambiente: ${ambienteLabel}`, 14, 24);
    doc.text(`Período: ${rangeLabel()}`, 14, 30);
    doc.text(`Severidades: ${severities.map(severityLabel).join(", ")}`, 14, 36);
    doc.text(
      `Total: ${total}  Resolvidos: ${resolved}  Abertos agora: ${openCount}  MTTR: ${fmtDuration(avgDuration)}  P90: ${fmtDuration(p90Duration)}`,
      14, 42,
    );

    autoTable(doc, {
      startY: 48,
      head: [["Host", "Alertas", "Críticos", "Abertos", "MTTR", "Maior duração", "Indisponibilidade"]],
      body: byHost.slice(0, limit).map((h) => [h.key, h.count, h.criticos, h.abertos, fmtDuration(h.mttr), fmtDuration(h.maxDur), fmtDuration(h.downtime)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [10, 18, 92] },
    });

    autoTable(doc, {
      head: [["Trigger", "Alertas", "Críticos", "MTTR", "Indisponibilidade"]],
      body: byTrigger.slice(0, limit).map((t) => [t.key, t.count, t.criticos, fmtDuration(t.mttr), fmtDuration(t.downtime)]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [10, 18, 92] },
    });

    autoTable(doc, {
      head: [["Data/Hora", "Host", "Trigger", "Severidade", "Duração", "Ack", "Status", "Resolvido em"]],
      body: events.map((e) => [
        fmtDateShort(e.clock),
        e.host_visible || e.hostname,
        e.name,
        severityLabel(e.severity),
        fmtDuration(e.duration_sec),
        e.acknowledged ? "Sim" : "Não",
        e.status === "RESOLVED" ? "Resolvido" : "Aberto",
        fmtDateShort(e.resolved_at),
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [10, 18, 92] },
    });

    doc.save(`relatorio-zabbix-${ambiente}-${Date.now()}.pdf`);
  };

  const activeLocalFilters = [
    empresaId !== "all" && "Cliente",
    unidadeId !== "all" && "Unidade",
    estado !== "all" && "UF",
    statusFilter !== "all" && "Situação",
    ackFilter !== "all" && "Reconhecimento",
    Number(minDurationH) > 0 && "Duração mín.",
    maxDurationH.trim() && "Duração máx.",
    (hourFrom !== "0" || hourTo !== "23") && "Faixa horária",
    weekdays.length > 0 && "Dias da semana",
    hostFilter !== "all" && "Host",
    groupNameFilter !== "all" && "Host group",
    triggerContains.trim() && "Trigger contém",
    excludeTerms.trim() && "Exclusões",
    tagKey !== "all" && "Tag",
    resolvedWindow !== "all" && "Resolvido em",
  ].filter(Boolean) as string[];

  return (
    <div className="p-6 space-y-6 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatório de Alertas Zabbix</h1>
          <p className="text-sm text-muted-foreground">
            Análise granular de alertas por ambiente, cliente, unidade, host, trigger, tag, horário e duração
          </p>
        </div>
      </div>

      {/* Consulta */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">Consulta ao Zabbix</CardTitle>
          <p className="text-xs text-muted-foreground">Define o que é buscado na API. Alterar exige clicar em “Consultar”.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Ambiente">
            <Select value={ambiente} onValueChange={setAmbiente}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AMBIENTES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Host Group (Zabbix)">
            <Select value={hostgroupId} onValueChange={setHostgroupId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todos</SelectItem>
                {hostgroups.map((g) => <SelectItem key={g.groupid} value={g.groupid}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Período">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Duração mínima na consulta (min)">
            <Input type="number" min="0" step="1" value={apiMinDurationMin} onChange={(e) => setApiMinDurationMin(e.target.value)} />
          </Field>

          {period === "custom" && (
            <>
              <Field label="De (data e hora)">
                <Input type="datetime-local" step="1" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              </Field>
              <Field label="Até (data e hora)">
                <Input type="datetime-local" step="1" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
              </Field>
            </>
          )}

          <div className="space-y-1.5 md:col-span-2">
            <Label>Severidades</Label>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((s) => {
                const active = severities.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() =>
                      setSeverities((prev) => (prev.includes(s.value) ? prev.filter((v) => v !== s.value) : [...prev, s.value]))
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                      active ? "text-white border-transparent" : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    style={active ? { backgroundColor: s.color } : {}}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Buscar na consulta (host / trigger)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Filtrar pelo nome do host ou trigger..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-4 flex flex-wrap gap-2 justify-end">
            <Button onClick={fetchEvents} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filtros granulares */}
      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Filtros granulares</CardTitle>
            <p className="text-xs text-muted-foreground">
              Aplicados instantaneamente sobre os {rawEvents.length} alertas carregados.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={clearLocalFilters}>
            <Eraser className="h-4 w-4 mr-2" /> Limpar
          </Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Cliente (empresa)">
            <Select value={empresaId} onValueChange={(v) => { setEmpresaId(v); setUnidadeId("all"); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todos</SelectItem>
                {empresas.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nome_fantasia}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Unidade">
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todas</SelectItem>
                {unidadesFiltradas.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.nome_unidade}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="UF da unidade">
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todas</SelectItem>
                {estados.map((uf) => <SelectItem key={uf} value={uf}>{uf}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Host (Zabbix)">
            <Select value={hostFilter} onValueChange={setHostFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todos</SelectItem>
                {hostOptions.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Host group (nome)">
            <Select value={groupNameFilter} onValueChange={setGroupNameFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todos</SelectItem>
                {groupOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Situação do evento">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="OPEN">Somente em aberto</SelectItem>
                <SelectItem value="RESOLVED">Somente resolvidos</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Reconhecimento">
            <Select value={ackFilter} onValueChange={setAckFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ack">Reconhecidos</SelectItem>
                <SelectItem value="unack">Não reconhecidos</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Resolvido nos últimos">
            <Select value={resolvedWindow} onValueChange={setResolvedWindow}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Indiferente</SelectItem>
                <SelectItem value="24h">24 horas</SelectItem>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Duração mínima (horas)">
            <Input type="number" min="0" step="0.5" value={minDurationH} onChange={(e) => setMinDurationH(e.target.value)} />
          </Field>

          <Field label="Duração máxima (horas)">
            <Input type="number" min="0" step="0.5" placeholder="sem limite" value={maxDurationH} onChange={(e) => setMaxDurationH(e.target.value)} />
          </Field>

          <Field label="Hora do dia — de">
            <Select value={hourFrom} onValueChange={setHourFrom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}h</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Hora do dia — até">
            <Select value={hourTo} onValueChange={setHourTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {Array.from({ length: 24 }, (_, h) => (
                  <SelectItem key={h} value={String(h)}>{String(h).padStart(2, "0")}h</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Tag (chave)">
            <Select value={tagKey} onValueChange={setTagKey}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todas</SelectItem>
                {tagKeyOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Tag (valor contém)">
            <Input placeholder="ex.: core, wan..." value={tagValue} onChange={(e) => setTagValue(e.target.value)} disabled={tagKey === "all"} />
          </Field>

          <Field label="Trigger contém">
            <Input placeholder="ex.: unavailable, ping" value={triggerContains} onChange={(e) => setTriggerContains(e.target.value)} />
          </Field>

          <Field label="Excluir termos (vírgula)">
            <Input placeholder="ex.: teste, lab" value={excludeTerms} onChange={(e) => setExcludeTerms(e.target.value)} />
          </Field>

          <Field label="Granularidade dos gráficos">
            <Select value={granularity} onValueChange={setGranularity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hour">Por hora</SelectItem>
                <SelectItem value="day">Por dia</SelectItem>
                <SelectItem value="week">Por semana</SelectItem>
                <SelectItem value="month">Por mês</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field label="Top N (rankings)">
            <Select value={topN} onValueChange={setTopN}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["5", "10", "15", "25", "50", "100"].map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Dias da semana</Label>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((w) => {
                const active = weekdays.includes(w.value);
                return (
                  <button
                    key={w.value}
                    type="button"
                    onClick={() =>
                      setWeekdays((prev) => (prev.includes(w.value) ? prev.filter((v) => v !== w.value) : [...prev, w.value]))
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                      active ? "bg-primary text-primary-foreground border-transparent" : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {w.label}
                  </button>
                );
              })}
            </div>
          </div>

          {activeLocalFilters.length > 0 && (
            <div className="md:col-span-2 lg:col-span-4 flex flex-wrap gap-1.5">
              {activeLocalFilters.map((f) => (
                <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Total de alertas" value={total} tone="primary" />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Em aberto (agora)" value={openCount} tone="warning" />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} label="Resolvidos" value={resolved} tone="success" />
        <KpiCard icon={<Timer className="h-5 w-5" />} label="MTTR (média)" value={fmtDuration(avgDuration)} tone="muted" />
        <KpiCard icon={<Timer className="h-5 w-5" />} label="Mediana / P90" value={`${fmtDuration(medDuration)} / ${fmtDuration(p90Duration)}`} tone="muted" />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Alertas por dia" value={alertsPerDay} tone="primary" />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} label="Reconhecidos" value={`${acked} (${pct(acked, total)})`} tone="success" />
        <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Abertos no recorte" value={stillOpen} tone="warning" />
        <KpiCard icon={<Timer className="h-5 w-5" />} label="Maior duração" value={fmtDuration(maxDuration)} tone="muted" />
        <KpiCard icon={<Timer className="h-5 w-5" />} label="Indisponibilidade somada" value={fmtDuration(totalDowntime)} tone="muted" />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Hosts distintos" value={uniqueHosts} tone="primary" />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Triggers distintas" value={uniqueTriggers} tone="primary" />
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        <strong>Total</strong> e <strong>Resolvidos</strong> referem-se ao período filtrado.{" "}
        <strong>Em aberto (agora)</strong> mostra apenas problemas ativos neste momento, ignorando hosts em manutenção — por isso{" "}
        <em>Total − Resolvidos</em> normalmente não é igual a <em>Em aberto</em>.
      </p>

      {/* Exportação */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> Exportação</CardTitle>
          <p className="text-xs text-muted-foreground">O Excel traz todas as abas (resumo, séries, rankings, cruzamentos e detalhamento).</p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPDF}><FileText className="h-4 w-4 mr-2" /> PDF executivo</Button>
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel completo (.xlsx)</Button>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> CSV detalhado</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Imprimir</Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="visao" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="tempo">Tempo & sazonalidade</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="cruzamentos">Cruzamentos</TabsTrigger>
          <TabsTrigger value="detalhe">Detalhamento</TabsTrigger>
        </TabsList>

        {/* Visão geral */}
        <TabsContent value="visao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alertas ao longo do tempo</CardTitle>
              <p className="text-xs text-muted-foreground">Quantidade de eventos gerados por {granularity === "hour" ? "hora" : granularity === "day" ? "dia" : granularity === "week" ? "semana" : "mês"}.</p>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} ticks={seriesTicks} domain={[0, seriesTicks[seriesTicks.length - 1] || 1]} />
                  <Tooltip />
                  <Area type="monotone" dataKey="total" name="Alertas" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Composição por severidade no tempo</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {SEVERITY_OPTIONS.map((s) => (
                    <Bar key={s.value} dataKey={s.label} stackId="sev" fill={s.color} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Por severidade</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bySeverity}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="value">{bySeverity.map((entry, i) => <Cell key={i} fill={entry.color} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Reconhecimento</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={ackDist} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} label>
                      {ackDist.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Distribuição por duração</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={durationDist}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="faixa" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Alertas" fill="hsl(215 85% 65%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tempo & sazonalidade */}
        <TabsContent value="tempo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">MTTR por período</CardTitle>
              <p className="text-xs text-muted-foreground">Tempo médio de resolução (horas) dos eventos resolvidos e volume no período.</p>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mttrSeries}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="right" dataKey="eventos" name="Eventos resolvidos" fill="hsl(215 85% 65% / 0.6)" />
                  <Line yAxisId="left" type="monotone" dataKey="mttrH" name="MTTR (h)" stroke="hsl(var(--primary))" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Alertas por hora do dia</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byHourOfDay}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={1} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Alertas" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Alertas por dia da semana</CardTitle></CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byWeekday}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="dia" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" name="Alertas" fill="hsl(215 85% 65%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mapa de calor — dia da semana × hora</CardTitle>
              <p className="text-xs text-muted-foreground">Concentração de alertas para dimensionar plantão e janelas de manutenção.</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="text-[10px] border-separate border-spacing-[2px]">
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: 24 }, (_, h) => (
                      <th key={h} className="font-normal text-muted-foreground w-6">{String(h).padStart(2, "0")}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map((w) => (
                    <tr key={w.value}>
                      <td className="pr-2 text-muted-foreground whitespace-nowrap">{w.label}</td>
                      {heatmap.grid[w.value].map((v, h) => (
                        <td
                          key={h}
                          title={`${w.label} ${String(h).padStart(2, "0")}h — ${v} alertas`}
                          className="h-6 w-6 rounded text-center align-middle"
                          style={{
                            backgroundColor: v ? `hsla(235, 100%, 35%, ${0.12 + (v / heatmap.max) * 0.88})` : "hsl(var(--muted))",
                            color: v / heatmap.max > 0.5 ? "white" : "hsl(var(--muted-foreground))",
                          }}
                        >
                          {v || ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rankings */}
        <TabsContent value="rankings" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Top {limit} hosts com mais alertas</CardTitle></CardHeader>
            <CardContent style={{ height: Math.max(288, topHostsChart.length * 34 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topHostsChart} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="host" width={200} interval={0} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Alertas" fill="hsl(var(--primary))" barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Top {limit} triggers mais recorrentes</CardTitle></CardHeader>
            <CardContent style={{ height: Math.max(288, topTriggersChart.length * 34 + 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topTriggersChart} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="host" width={300} interval={0} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Alertas" fill="hsl(215 85% 65%)" barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pareto de triggers</CardTitle>
              <p className="text-xs text-muted-foreground">Quais causas concentram a maior parte dos alertas (% acumulado).</p>
            </CardHeader>
            <CardContent className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pareto} margin={{ bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" angle={-35} textAnchor="end" height={90} tick={{ fontSize: 10 }} interval={0} />
                  <YAxis yAxisId="left" allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} unit="%" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="count" name="Alertas" fill="hsl(var(--primary))" />
                  <Line yAxisId="right" type="monotone" dataKey="acumulado" name="Acumulado %" stroke="#dc2626" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <AggTable
            title={`Hosts (${byHost.length})`}
            columns={["Host", "Alertas", "Críticos", "Abertos", "Ack", "MTTR", "Maior duração", "Indisponibilidade"]}
            rows={byHost.slice(0, limit).map((h) => [h.key, h.count, h.criticos, h.abertos, h.ack, fmtDuration(h.mttr), fmtDuration(h.maxDur), fmtDuration(h.downtime)])}
            onExport={() =>
              downloadCsv(
                byHost.map((h) => ({ Host: h.key, Alertas: h.count, Críticos: h.criticos, Abertos: h.abertos, Ack: h.ack, MTTR: fmtDuration(h.mttr), "Maior duração": fmtDuration(h.maxDur), Indisponibilidade: fmtDuration(h.downtime) })),
                "zabbix-hosts",
              )
            }
          />

          <AggTable
            title={`Triggers (${byTrigger.length})`}
            columns={["Trigger", "Alertas", "Críticos", "Abertos", "MTTR", "Maior duração", "Indisponibilidade"]}
            rows={byTrigger.slice(0, limit).map((t) => [t.key, t.count, t.criticos, t.abertos, fmtDuration(t.mttr), fmtDuration(t.maxDur), fmtDuration(t.downtime)])}
            onExport={() =>
              downloadCsv(
                byTrigger.map((t) => ({ Trigger: t.key, Alertas: t.count, Críticos: t.criticos, Abertos: t.abertos, MTTR: fmtDuration(t.mttr), "Maior duração": fmtDuration(t.maxDur), Indisponibilidade: fmtDuration(t.downtime) })),
                "zabbix-triggers",
              )
            }
          />

          <AggTable
            title={`Tags (${byTag.length})`}
            columns={["Tag", "Alertas", "% do total"]}
            rows={byTag.slice(0, limit).map((t) => [t.key, t.count, pct(t.count, total)])}
            onExport={() => downloadCsv(byTag.map((t) => ({ Tag: t.key, Alertas: t.count, "%": pct(t.count, total) })), "zabbix-tags")}
          />
        </TabsContent>

        {/* Cruzamentos */}
        <TabsContent value="cruzamentos" className="space-y-4">
          <AggTable
            title={`Por empresa (${byEmpresa.length})`}
            columns={["Empresa", "Alertas", "Críticos", "Abertos", "MTTR", "Indisponibilidade"]}
            rows={byEmpresa.map((e) => [e.key, e.count, e.criticos, e.abertos, fmtDuration(e.mttr), fmtDuration(e.downtime)])}
            onExport={() =>
              downloadCsv(
                byEmpresa.map((e) => ({ Empresa: e.key, Alertas: e.count, Críticos: e.criticos, Abertos: e.abertos, MTTR: fmtDuration(e.mttr), Indisponibilidade: fmtDuration(e.downtime) })),
                "zabbix-empresas",
              )
            }
          />

          <AggTable
            title={`Por unidade (${byUnidade.length})`}
            columns={["Unidade", "Empresa", "Cidade", "UF", "Alertas", "Críticos", "Abertos", "MTTR", "Indisponibilidade"]}
            rows={byUnidade.slice(0, limit).map((u) => [u.unidade, u.empresa, u.cidade, u.estado, u.count, u.criticos, u.abertos, fmtDuration(u.mttr), fmtDuration(u.downtime)])}
            onExport={() =>
              downloadCsv(
                byUnidade.map((u) => ({ Unidade: u.unidade, Empresa: u.empresa, Cidade: u.cidade, UF: u.estado, Alertas: u.count, Críticos: u.criticos, Abertos: u.abertos, MTTR: fmtDuration(u.mttr), Indisponibilidade: fmtDuration(u.downtime) })),
                "zabbix-unidades",
              )
            }
          />

          <AggTable
            title={`Por host group (${byGroup.length})`}
            columns={["Host Group", "Alertas", "Críticos", "Abertos", "MTTR", "Indisponibilidade"]}
            rows={byGroup.slice(0, limit).map((g) => [g.key, g.count, g.criticos, g.abertos, fmtDuration(g.mttr), fmtDuration(g.downtime)])}
            onExport={() =>
              downloadCsv(
                byGroup.map((g) => ({ "Host Group": g.key, Alertas: g.count, Críticos: g.criticos, Abertos: g.abertos, MTTR: fmtDuration(g.mttr), Indisponibilidade: fmtDuration(g.downtime) })),
                "zabbix-hostgroups",
              )
            }
          />

          <AggTable
            title={`Série temporal (${series.length} períodos)`}
            columns={["Período", "Alertas", ...SEVERITY_OPTIONS.map((s) => s.label)]}
            rows={series.map((s) => [s.bucket, s.total, ...SEVERITY_OPTIONS.map((o) => (s as any)[o.label] || 0)])}
            onExport={() =>
              downloadCsv(
                series.map((s) => ({
                  Período: s.bucket,
                  Alertas: s.total,
                  ...Object.fromEntries(SEVERITY_OPTIONS.map((o) => [o.label, (s as any)[o.label] || 0])),
                })),
                "zabbix-serie",
              )
            }
          />
        </TabsContent>

        {/* Detalhamento */}
        <TabsContent value="detalhe">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Detalhamento dos alertas ({total})</CardTitle>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-2" /> CSV
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[640px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Data/Hora</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead>Host Groups</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Severidade</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead>Ack</TableHead>
                      <TableHead>Duração</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Resolvido em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                          {loading ? "Carregando..." : "Nenhum alerta no período/filtros selecionados."}
                        </TableCell>
                      </TableRow>
                    )}
                    {events.map((e) => {
                      const u = resolveUnidade(e);
                      return (
                        <TableRow key={e.eventid}>
                          <TableCell className="whitespace-nowrap">{fmtDate(e.clock)}</TableCell>
                          <TableCell className="whitespace-nowrap">{u ? empresaNome(u.empresa_id) : "—"}</TableCell>
                          <TableCell className="whitespace-nowrap">{u?.nome_unidade || "—"}</TableCell>
                          <TableCell className="font-medium">{e.host_visible || e.hostname}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={(e.groups || []).join(", ")}>
                            {(e.groups || []).join(", ") || "—"}
                          </TableCell>
                          <TableCell className="max-w-md truncate" title={e.name}>{e.name}</TableCell>
                          <TableCell>
                            <Badge style={{ backgroundColor: severityColor(e.severity), color: "white" }}>
                              {severityLabel(e.severity)}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[180px] truncate" title={(e.tags || []).map((t) => `${t.tag}=${t.value}`).join(", ")}>
                            {(e.tags || []).length ? (e.tags || []).map((t) => (t.value ? `${t.tag}=${t.value}` : t.tag)).join(", ") : "—"}
                          </TableCell>
                          <TableCell>{e.acknowledged ? "Sim" : "Não"}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDuration(e.duration_sec)}</TableCell>
                          <TableCell>
                            {e.status === "RESOLVED" ? (
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Resolvido</Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">Aberto</Badge>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDate(e.resolved_at)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function AggTable({
  title,
  columns,
  rows,
  onExport,
}: {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  onExport: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={onExport}>
          <Download className="h-4 w-4 mr-2" /> CSV
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto max-h-[520px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>{columns.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">Sem dados.</TableCell>
                </TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={i}>
                  {r.map((c, j) => (
                    <TableCell key={j} className={j === 0 ? "font-medium max-w-md truncate" : "whitespace-nowrap"} title={String(c)}>
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: string }) {
  const toneClass =
    {
      primary: "bg-primary/10 text-primary",
      warning: "bg-amber-500/10 text-amber-600",
      success: "bg-emerald-500/10 text-emerald-600",
      muted: "bg-muted text-muted-foreground",
    }[tone] || "bg-muted text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${toneClass}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
