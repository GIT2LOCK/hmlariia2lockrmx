import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import {
  ArrowLeft, Eye, EyeOff, Monitor, RefreshCw, Server, Wifi,
  AlertTriangle, Wrench, Activity, ChevronDown, ChevronRight,
  HardDrive, Radio, LayoutDashboard, Move, RotateCcw,
  Gauge, CheckCircle2, MemoryStick,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──
interface ZabbixProblem {
  eventid: string;
  objectid: string;
  name: string;
  severity: string;
  clock: string;
  acknowledged: string;
  hosts: { hostid: string; host: string; name: string }[];
  triggerDescription: string;
  source?: string;
  category?: string;
  acknowledges?: { acknowledgeid: string; user: string; clock: string; message: string; action: string }[];
}

interface ZabbixMaintenance {
  maintenanceid: string;
  name: string;
  active_since: string;
  active_till: string;
  description: string;
  hosts: { hostid: string; host: string; name: string }[];
  source?: string;
}

interface ZabbixSystemInfo {
  serverRunning?: boolean;
  version?: string | null;
  frontendVersion?: string | null;
  hostEnabled?: number | null;
  hostDisabled?: number | null;
  templates?: number | null;
  itemsEnabled?: number | null;
  itemsDisabled?: number | null;
  itemsUnsupported?: number | null;
  proxiesOnline?: number | null;
  proxiesTotal?: number | null;
}

interface ZabbixServerMetrics {
  diskUsagePct: number | null;
  memoryAvailablePct?: number | null;
  valuesPerSecond?: number | null;
  cpuHosts: { hostid: string; hostname: string; name: string; cpuUtil: number; load1m: number | null; load5m: number | null; load15m: number | null; processes: number | null }[];
  memoryHosts?: { hostid: string; hostname: string; name: string; memoryAvailablePct: number; memoryUtilPct: number }[];
  proxies: { proxyid: string; name: string; lastaccess: number; delaySec: number }[];
  systemInfo?: ZabbixSystemInfo;
}

type Category = "equipamentos" | "links" | "outros";
type MonitorTileId = "equipamentos" | "links" | "cpu" | "resources" | "system" | "proxies" | "severity" | "outros";

interface MonitorLayoutItem {
  id: MonitorTileId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

type MonitorResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

interface MonitorCanvasInteraction {
  id: MonitorTileId;
  mode: "move" | "resize";
  handle?: MonitorResizeHandle;
  startX: number;
  startY: number;
  origin: MonitorLayoutItem;
  rect: DOMRect;
}

const isHighOrDisaster = (problem: ZabbixProblem) => {
  const severity = Number(problem.severity);
  if (severity === 4 || severity === 5) return true;
  // O Zabbix 2LOCK usa severidades menores para alguns alarmes operacionais importantes.
  if (
    (problem as any).source === "z2" &&
    ((problem as any).category === "links" || (problem as any).category === "equipamentos")
  ) return true;
  return false;
};


const SECOND_UPDATE_ALERT_SECONDS = 25 * 60;

const getAckCount = (problem: ZabbixProblem) => problem.acknowledges?.length || 0;

const needsSecondUpdateAlert = (problem: ZabbixProblem) => {
  const openedAt = Number(problem.clock);
  if (!Number.isFinite(openedAt)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - openedAt;
  return ageSeconds >= SECOND_UPDATE_ALERT_SECONDS && getAckCount(problem) < 2;
};

const normalizeProblemText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

function classifyProblem(p: ZabbixProblem): Category {
  if (p.category === "equipamentos" || p.category === "links" || p.category === "outros") return p.category;
  const name = normalizeProblemText(p.triggerDescription || p.name || "");
  if (/\b(?:switch|ap|access point|ctrl|controller)\b.*\boff-?line\b/.test(name)) return "equipamentos";
  if (/indisponibilidade.*(?:equipamento|ctrl|switch|\bap\b)/.test(name)) return "equipamentos";
  if (/indisponibilidade.*link/.test(name)) return "links";
  if (/indisponibilidade de ddns/.test(name)) return "links";
  if (/sem conex[ãa]o com a unidade/i.test(name)) return "links";
  return "outros";
}

function formatDuration(epochSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  let diff = now - epochSeconds;
  if (diff < 0) diff = 0;
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Palette ──
const C = {
  cyan: "#4bb8d8",
  blue: "#3d7ee8",
  textCyan: "#8fd8ec",
  white: "#e8eef8",
  dim: "#9aa9bf",
  muted: "#6d7a90",
  grid: "rgba(160,185,220,0.08)",
  border: "rgba(180,205,235,0.11)",
  borderHi: "rgba(75,184,216,0.42)",
  shell: "linear-gradient(145deg, rgba(12,24,43,0.72), rgba(8,18,34,0.82) 54%, rgba(7,10,24,0.78))",
  panel: "linear-gradient(145deg, rgba(14,28,50,0.66), rgba(8,18,34,0.80) 52%, rgba(10,12,28,0.76))",
  panelFlat: "rgba(10,24,44,0.54)",
  panelSoft: "linear-gradient(135deg, rgba(75,184,216,0.11), rgba(61,126,232,0.07))",
  pageBg: "linear-gradient(135deg, #050812 0%, #071424 48%, #070d1d 100%)",
  red: "#e46b78",
  danger: "#e46b78",
  orange: "#e99552",
  warning: "#e99552",
  yellow: "#f0c45d",
  green: "#51c59f",
  ok: "#51c59f",
};

const CATEGORY_COLORS: Record<Category, string> = {
  equipamentos: "#4da6ff",
  links: "#3dd9b4",
  outros: "#7c8ca1",
};

const CATEGORY_ICONS: Record<Category, React.ElementType> = {
  equipamentos: Server,
  links: Wifi,
  outros: AlertTriangle,
};

const CATEGORY_LABELS: Record<Category, string> = {
  equipamentos: "EQUIPAMENTOS",
  links: "LINKS",
  outros: "OUTROS",
};

const SEVERITY_BUCKETS = [
  { key: "5", label: "Disaster", color: "#b84e69" },
  { key: "4", label: "High", color: "#e46b78" },
  { key: "3", label: "Average", color: "#e99552" },
  { key: "2", label: "Warning", color: "#f0c45d" },
  { key: "1", label: "Information", color: "#6e92ff" },
  { key: "0", label: "Not classified", color: "#8da4b2" },
];

const REFRESH_INTERVAL = 30_000;
const MONITOR_LAYOUT_STORAGE_KEY = "ariia-zabbix-tv-canvas-v2";
const MONITOR_CANVAS_MIN_W = 16;
const MONITOR_CANVAS_MIN_H = 14;

const DEFAULT_MONITOR_LAYOUT: MonitorLayoutItem[] = [
  { id: "equipamentos", x: 0, y: 0, w: 43, h: 46, z: 1 },
  { id: "links", x: 0, y: 49, w: 43, h: 51, z: 2 },
  { id: "cpu", x: 44, y: 0, w: 28, h: 46, z: 3 },
  { id: "resources", x: 44, y: 49, w: 28, h: 51, z: 4 },
  { id: "system", x: 73, y: 0, w: 27, h: 31, z: 5 },
  { id: "proxies", x: 73, y: 34, w: 27, h: 27, z: 6 },
  { id: "severity", x: 73, y: 64, w: 27, h: 19, z: 7 },
  { id: "outros", x: 73, y: 86, w: 27, h: 14, z: 8 },
];

const MONITOR_TILE_LABELS: Record<MonitorTileId, string> = {
  equipamentos: "Equipamentos",
  links: "Links",
  cpu: "CPU Hosts",
  resources: "Recursos",
  system: "Sistema",
  proxies: "Proxies",
  severity: "Severidade",
  outros: "Outros",
};

const MONITOR_RESIZE_HANDLES: Array<{ id: MonitorResizeHandle; className: string }> = [
  { id: "n", className: "left-5 right-5 top-[-4px] h-2 cursor-ns-resize" },
  { id: "s", className: "left-5 right-5 bottom-[-4px] h-2 cursor-ns-resize" },
  { id: "e", className: "right-[-4px] top-5 bottom-5 w-2 cursor-ew-resize" },
  { id: "w", className: "left-[-4px] top-5 bottom-5 w-2 cursor-ew-resize" },
  { id: "nw", className: "left-[-5px] top-[-5px] h-3 w-3 cursor-nwse-resize rounded-full" },
  { id: "ne", className: "right-[-5px] top-[-5px] h-3 w-3 cursor-nesw-resize rounded-full" },
  { id: "sw", className: "left-[-5px] bottom-[-5px] h-3 w-3 cursor-nesw-resize rounded-full" },
  { id: "se", className: "right-[-5px] bottom-[-5px] h-3 w-3 cursor-nwse-resize rounded-full" },
];

const clampRange = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const roundLayoutValue = (value: number) => Math.round(value * 10) / 10;

const normalizeMonitorLayoutItem = (candidate: Partial<MonitorLayoutItem> | undefined, fallback: MonitorLayoutItem): MonitorLayoutItem => {
  const rawW = Number(candidate?.w);
  const rawH = Number(candidate?.h);
  const w = Number.isFinite(rawW) ? clampRange(rawW, MONITOR_CANVAS_MIN_W, 100) : fallback.w;
  const h = Number.isFinite(rawH) ? clampRange(rawH, MONITOR_CANVAS_MIN_H, 100) : fallback.h;
  const maxX = Math.max(0, 100 - w);
  const maxY = Math.max(0, 100 - h);
  const rawX = Number(candidate?.x);
  const rawY = Number(candidate?.y);
  const rawZ = Number(candidate?.z);

  return {
    ...fallback,
    x: roundLayoutValue(Number.isFinite(rawX) ? clampRange(rawX, 0, maxX) : fallback.x),
    y: roundLayoutValue(Number.isFinite(rawY) ? clampRange(rawY, 0, maxY) : fallback.y),
    w: roundLayoutValue(w),
    h: roundLayoutValue(h),
    z: Number.isFinite(rawZ) ? rawZ : fallback.z,
  };
};

// ── Sub-components ──

const StaticDot = ({ color }: { color: string }) => (
  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
);

const formatMetric = (value: number) => new Intl.NumberFormat("pt-BR").format(value || 0);
const formatDecimal = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("pt-BR", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "--";
const clampPct = (value: number) => Math.max(0, Math.min(100, value));

const GlowCard = ({ children, className = "", hi = false, contentClassName = "" }: {
  children: React.ReactNode; className?: string; hi?: boolean; contentClassName?: string;
}) => (
  <div
    className={`relative overflow-hidden rounded-lg border ${className}`}
    style={{
      background: C.panel,
      borderColor: hi ? C.borderHi : C.border,
      boxShadow: "0 8px 18px rgba(0,0,0,0.24), inset 0 1px 0 rgba(170,205,235,0.035)",
    }}
  >
    <div className="absolute inset-x-0 top-0 h-px"
      style={{ background: "linear-gradient(90deg, transparent, rgba(120,180,220,0.12), transparent)" }} />
    <div className={`relative z-10 ${contentClassName}`}>{children}</div>
  </div>
);

const MonitorSectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs 2xl:text-sm uppercase tracking-[0.12em]" style={{ color: C.dim, fontWeight: 300 }}>
    {children}
  </p>
);

const MonitorClock = ({ lastUpdate }: { lastUpdate: Date | null }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secAgo = lastUpdate
    ? Math.max(0, Math.floor((now.getTime() - lastUpdate.getTime()) / 1000))
    : 0;

  return (
    <div className="rounded-lg border px-4 py-2.5 text-right" style={{ borderColor: C.border, background: "rgba(10,24,44,0.54)", boxShadow: "inset 0 1px 0 rgba(170,205,235,0.04)" }}>
      <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: C.dim, fontWeight: 400 }}>
        {secAgo < 5 ? "Atualizado agora" : `Atualizado ha ${secAgo}s`}
      </p>
      <p className="font-mono text-2xl tabular-nums leading-tight 2xl:text-3xl" style={{ color: C.white }}>
        {now.toLocaleTimeString("pt-BR")}
      </p>
    </div>
  );
};

interface TvHostGroup {
  hostKey: string;
  hostName: string;
  problems: ZabbixProblem[];
  newestClock: number;
}

function groupByHostTv(items: ZabbixProblem[]): TvHostGroup[] {
  const map = new Map<string, TvHostGroup>();
  for (const p of items) {
    const hostName = p.hosts?.[0]?.name || p.hosts?.[0]?.host || "—";
    const hostCode = p.hosts?.[0]?.host || hostName;
    if (!map.has(hostCode)) {
      map.set(hostCode, { hostKey: hostCode, hostName, problems: [], newestClock: 0 });
    }
    const g = map.get(hostCode)!;
    g.problems.push(p);
    const clock = Number(p.clock);
    if (clock > g.newestClock) g.newestClock = clock;
  }
  const groups = Array.from(map.values());
  groups.sort((a, b) => b.newestClock - a.newestClock);
  for (const g of groups) g.problems.sort((a, b) => Number(b.clock) - Number(a.clock));
  return groups;
}

// ── Grouped Problem Rows ──
function TvGroupedRows({ groups, expandedHosts, onToggle, gridCols = "grid-cols-[20px_1fr_2.5fr_100px_60px]" }: {
  groups: TvHostGroup[];
  expandedHosts: Set<string>;
  onToggle: (key: string) => void;
  gridCols?: string;
}) {
  return (
    <>
      {groups.map((group) => {
        const isMulti = group.problems.length > 1;
        const isExpanded = expandedHosts.has(group.hostKey);
        const hasSecondUpdateAlert = group.problems.some(needsSecondUpdateAlert);

        return (
          <div key={group.hostKey}>
            <div
              className={`grid ${gridCols} gap-2 items-center py-2 px-3 ${isMulti ? "cursor-pointer" : ""}`}
              style={{
                borderBottom: `1px solid rgba(77,166,255,0.06)`,
                background: hasSecondUpdateAlert ? "rgba(255,77,77,0.12)" : "transparent",
                boxShadow: hasSecondUpdateAlert ? "inset 3px 0 0 rgba(255,77,77,0.9)" : "none",
              }}
              onClick={isMulti ? () => onToggle(group.hostKey) : undefined}
            >
              <span className="flex items-center justify-center">
                {isMulti && (isExpanded
                  ? <ChevronDown className="h-4 w-4" style={{ color: C.dim }} />
                  : <ChevronRight className="h-4 w-4" style={{ color: C.dim }} />
                )}
              </span>
              <span className="text-base truncate" style={{ color: C.textCyan, fontWeight: 600 }}>
                {group.hostName}
                {hasSecondUpdateAlert && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full align-middle" style={{ background: "rgba(255,77,77,0.22)", color: C.red, fontWeight: 800 }}>
                    2º UPDATE
                  </span>
                )}
                {isMulti && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(77,166,255,0.15)", color: C.cyan, fontWeight: 700 }}>
                    {group.problems.length}
                  </span>
                )}
              </span>
              <span className="text-base truncate text-muted-foreground font-semibold" style={{ color: C.dim }}>
                {isMulti
                  ? group.problems.map(p => p.triggerDescription || p.name).filter((v, i, a) => a.indexOf(v) === i).join(" · ")
                  : (group.problems[0]?.triggerDescription || group.problems[0]?.name)
                }
              </span>
              <span className="text-sm font-mono tabular-nums whitespace-nowrap" style={{ color: C.orange }}>
                {formatDuration(Number(group.problems[0]?.clock))}
              </span>
              {(() => {
                const totalAcks = isMulti
                  ? group.problems.reduce((sum, p) => sum + (p.acknowledges?.length || 0), 0)
                  : (group.problems[0]?.acknowledges?.length || 0);
                return (
                  <span className="text-sm text-center font-mono tabular-nums" style={{ color: totalAcks > 0 ? C.green : C.dim }}>
                    {totalAcks > 0 ? totalAcks : "—"}
                  </span>
                );
              })()}
            </div>

            {isMulti && isExpanded && group.problems.map((p) => (
              <div
                key={p.eventid}
                className={`grid ${gridCols} gap-2 items-center py-1.5 px-3`}
                style={{
                  background: needsSecondUpdateAlert(p) ? "rgba(255,77,77,0.12)" : "rgba(77,166,255,0.03)",
                  borderBottom: `1px solid rgba(77,166,255,0.04)`,
                }}
              >
                <span />
                <span className="text-sm pl-3" style={{ color: C.dim }}>↳ {p.hosts?.[0]?.name || "—"}</span>
                <span className="text-sm" style={{ color: C.dim }}>{p.triggerDescription || p.name}</span>
                <span className="text-sm font-mono tabular-nums whitespace-nowrap" style={{ color: C.orange }}>{formatDuration(Number(p.clock))}</span>
                <span className="text-xs text-center font-mono" style={{ color: (p.acknowledges?.length || 0) > 0 ? C.green : C.dim }}>
                  {(p.acknowledges?.length || 0) > 0 ? p.acknowledges!.length : "—"}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// ── Main Component ──
export default function ZabbixTvView() {
  const navigate = useNavigate();
  const { isTvView } = useUser();
  const [problems, setProblems] = useState<ZabbixProblem[]>([]);
  const [maintenances, setMaintenances] = useState<ZabbixMaintenance[]>([]);
  const [serverMetrics, setServerMetrics] = useState<ZabbixServerMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(true);
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
  const [showCtrl, setShowCtrl] = useState(true);
  const [editLayout, setEditLayout] = useState(false);
  const [activeTile, setActiveTile] = useState<MonitorTileId | null>(null);
  const [monitorLayout, setMonitorLayout] = useState<MonitorLayoutItem[]>(DEFAULT_MONITOR_LAYOUT);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<MonitorCanvasInteraction | null>(null);
  const knownEventIdsRef = useRef<Set<string> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playAlertSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
        if (!Ctx) return;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const playBeep = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + start + 0.02);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.05);
      };
      playBeep(880, 0, 0.18);
      playBeep(1175, 0.22, 0.22);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-sidebar-hidden", "true");
    return () => document.documentElement.removeAttribute("data-sidebar-hidden");
  }, []);

  useEffect(() => {
    try {
      const savedLayout = localStorage.getItem(MONITOR_LAYOUT_STORAGE_KEY);
      if (!savedLayout) return;
      const parsed = JSON.parse(savedLayout) as MonitorLayoutItem[];
      if (!Array.isArray(parsed)) return;

      setMonitorLayout(DEFAULT_MONITOR_LAYOUT.map((item) => {
        const savedItem = parsed.find((candidate) => candidate.id === item.id);
        return normalizeMonitorLayoutItem(savedItem, item);
      }));
    } catch {
      setMonitorLayout(DEFAULT_MONITOR_LAYOUT);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MONITOR_LAYOUT_STORAGE_KEY, JSON.stringify(monitorLayout));
    } catch {
      // Preferencia local do layout da TV; falhas de storage nao bloqueiam a tela.
    }
  }, [monitorLayout]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      event.preventDefault();

      const dx = ((event.clientX - interaction.startX) / interaction.rect.width) * 100;
      const dy = ((event.clientY - interaction.startY) / interaction.rect.height) * 100;
      const { origin } = interaction;
      let nextX = origin.x;
      let nextY = origin.y;
      let nextW = origin.w;
      let nextH = origin.h;

      if (interaction.mode === "move") {
        nextX = clampRange(origin.x + dx, 0, 100 - origin.w);
        nextY = clampRange(origin.y + dy, 0, 100 - origin.h);
      } else {
        const handle = interaction.handle || "se";

        if (handle.includes("e")) nextW = clampRange(origin.w + dx, MONITOR_CANVAS_MIN_W, 100 - origin.x);
        if (handle.includes("s")) nextH = clampRange(origin.h + dy, MONITOR_CANVAS_MIN_H, 100 - origin.y);
        if (handle.includes("w")) {
          const maxX = origin.x + origin.w - MONITOR_CANVAS_MIN_W;
          nextX = clampRange(origin.x + dx, 0, maxX);
          nextW = origin.w + origin.x - nextX;
        }
        if (handle.includes("n")) {
          const maxY = origin.y + origin.h - MONITOR_CANVAS_MIN_H;
          nextY = clampRange(origin.y + dy, 0, maxY);
          nextH = origin.h + origin.y - nextY;
        }
      }

      setMonitorLayout((layout) =>
        layout.map((item) =>
          item.id === interaction.id
            ? {
                ...item,
                x: roundLayoutValue(nextX),
                y: roundLayoutValue(nextY),
                w: roundLayoutValue(nextW),
                h: roundLayoutValue(nextH),
              }
            : item,
        ),
      );
    };

    const handlePointerUp = () => {
      interactionRef.current = null;
      setActiveTile(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [pRes, mRes, smRes] = await Promise.all([
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "problems" } }),
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "maintenance" } }),
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "server_metrics" } }),
      ]);
      if (pRes.error) throw new Error(pRes.error.message);
      if (mRes.error) throw new Error(mRes.error.message);
      setProblems(Array.isArray(pRes.data) ? pRes.data.filter(isHighOrDisaster) : []);
      setMaintenances(Array.isArray(mRes.data) ? mRes.data : []);
      if (smRes.data && !smRes.error) setServerMetrics(smRes.data);
      setLastUpdate(new Date());
    } catch (err: any) {
      setError(err.message || "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  // Keep showCtrl in a ref so the detection effect doesn't re-seed when toggled
  const showCtrlRef = useRef(showCtrl);
  useEffect(() => { showCtrlRef.current = showCtrl; }, [showCtrl]);

  // Detect new problems and trigger toast + sound
  useEffect(() => {
    if (knownEventIdsRef.current === null) {
      // First load: just seed the known set, no notifications
      knownEventIdsRef.current = new Set(problems.map(p => p.eventid));
      console.log("[TV Alerts] Seeded known events:", knownEventIdsRef.current.size);
      return;
    }
    const known = knownEventIdsRef.current;
    const newOnes = problems.filter(p => {
      const cat = classifyProblem(p);
      if (cat !== "equipamentos" && cat !== "links") return false;
      return !known.has(p.eventid);
    });
    console.log("[TV Alerts] Check: total=", problems.length, "known=", known.size, "new=", newOnes.length, "ctrlOn=", showCtrlRef.current);
    // Only notify when CTRL (alerts) is ON
    if (!showCtrlRef.current) {
      knownEventIdsRef.current = new Set(problems.map(p => p.eventid));
      return;
    }
    if (newOnes.length > 0) {
      playAlertSound();
      for (const p of newOnes) {
        const cat = classifyProblem(p);
        const hostName = p.hosts?.[0]?.name || p.hosts?.[0]?.host || "Host desconhecido";
        const isLink = cat === "links";
        toast.error(
          isLink ? "🔗 Novo problema de LINK" : "🖥️ Novo problema de EQUIPAMENTO",
          {
            description: `${hostName} — ${p.triggerDescription || p.name}`,
            duration: 3000,
            position: "bottom-right",
            style: {
              minWidth: "480px",
              padding: "20px 22px",
              fontSize: "16px",
              lineHeight: "1.4",
            },
            classNames: {
              title: "text-lg font-bold",
              description: "text-base",
            },
          }
        );
      }
    }
    // Update known set with current problems
    knownEventIdsRef.current = new Set(problems.map(p => p.eventid));
  }, [problems, playAlertSound]);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [fetchData]);

  const categorized = useMemo(() => {
    const map: Record<Category, ZabbixProblem[]> = { equipamentos: [], links: [], outros: [] };
    for (const p of problems) map[classifyProblem(p)].push(p);
    if (!showCtrl) {
      map.equipamentos = map.equipamentos.filter(p => {
        const desc = (p.triggerDescription || p.name || "").toLowerCase();
        return !desc.includes("ctrl");
      });
    }
    for (const cat of Object.keys(map) as Category[]) {
      map[cat].sort((a, b) => Number(b.clock) - Number(a.clock));
    }
    return map;
  }, [problems, showCtrl]);

  const totalMaintenances = maintenances.length;
  const catCounts = useMemo(() => ({
    equipamentos: categorized.equipamentos.length,
    links: categorized.links.length,
    outros: categorized.outros.length,
  }), [categorized]);
  const totalProblems = catCounts.equipamentos + catCounts.links + catCounts.outros;
  const systemInfo = serverMetrics?.systemInfo;
  const proxies = serverMetrics?.proxies || [];
  const proxyOffline = proxies.filter((proxy) => proxy.delaySec < 0 || proxy.delaySec > 120).length;
  const memoryAvailablePct = serverMetrics?.memoryAvailablePct ?? null;
  const memoryUsedPct = memoryAvailablePct === null ? null : clampPct(100 - memoryAvailablePct);
  const diskUsagePct = serverMetrics?.diskUsagePct ?? null;
  const valuesPerSecond = serverMetrics?.valuesPerSecond ?? null;
  const topCpu = serverMetrics?.cpuHosts?.[0]?.cpuUtil ?? null;
  const severityRows = SEVERITY_BUCKETS.map((bucket) => ({
    ...bucket,
    value: problems.filter((problem) => String(problem.severity) === bucket.key).length,
  }));
  const maxSeverity = Math.max(1, ...severityRows.map((item) => item.value));

  const kpis = [
    { id: "total", label: "Problemas", value: totalProblems, icon: Activity, color: C.red, progress: totalProblems > 0 ? 100 : 0 },
    { id: "links", label: "Links", value: catCounts.links, icon: Wifi, color: C.green, progress: totalProblems > 0 ? (catCounts.links / totalProblems) * 100 : 0 },
    { id: "ctrl", label: "CTRL/AP", value: catCounts.equipamentos, icon: Server, color: C.blue, progress: totalProblems > 0 ? (catCounts.equipamentos / totalProblems) * 100 : 0 },
    { id: "proxy", label: "Proxies offline", value: proxyOffline, icon: Radio, color: proxyOffline > 0 ? C.red : C.green, progress: proxies.length > 0 ? (proxyOffline / proxies.length) * 100 : 0 },
    { id: "values", label: "Valores/s", value: valuesPerSecond, icon: Gauge, color: C.cyan, progress: valuesPerSecond ? Math.min(100, valuesPerSecond) : 0 },
    { id: "manut", label: "Manutencoes", value: totalMaintenances, icon: Wrench, color: C.yellow, progress: totalMaintenances > 0 ? 100 : 0 },
  ];

  const toggleSidebar = () => {
    setSidebarHidden(prev => {
      const next = !prev;
      if (next) document.documentElement.setAttribute("data-sidebar-hidden", "true");
      else document.documentElement.removeAttribute("data-sidebar-hidden");
      return next;
    });
  };

  const resetMonitorLayout = () => {
    setMonitorLayout(DEFAULT_MONITOR_LAYOUT);
    setActiveTile(null);
    interactionRef.current = null;
  };

  const beginCanvasInteraction = (
    event: React.PointerEvent<HTMLElement>,
    item: MonitorLayoutItem,
    mode: "move" | "resize",
    handle?: MonitorResizeHandle,
  ) => {
    if (!editLayout) return;

    const canvasRect = canvasRef.current?.getBoundingClientRect();
    if (!canvasRect) return;

    event.preventDefault();
    event.stopPropagation();

    const topZ = Math.max(...monitorLayout.map((candidate) => candidate.z || 0), 0);
    interactionRef.current = {
      id: item.id,
      mode,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      origin: item,
      rect: canvasRect,
    };
    setActiveTile(item.id);
    setMonitorLayout((layout) =>
      layout.map((candidate) =>
        candidate.id === item.id ? { ...candidate, z: topZ + 1 } : candidate,
      ),
    );
  };

  const renderResizeHandles = (item: MonitorLayoutItem) => {
    if (!editLayout) return null;

    return (
      <>
        {MONITOR_RESIZE_HANDLES.map((handle) => (
          <span
            key={handle.id}
            data-monitor-no-drag
            onPointerDown={(event) => beginCanvasInteraction(event, item, "resize", handle.id)}
            className={`absolute z-30 ${handle.className}`}
            style={{ background: activeTile === item.id ? "rgba(75,184,216,0.70)" : "rgba(160,185,220,0.28)" }}
          />
        ))}
      </>
    );
  };

  const renderTileControl = (item: MonitorLayoutItem) => {
    if (!editLayout) return null;

    return (
      <div
        data-monitor-no-drag
        onPointerDown={(event) => beginCanvasInteraction(event, item, "move")}
        className="absolute left-2 top-2 z-20 flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
        style={{ borderColor: C.border, background: "rgba(5,12,24,0.84)", color: C.dim, cursor: "move" }}
      >
        <Move className="h-3.5 w-3.5" />
        <span className="text-[10px] uppercase tracking-[0.10em]" style={{ fontWeight: 300 }}>
          {MONITOR_TILE_LABELS[item.id]}
        </span>
      </div>
    );
  };

  const renderCanvasShell = (item: MonitorLayoutItem, children: React.ReactNode) => (
    <div
      key={item.id}
      className={`absolute min-h-0 rounded-lg ${editLayout ? "select-none" : ""} ${activeTile === item.id ? "ring-1" : ""}`}
      style={{
        left: `${item.x}%`,
        top: `${item.y}%`,
        width: `${item.w}%`,
        height: `${item.h}%`,
        zIndex: item.z,
        touchAction: "none",
        ...(activeTile === item.id ? { ["--tw-ring-color" as string]: "rgba(75,184,216,0.58)" } : {}),
      }}
      onPointerDown={(event) => {
        if (!editLayout) return;
        const target = event.target as HTMLElement;
        if (target.closest("[data-monitor-no-drag]")) return;
        beginCanvasInteraction(event, item, "move");
      }}
    >
      <GlowCard className="h-full min-h-0 flex flex-col" contentClassName={`h-full flex flex-col ${editLayout ? "pt-12" : ""}`}>
        {renderTileControl(item)}
        {renderResizeHandles(item)}
        {children}
      </GlowCard>
    </div>
  );

  const renderProblemPanel = (item: MonitorLayoutItem, cat: Category, gridCols: string) => {
    const items = categorized[cat];
    const Icon = CATEGORY_ICONS[cat];
    const color = CATEGORY_COLORS[cat];

    return renderCanvasShell(item, (
      <>
        <div className="p-4 pb-2 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: `1px solid ${C.grid}` }}>
          <Icon className="h-6 w-6" style={{ color }} />
          <span className="text-sm uppercase tracking-[0.15em]" style={{ color, fontWeight: 700 }}>
            {CATEGORY_LABELS[cat]}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
          <div className={`grid ${gridCols} gap-2 px-3 py-2 sticky top-0 z-10`} style={{ background: "rgba(6,12,30,0.95)", borderBottom: `1px solid ${C.grid}` }}>
            <span />
            <span className="text-xs uppercase tracking-wider" style={{ color: C.dim, fontWeight: 700 }}>Host</span>
            <span className="text-xs uppercase tracking-wider" style={{ color: C.dim, fontWeight: 700 }}>Problema</span>
            <span className="text-xs uppercase tracking-wider" style={{ color: C.dim, fontWeight: 700 }}>Duração</span>
            <span className="text-xs uppercase tracking-wider text-center" style={{ color: C.dim, fontWeight: 700 }}>Updates</span>
          </div>
          {items.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-base" style={{ color: C.green }}>Sem problemas</span>
            </div>
          ) : (
            <TvGroupedRows groups={groupByHostTv(items)} expandedHosts={expandedHosts}
              gridCols={gridCols}
              onToggle={(key) => setExpandedHosts(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })} />
          )}
        </div>
      </>
    ));
  };

  const renderMonitorTileV2 = (item: MonitorLayoutItem) => {
    if (item.id === "equipamentos") {
      return renderProblemPanel(item, "equipamentos", "grid-cols-[20px_1fr_2.3fr_88px_54px]");
    }

    if (item.id === "links") {
      return renderProblemPanel(item, "links", "grid-cols-[20px_1.25fr_2.2fr_88px_54px]");
    }

    if (item.id === "cpu") {
      return renderCanvasShell(item, (
        <div className="flex h-full min-h-0 flex-col p-4">
          <div className="mb-3 flex items-center justify-between gap-4 pr-20">
            <MonitorSectionTitle>Top hosts por CPU</MonitorSectionTitle>
            <span className="text-sm tabular-nums" style={{ color: C.muted, fontWeight: 300 }}>{formatDecimal(topCpu)}%</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar space-y-2">
            {(serverMetrics?.cpuHosts || []).map((host) => {
              const pct = clampPct(host.cpuUtil);
              const color = pct > 80 ? C.red : pct > 50 ? C.orange : C.green;
              return (
                <div key={host.hostid} className="grid items-center gap-3" style={{ gridTemplateColumns: "minmax(0,1fr) 58px" }}>
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-sm 2xl:text-base" style={{ color: C.white, fontWeight: 300 }}>{host.name}</span>
                      <span className="text-xs tabular-nums" style={{ color: C.dim, fontWeight: 300 }}>P {host.processes ?? "--"}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(160,185,220,0.10)" }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <div className="mt-1 flex gap-3 text-[11px] tabular-nums" style={{ color: C.muted, fontWeight: 300 }}>
                      <span>1m {host.load1m?.toFixed(2) ?? "--"}</span>
                      <span>5m {host.load5m?.toFixed(2) ?? "--"}</span>
                      <span>15m {host.load15m?.toFixed(2) ?? "--"}</span>
                    </div>
                  </div>
                  <span className="text-right text-lg 2xl:text-xl tabular-nums" style={{ color, fontWeight: 300 }}>{host.cpuUtil.toFixed(1)}%</span>
                </div>
              );
            })}
            {(!serverMetrics || serverMetrics.cpuHosts.length === 0) && (
              <div className="flex h-36 items-center justify-center text-base" style={{ color: C.muted }}>Sem dados de CPU</div>
            )}
          </div>
        </div>
      ));
    }

    if (item.id === "resources") {
      const resourceCards = [
        { label: "Disco usado", value: diskUsagePct, suffix: "%", icon: HardDrive, color: (diskUsagePct ?? 0) > 80 ? C.red : C.cyan },
        { label: "Memoria usada", value: memoryUsedPct, suffix: "%", icon: MemoryStick, color: (memoryUsedPct ?? 0) > 80 ? C.red : C.green },
        { label: "Valores por segundo", value: valuesPerSecond, suffix: "", icon: Gauge, color: C.cyan },
      ];

      return renderCanvasShell(item, (
        <div className="flex h-full min-h-0 flex-col p-4">
          <div className="mb-3 flex items-center justify-between gap-4 pr-20">
            <MonitorSectionTitle>Recursos do Zabbix</MonitorSectionTitle>
            <span className="text-sm" style={{ color: C.muted, fontWeight: 300 }}>CPU / memoria / disco</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {resourceCards.map((card) => (
              <div key={card.label} className="rounded-lg border p-3" style={{ borderColor: C.grid, background: "rgba(10,24,44,0.42)" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-[0.10em]" style={{ color: C.dim, fontWeight: 300 }}>{card.label}</span>
                  <card.icon className="h-4 w-4" style={{ color: card.color }} />
                </div>
                <div className="mt-2 text-2xl 2xl:text-3xl tabular-nums" style={{ color: C.white, fontWeight: 300 }}>
                  {formatDecimal(card.value, card.suffix ? 1 : 2)}{card.value === null || card.value === undefined ? "" : card.suffix}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid flex-1 grid-cols-2 gap-2 overflow-hidden">
            {(serverMetrics?.memoryHosts || []).slice(0, 6).map((host) => (
              <div key={host.hostid} className="flex items-center gap-3 rounded-lg border px-3 py-2" style={{ borderColor: C.grid, background: "rgba(8,24,46,0.48)" }}>
                <div className="flex h-12 w-14 flex-shrink-0 items-center justify-center text-center" style={{ clipPath: "polygon(25% 6%, 75% 6%, 100% 50%, 75% 94%, 25% 94%, 0 50%)", background: "rgba(75,184,216,0.16)", color: C.white }}>
                  <span className="text-sm tabular-nums" style={{ fontWeight: 300 }}>{host.memoryUtilPct.toFixed(0)}%</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm" style={{ color: C.white, fontWeight: 300 }}>{host.name}</p>
                  <p className="text-xs" style={{ color: C.muted, fontWeight: 300 }}>Memoria utilizada</p>
                </div>
              </div>
            ))}
            {(!serverMetrics?.memoryHosts || serverMetrics.memoryHosts.length === 0) && (
              <div className="col-span-2 flex items-center justify-center text-base" style={{ color: C.muted }}>Sem dados de memoria</div>
            )}
          </div>
        </div>
      ));
    }

    if (item.id === "system") {
      const rows = [
        { label: "Zabbix server is running", value: systemInfo?.serverRunning ? "Yes" : "No", color: systemInfo?.serverRunning ? C.green : C.red },
        { label: "Zabbix server version", value: systemInfo?.version || "--", color: C.white },
        { label: "Zabbix frontend version", value: systemInfo?.frontendVersion || "--", color: C.white },
        { label: "Hosts enabled/disabled", value: `${formatMetric(systemInfo?.hostEnabled ?? 0)} / ${formatMetric(systemInfo?.hostDisabled ?? 0)}`, color: C.white },
        { label: "Templates", value: formatMetric(systemInfo?.templates ?? 0), color: C.white },
        { label: "Items enabled/disabled/not supported", value: `${formatMetric(systemInfo?.itemsEnabled ?? 0)} / ${formatMetric(systemInfo?.itemsDisabled ?? 0)} / ${formatMetric(systemInfo?.itemsUnsupported ?? 0)}`, color: C.white },
      ];
      return renderCanvasShell(item, (
        <div className="flex h-full min-h-0 flex-col p-4">
          <div className="mb-3 flex items-center justify-between gap-4 pr-20">
            <MonitorSectionTitle>System information</MonitorSectionTitle>
            <CheckCircle2 className="h-4 w-4" style={{ color: systemInfo?.serverRunning ? C.green : C.red }} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            {rows.map((row) => (
              <div key={row.label} className="grid gap-3 py-1.5" style={{ gridTemplateColumns: "minmax(0,1fr) auto", borderBottom: `1px solid ${C.grid}` }}>
                <span className="truncate text-xs 2xl:text-sm" style={{ color: C.dim, fontWeight: 300 }}>{row.label}</span>
                <span className="text-right text-xs 2xl:text-sm tabular-nums" style={{ color: row.color, fontWeight: 300 }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      ));
    }

    if (item.id === "proxies") {
      return renderCanvasShell(item, (
        <div className="flex h-full min-h-0 flex-col p-4">
          <div className="mb-3 flex items-center justify-between gap-4 pr-20">
            <MonitorSectionTitle>Proxies</MonitorSectionTitle>
            <span className="text-sm tabular-nums" style={{ color: C.muted, fontWeight: 300 }}>
              {systemInfo?.proxiesOnline ?? 0}/{systemInfo?.proxiesTotal ?? proxies.length} online
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar space-y-2">
            {proxies.map((proxy) => {
              const color = proxy.delaySec >= 0 && proxy.delaySec <= 30 ? C.green : proxy.delaySec <= 120 && proxy.delaySec >= 0 ? C.orange : C.red;
              return (
                <div key={proxy.proxyid} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2" style={{ borderColor: C.grid, background: "rgba(8,24,46,0.50)" }}>
                  <span className="flex min-w-0 items-center gap-2 text-sm 2xl:text-base" style={{ color: C.white, fontWeight: 300 }}>
                    <StaticDot color={color} />
                    <span className="truncate">{proxy.name}</span>
                  </span>
                  <span className="text-xl 2xl:text-2xl tabular-nums" style={{ color, fontWeight: 300 }}>{proxy.delaySec >= 0 ? `${proxy.delaySec}s` : "--"}</span>
                </div>
              );
            })}
            {proxies.length === 0 && (
              <div className="flex h-24 items-center justify-center text-base" style={{ color: C.muted }}>Sem dados de proxy</div>
            )}
          </div>
        </div>
      ));
    }

    if (item.id === "severity") {
      return renderCanvasShell(item, (
        <div className="flex h-full min-h-0 flex-col p-4">
          <div className="mb-3 flex items-center justify-between gap-4 pr-20">
            <MonitorSectionTitle>Problems by severity</MonitorSectionTitle>
            <span className="text-sm tabular-nums" style={{ color: C.muted, fontWeight: 300 }}>{formatMetric(totalProblems)}</span>
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2">
            {severityRows.map((row) => (
              <div key={row.key} className="rounded-lg border p-2" style={{ borderColor: `${row.color}22`, background: `${row.color}16` }}>
                <div className="text-xl 2xl:text-2xl tabular-nums" style={{ color: C.white, fontWeight: 300 }}>{formatMetric(row.value)}</div>
                <div className="mt-1 truncate text-[10px] uppercase tracking-[0.08em]" style={{ color: row.color, fontWeight: 300 }}>{row.label}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(160,185,220,0.12)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(row.value / maxSeverity) * 100}%`, background: row.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ));
    }

    return renderCanvasShell(item, (
      <div className="flex h-full min-h-0 items-center gap-3 overflow-hidden p-4">
        <AlertTriangle className="h-5 w-5 flex-shrink-0" style={{ color: C.dim }} />
        <span className="text-xs uppercase tracking-[0.12em] flex-shrink-0" style={{ color: C.dim, fontWeight: 300 }}>
          Outros: {categorized.outros.length}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 overflow-hidden">
          {categorized.outros.slice(0, 5).map((problem) => (
            <span key={problem.eventid} className="truncate text-sm" style={{ color: C.white, fontWeight: 300 }}>
              {problem.hosts?.[0]?.name || "--"}: <span style={{ color: C.dim }}>{problem.triggerDescription || problem.name}</span>
            </span>
          ))}
          {categorized.outros.length === 0 && <span className="text-sm" style={{ color: C.green, fontWeight: 300 }}>Sem problemas adicionais</span>}
        </div>
      </div>
    ));
  };

  return (
    <div className="-m-4 md:-m-6 min-h-[calc(100vh-56px)] lg:min-h-screen overflow-hidden relative" style={{ background: C.pageBg, fontFamily: "'Roboto', 'Segoe UI', sans-serif" }}>
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(75,184,216,0.22), transparent)" }} />
      <div className="relative mx-auto flex h-[calc(100vh-56px)] w-full max-w-[1920px] flex-col p-3 lg:h-screen lg:p-5">
        <div
          className="relative flex min-h-0 flex-1 flex-col rounded-lg border p-3 lg:p-4"
          style={{
            background: C.shell,
            borderColor: "rgba(180,205,235,0.10)",
            boxShadow: "0 12px 28px rgba(0,0,0,0.28), inset 0 1px 0 rgba(170,205,235,0.035)",
          }}
        >
          <header className="flex items-center justify-between gap-5 pb-3 flex-shrink-0">
            <div className="flex min-w-0 items-center gap-3">
              {!isTvView && (
                <button onClick={() => navigate("/dashboard/zabbix")} className="flex h-11 w-11 items-center justify-center rounded-lg border" style={{ borderColor: C.border, color: C.dim, background: C.panelFlat }}>
                  <ArrowLeft className="h-5 w-5" />
                </button>
              )}
              {!isTvView && (
                <button onClick={toggleSidebar} className="flex h-11 w-11 items-center justify-center rounded-lg border" title={sidebarHidden ? "Mostrar menu" : "Ocultar menu"} style={{ borderColor: C.border, color: C.dim, background: C.panelFlat }}>
                  {sidebarHidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                </button>
              )}
              {isTvView && (
                <button onClick={() => navigate("/dashboard")} className="flex h-11 items-center gap-2 rounded-lg border px-4 text-sm" style={{ borderColor: C.border, color: C.dim, background: C.panelFlat, fontWeight: 300 }}>
                  <Monitor className="h-4 w-4" />
                  Chamados
                </button>
              )}
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border" style={{ background: C.panelSoft, color: C.white, borderColor: C.border, boxShadow: "inset 0 1px 0 rgba(170,205,235,0.04)" }}>
                <Activity className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-2xl leading-none 2xl:text-3xl" style={{ color: C.white, fontWeight: 300 }}>
                  Ariia Monitoramento TV
                </h1>
                <div className="mt-1 flex items-center gap-2 text-sm 2xl:text-base" style={{ color: C.dim, fontWeight: 300 }}>
                  <StaticDot color={totalProblems > 0 ? C.red : C.green} />
                  <span>{totalProblems > 0 ? `${formatMetric(totalProblems)} problemas ativos` : "Sem problemas ativos"}</span>
                  <span style={{ color: C.muted }}>Zabbix 2LOCK</span>
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setShowCtrl((prev) => !prev)}
                className="flex h-12 items-center gap-2 rounded-lg border px-4 text-sm"
                style={{ borderColor: showCtrl ? C.borderHi : C.border, color: C.white, background: showCtrl ? "rgba(75,184,216,0.14)" : "rgba(8,24,48,0.58)", fontWeight: 300 }}
              >
                <Server className="h-4 w-4" />
                CTRL
                <span className="text-xs" style={{ color: showCtrl ? C.green : C.muted }}>{showCtrl ? "ON" : "OFF"}</span>
              </button>
              <button
                type="button"
                onClick={() => setEditLayout((editing) => !editing)}
                className="flex h-12 items-center gap-2 rounded-lg border px-4 text-sm"
                style={{ borderColor: editLayout ? C.borderHi : C.border, color: C.white, background: editLayout ? "rgba(75,184,216,0.14)" : "rgba(8,24,48,0.58)", fontWeight: 300 }}
              >
                <LayoutDashboard className="h-4 w-4" />
                {editLayout ? "Concluir" : "Editar layout"}
              </button>
              {editLayout && (
                <button type="button" onClick={resetMonitorLayout} className="flex h-12 w-12 items-center justify-center rounded-lg border" title="Restaurar layout" style={{ borderColor: C.border, color: C.dim, background: "rgba(8,24,48,0.58)" }}>
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              {error && (
                <span className="max-w-[420px] truncate rounded-lg border px-3 py-2 text-xs" style={{ color: C.red, borderColor: "rgba(228,107,120,0.42)", background: "rgba(228,107,120,0.10)" }}>
                  Erro: {error}
                </span>
              )}
              <MonitorClock lastUpdate={lastUpdate} />
              <button onClick={fetchData} disabled={loading} className="flex h-12 w-12 items-center justify-center rounded-lg border" style={{ borderColor: C.border, color: C.dim, background: "rgba(8,24,48,0.58)" }}>
                <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6 flex-shrink-0">
            {kpis.map((k) => (
              <GlowCard key={k.id} className="min-h-[104px] p-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="truncate text-[11px] uppercase tracking-[0.12em] 2xl:text-xs" style={{ color: C.dim, fontWeight: 300 }}>
                    {k.label}
                  </span>
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: `${k.color}22`, background: `${k.color}12` }}>
                    <k.icon className="h-4 w-4" style={{ color: k.color }} />
                  </span>
                </div>
                <div className="mt-1 text-3xl leading-none tabular-nums 2xl:text-[40px]" style={{ color: C.white, fontWeight: 300 }}>
                  {k.id === "values" ? formatDecimal(k.value as number | null, 2) : formatMetric(Number(k.value || 0))}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "rgba(160,185,220,0.10)" }}>
                  <div className="h-full rounded-full" style={{ width: `${clampPct(k.progress || 0)}%`, background: k.color }} />
                </div>
              </GlowCard>
            ))}
          </div>

          <main
            ref={canvasRef}
            className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-lg border"
            style={{
              borderColor: editLayout ? "rgba(75,184,216,0.26)" : "transparent",
              background: editLayout ? "rgba(3,10,22,0.20)" : "transparent",
            }}
          >
            {monitorLayout.map(renderMonitorTileV2)}
          </main>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(160,185,220,0.18); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(160,185,220,0.34); }
      `}</style>
    </div>
  );
}
