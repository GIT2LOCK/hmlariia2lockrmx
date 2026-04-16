import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import {
  ArrowLeft, Eye, EyeOff, Monitor, RefreshCw, Server, Wifi,
  AlertTriangle, Wrench, Activity, ChevronDown, ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

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

type Category = "equipamentos" | "links" | "outros";

function classifyProblem(p: ZabbixProblem): Category {
  if (p.category === "equipamentos" || p.category === "links" || p.category === "outros") return p.category;
  const name = (p.triggerDescription || p.name || "").toLowerCase();
  if (/indisponibilidade.*equipamento/i.test(name)) return "equipamentos";
  if (/indisponibilidade.*link/i.test(name)) return "links";
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
  cyan: "#4da6ff",
  textCyan: "#7ec8e3",
  white: "#e8f0ff",
  dim: "#5a7a9a",
  grid: "rgba(77,166,255,0.10)",
  border: "rgba(77,166,255,0.22)",
  borderHi: "rgba(77,166,255,0.50)",
  glowSm: "0 0 18px rgba(77,166,255,0.12), inset 0 1px 0 rgba(77,166,255,0.10)",
  glowLg: "0 0 40px rgba(77,166,255,0.22), inset 0 1px 0 rgba(77,166,255,0.18), 0 0 100px rgba(77,166,255,0.06)",
  cardBg: "linear-gradient(145deg, rgba(12,22,50,0.88) 0%, rgba(6,12,30,0.94) 100%)",
  pageBg: "radial-gradient(ellipse at 50% -10%, rgba(18,40,90,0.45) 0%, rgba(4,6,16,1) 65%)",
  red: "#ff4d4d",
  orange: "#ff9f43",
  yellow: "#ffd93d",
  green: "#3dd9b4",
  blue: "#4da6ff",
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

const REFRESH_INTERVAL = 30_000;

// ── Sub-components ──

const AnimNum = ({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) => {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current, to = value;
    if (from === to) { setDisplay(to); return; }
    const dur = 900, t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min((t - t0) / dur, 1);
      setDisplay(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    prev.current = to;
  }, [value]);
  return <span className={className} style={style}>{display}</span>;
};

const Particles = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    let id: number;
    const pts: { x: number; y: number; vx: number; vy: number; r: number; a: number }[] = [];
    const resize = () => { c.width = window.innerWidth; c.height = window.innerHeight; };
    resize(); window.addEventListener("resize", resize);
    for (let i = 0; i < 90; i++) pts.push({
      x: Math.random() * c.width, y: Math.random() * c.height,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.8 + 0.4, a: Math.random() * 0.4 + 0.08,
    });
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = c.width; if (p.x > c.width) p.x = 0;
        if (p.y < 0) p.y = c.height; if (p.y > c.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(77,166,255,${p.a})`; ctx.fill();
      });
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < 130) { ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = `rgba(77,166,255,${0.055 * (1 - d / 130)})`; ctx.stroke(); }
      }
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(id); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
};

const PulseDot = ({ color }: { color: string }) => (
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: color }} />
    <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
  </span>
);

const GlowCard = ({ children, className = "", hi = false, delay = 0, contentClassName = "" }: {
  children: React.ReactNode; className?: string; hi?: boolean; delay?: number; contentClassName?: string;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 24, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    className={`relative rounded-2xl overflow-hidden ${className}`}
    style={{
      background: C.cardBg,
      backdropFilter: "blur(16px)",
      border: `1px solid ${hi ? C.borderHi : C.border}`,
      boxShadow: hi ? C.glowLg : C.glowSm,
    }}
  >
    <div className="absolute top-0 left-[8%] right-[8%] h-[1px]"
      style={{ background: `linear-gradient(90deg, transparent, rgba(77,166,255,${hi ? 0.9 : 0.45}), transparent)` }} />
    <div className={`relative z-10 ${contentClassName}`}>{children}</div>
  </motion.div>
);

const MiniDonut = ({ pct, color, size = 52 }: { pct: number; color: string; size?: number }) => {
  const r = size * 0.34, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(77,166,255,0.08)" strokeWidth="5" />
      <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={circ / 4}
        initial={{ strokeDasharray: `0 ${circ}` }}
        animate={{ strokeDasharray: `${dash} ${circ - dash}` }}
        transition={{ duration: 1.2, delay: 0.4, ease: "easeOut" }}
        style={{ filter: `drop-shadow(0 0 6px ${color}70)` }} />
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.2} fontWeight="400">{Math.round(pct)}%</text>
    </svg>
  );
};

const MultiDonut = ({ segments, size = 60 }: { segments: { pct: number; color: string }[]; size?: number }) => {
  const r = size * 0.34, circ = 2 * Math.PI * r;
  let offset = circ / 4; // start at top
  const total = segments.reduce((s, seg) => s + seg.pct, 0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(77,166,255,0.08)" strokeWidth="5" />
      {segments.filter(s => s.pct > 0).map((seg, i) => {
        const dash = (seg.pct / 100) * circ;
        const gap = circ - dash;
        const currentOffset = offset;
        offset -= dash;
        return (
          <motion.circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={seg.color} strokeWidth="5"
            strokeDasharray={`${dash} ${gap}`} strokeDashoffset={currentOffset}
            initial={{ strokeDasharray: `0 ${circ}` }}
            animate={{ strokeDasharray: `${dash} ${gap}` }}
            transition={{ duration: 1.2, delay: 0.4 + i * 0.15, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 6px ${seg.color}70)` }} />
        );
      })}
      <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central"
        fill={C.white} fontSize={size * 0.18} fontWeight="400">{Math.round(total)}%</text>
    </svg>
  );
};

// ── Host grouping for TV ──
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
  // Sort groups by newest problem first
  const groups = Array.from(map.values());
  groups.sort((a, b) => b.newestClock - a.newestClock);
  // Sort problems within each group newest first
  for (const g of groups) g.problems.sort((a, b) => Number(b.clock) - Number(a.clock));
  return groups;
}

// ── Grouped Problem Rows ──
function TvGroupedRows({ groups, expandedHosts, onToggle }: {
  groups: TvHostGroup[];
  expandedHosts: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <>
      {groups.map((group, gi) => {
        const isMulti = group.problems.length > 1;
        const isExpanded = expandedHosts.has(group.hostKey);
        const source = group.problems[0]?.source === "z1" ? "BRAVA" : "2LOCK";

        return (
          <div key={group.hostKey}>
            {/* Main row */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.02 * gi, ease: "easeOut" }}
              className={`grid grid-cols-[24px_1.2fr_2fr_140px_70px_90px] gap-2 items-center py-2 px-3 ${isMulti ? "cursor-pointer" : ""}`}
              style={{ borderBottom: `1px solid rgba(77,166,255,0.06)` }}
              onClick={isMulti ? () => onToggle(group.hostKey) : undefined}
            >
              <span className="flex items-center justify-center">
                {isMulti && (isExpanded
                  ? <ChevronDown className="h-4 w-4" style={{ color: C.dim }} />
                  : <ChevronRight className="h-4 w-4" style={{ color: C.dim }} />
                )}
              </span>
              <span className="text-sm truncate" style={{ color: C.textCyan, fontWeight: 600 }}>
                {group.hostName}
                {isMulti && (
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full" style={{ background: "rgba(77,166,255,0.15)", color: C.cyan, fontWeight: 700 }}>
                    {group.problems.length}
                  </span>
                )}
              </span>
              <span className="text-sm truncate" style={{ color: C.dim }}>
                {isMulti
                  ? group.problems.map(p => p.triggerDescription || p.name).filter((v, i, a) => a.indexOf(v) === i).join(" · ")
                  : (group.problems[0]?.triggerDescription || group.problems[0]?.name)
                }
              </span>
              <span className="text-sm font-mono tabular-nums" style={{ color: C.orange }}>
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
              <span className="text-xs text-right" style={{ color: C.dim }}>{source}</span>
            </motion.div>

            {/* Expanded sub-rows */}
            {isMulti && isExpanded && group.problems.map((p) => (
              <div
                key={p.eventid}
                className="grid grid-cols-[24px_1.2fr_2fr_140px_70px_90px] gap-2 items-center py-1.5 px-3"
                style={{ background: "rgba(77,166,255,0.03)", borderBottom: `1px solid rgba(77,166,255,0.04)` }}
              >
                <span />
                <span className="text-xs pl-3" style={{ color: C.dim }}>↳ {p.hosts?.[0]?.name || "—"}</span>
                <span className="text-xs" style={{ color: C.dim }}>{p.triggerDescription || p.name}</span>
                <span className="text-xs font-mono tabular-nums" style={{ color: C.orange }}>{formatDuration(Number(p.clock))}</span>
                <span className="text-xs text-center font-mono" style={{ color: (p.acknowledges?.length || 0) > 0 ? C.green : C.dim }}>
                  {(p.acknowledges?.length || 0) > 0 ? p.acknowledges!.length : "—"}
                </span>
                <span className="text-[11px] text-right" style={{ color: C.dim }}>{p.source === "z1" ? "BRAVA" : "2LOCK"}</span>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [secAgo, setSecAgo] = useState(0);
  const [sidebarHidden, setSidebarHidden] = useState(true);
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
  const [showCtrl, setShowCtrl] = useState(true);

  // Hide sidebar
  useEffect(() => {
    document.documentElement.setAttribute("data-sidebar-hidden", "true");
    return () => document.documentElement.removeAttribute("data-sidebar-hidden");
  }, []);

  // Clock
  useEffect(() => {
    const t = setInterval(() => { setNow(new Date()); setSecAgo(p => p + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch
  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [pRes, mRes] = await Promise.all([
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "problems" } }),
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "maintenance" } }),
      ]);
      if (pRes.error) throw new Error(pRes.error.message);
      if (mRes.error) throw new Error(mRes.error.message);
      setProblems(Array.isArray(pRes.data) ? pRes.data : []);
      setMaintenances(Array.isArray(mRes.data) ? mRes.data : []);
      setLastUpdate(new Date());
      setSecAgo(0);
    } catch (err: any) {
      setError(err.message || "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [fetchData]);

  // Derived
  const categorized = useMemo(() => {
    const map: Record<Category, ZabbixProblem[]> = { equipamentos: [], links: [], outros: [] };
    for (const p of problems) map[classifyProblem(p)].push(p);
    // Filter CTRL if toggle is off
    if (!showCtrl) {
      map.equipamentos = map.equipamentos.filter(p => {
        const desc = (p.triggerDescription || p.name || "").toLowerCase();
        return !desc.includes("ctrl");
      });
    }
    // Sort newest first
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

  const kpis = [
    { id: "total", label: "Total Problemas", value: totalProblems, icon: Activity, color: C.red, hi: true },
    { id: "equip", label: "Equipamentos", value: catCounts.equipamentos, icon: Server, color: C.blue, hi: false },
    { id: "links", label: "Links", value: catCounts.links, icon: Wifi, color: C.green, hi: false },
    { id: "outros", label: "Outros", value: catCounts.outros, icon: AlertTriangle, color: C.dim, hi: false },
    { id: "manut", label: "Manutenções", value: totalMaintenances, icon: Wrench, color: C.yellow, hi: false },
  ];

  const toggleSidebar = () => {
    setSidebarHidden(prev => {
      const next = !prev;
      if (next) document.documentElement.setAttribute("data-sidebar-hidden", "true");
      else document.documentElement.removeAttribute("data-sidebar-hidden");
      return next;
    });
  };

  return (
    <div className="-m-4 md:-m-6 min-h-[calc(100vh-56px)] lg:min-h-screen overflow-hidden relative" style={{ background: C.pageBg, fontFamily: "'Poppins', sans-serif" }}>
      <Particles />

      <div className="relative z-10 p-4 lg:p-5 flex flex-col h-[calc(100vh-56px)] lg:h-screen">

        {/* HEADER */}
        <motion.div initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
          className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            {!isTvView && (
              <button onClick={() => navigate("/dashboard/zabbix")} className="p-2 rounded-xl transition-all hover:bg-white/5 hover:scale-110 active:scale-95">
                <ArrowLeft className="h-5 w-5" style={{ color: C.dim }} />
              </button>
            )}
            {!isTvView && (
              <button onClick={toggleSidebar} className="p-2 rounded-xl transition-all hover:bg-white/5 hover:scale-110 active:scale-95">
                {sidebarHidden ? <Eye className="h-5 w-5" style={{ color: C.dim }} /> : <EyeOff className="h-5 w-5" style={{ color: C.dim }} />}
              </button>
            )}
          <div className="flex items-center gap-3">
            {isTvView && (
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs uppercase tracking-wider transition-all hover:scale-105"
                style={{
                  background: "rgba(77,166,255,0.12)",
                  border: `1px solid ${C.border}`,
                  color: C.cyan,
                  fontWeight: 700,
                }}
              >
                <Monitor className="h-4 w-4" />
                Chamados
              </button>
            )}
              <div className="p-2 rounded-xl" style={{ background: "rgba(77,166,255,0.12)", boxShadow: "0 0 20px rgba(77,166,255,0.25)" }}>
                <Activity className="h-6 w-6" style={{ color: C.cyan, filter: `drop-shadow(0 0 6px ${C.cyan})` }} />
              </div>
              <div>
                <h1 className="text-2xl tracking-wide" style={{ color: C.white, textShadow: `0 0 20px ${C.cyan}20`, fontWeight: 400 }}>
                  Monitoramento
                </h1>
                <div className="flex items-center gap-2 text-sm" style={{ color: C.dim }}>
                  <PulseDot color={totalProblems > 0 ? C.red : C.green} />
                  <span style={{ fontWeight: 400 }}>
                    {totalProblems > 0 ? `${totalProblems} problema${totalProblems > 1 ? "s" : ""} ativo${totalProblems > 1 ? "s" : ""}` : "Sem problemas ativos"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* CTRL Toggle */}
            <button
              onClick={() => setShowCtrl(prev => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs uppercase tracking-wider transition-all"
              style={{
                background: showCtrl ? "rgba(77,166,255,0.15)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${showCtrl ? C.borderHi : C.border}`,
                color: showCtrl ? C.cyan : C.dim,
                fontWeight: 700,
              }}
            >
              <Server className="h-3.5 w-3.5" />
              CTRL
              <span className="text-[10px] font-normal" style={{ color: showCtrl ? C.green : C.dim }}>
                {showCtrl ? "ON" : "OFF"}
              </span>
            </button>
            {error && (
              <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="text-xs px-3 py-1.5 rounded-full"
                style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.10)", border: "1px solid rgba(255,107,107,0.25)" }}>
                ⚠ {error}
              </motion.span>
            )}
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl"
              style={{ background: "rgba(77,166,255,0.05)", border: `1px solid ${C.border}`, boxShadow: "0 0 15px rgba(77,166,255,0.06)" }}>
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: C.dim, fontWeight: 400 }}>
                  {secAgo < 5 ? "● Atualizado agora" : `Atualizado há ${secAgo}s`}
                </span>
                <span className="font-mono text-lg tabular-nums tracking-widest" style={{ color: C.textCyan, textShadow: `0 0 14px ${C.cyan}50`, fontWeight: 400 }}>
                  {now.toLocaleTimeString("pt-BR")}
                </span>
              </div>
              <button onClick={fetchData} disabled={loading}
                className="p-2 rounded-lg transition-all hover:bg-white/8 hover:scale-110" style={{ color: C.dim }}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </motion.div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-5 gap-3 mb-3 flex-shrink-0">
          {kpis.map((k, i) => (
            <GlowCard key={k.id} hi={k.hi} delay={i * 0.07}>
              <div className="p-5 lg:p-6 flex items-center gap-4 min-h-[110px]">
                {k.id === "total" ? (
                  <MultiDonut size={60} segments={[
                    { pct: totalProblems > 0 ? (catCounts.equipamentos / totalProblems) * 100 : 0, color: C.blue },
                    { pct: totalProblems > 0 ? (catCounts.links / totalProblems) * 100 : 0, color: C.green },
                    { pct: totalProblems > 0 ? (catCounts.outros / totalProblems) * 100 : 0, color: C.dim },
                  ]} />
                ) : (
                  <MiniDonut pct={totalProblems > 0 ? (k.value / totalProblems) * 100 : k.id === "manut" ? 100 : 0} color={k.color} size={60} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <k.icon className="h-5 w-5 flex-shrink-0" style={{ color: k.color, filter: `drop-shadow(0 0 5px ${k.color}60)` }} />
                    <span className="text-xs uppercase tracking-[0.15em] truncate" style={{ color: k.color, fontWeight: 700 }}>
                      {k.label}
                    </span>
                  </div>
                  <AnimNum value={k.value}
                    className="text-5xl xl:text-6xl tabular-nums block leading-none"
                    style={{ color: C.white, textShadow: `0 0 35px ${k.color}45, 0 0 70px ${k.color}15`, fontWeight: 400 }} />
                </div>
              </div>
            </GlowCard>
          ))}
        </div>

        {/* PROBLEM LISTS */}
        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          {(["equipamentos", "links"] as Category[]).map((cat, ci) => {
            const items = categorized[cat];
            const Icon = CATEGORY_ICONS[cat];
            const color = CATEGORY_COLORS[cat];

            return (
              <GlowCard key={cat} delay={0.35 + ci * 0.1} className="min-h-0 flex flex-col" contentClassName="h-full flex flex-col">
                <div className="p-4 pb-2 flex items-center gap-2 flex-shrink-0" style={{ borderBottom: `1px solid ${C.grid}` }}>
                  <Icon className="h-6 w-6" style={{ color, filter: `drop-shadow(0 0 4px ${color}60)` }} />
                  <span className="text-sm uppercase tracking-[0.15em]" style={{ color, fontWeight: 700 }}>
                    {CATEGORY_LABELS[cat]}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                  {/* Column headers */}
                  <div className="grid grid-cols-[24px_1.2fr_2fr_140px_70px_90px] gap-2 px-3 py-2 sticky top-0" style={{ background: "rgba(6,12,30,0.95)", borderBottom: `1px solid ${C.grid}` }}>
                    <span />
                    <span className="text-xs uppercase tracking-wider" style={{ color: C.dim, fontWeight: 700 }}>Host</span>
                    <span className="text-xs uppercase tracking-wider" style={{ color: C.dim, fontWeight: 700 }}>Problema</span>
                    <span className="text-xs uppercase tracking-wider" style={{ color: C.dim, fontWeight: 700 }}>Duração</span>
                    <span className="text-xs uppercase tracking-wider text-center" style={{ color: C.dim, fontWeight: 700 }}>Updates</span>
                    <span className="text-xs uppercase tracking-wider text-right" style={{ color: C.dim, fontWeight: 700 }}>Origem</span>
                  </div>

                  {items.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <span className="text-base" style={{ color: C.green }}>✓ Sem problemas</span>
                    </div>
                  ) : (
                    <TvGroupedRows
                      groups={groupByHostTv(items)}
                      expandedHosts={expandedHosts}
                      onToggle={(key) => setExpandedHosts(prev => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                      })}
                    />
                  )}
                </div>
              </GlowCard>
            );
          })}
        </div>

        {/* "OUTROS" bar if any */}
        {categorized.outros.length > 0 && (
          <GlowCard delay={0.6} className="mt-3 flex-shrink-0">
            <div className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5" style={{ color: C.dim }} />
              <span className="text-sm uppercase tracking-[0.12em]" style={{ color: C.dim, fontWeight: 700 }}>
                OUTROS: {categorized.outros.length} problema{categorized.outros.length > 1 ? "s" : ""}
              </span>
              <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1 ml-4">
                {categorized.outros.slice(0, 5).map((p) => (
                  <span key={p.eventid} className="text-sm" style={{ color: C.textCyan }}>
                    {p.hosts?.[0]?.name || "—"}: <span style={{ color: C.dim }}>{p.triggerDescription || p.name}</span>
                    <span className="ml-2 font-mono text-xs" style={{ color: C.orange }}>{formatDuration(Number(p.clock))}</span>
                  </span>
                ))}
                {categorized.outros.length > 5 && (
                  <span className="text-xs" style={{ color: C.dim }}>+{categorized.outros.length - 5} mais</span>
                )}
              </div>
            </div>
          </GlowCard>
        )}

        {/* FOOTER */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
          className="flex items-center justify-center gap-4 pt-1 flex-shrink-0">
          <div className="h-[1px] flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(77,166,255,0.25), transparent)" }} />
          <div className="flex items-center gap-2.5">
            <PulseDot color={C.cyan} />
            <span className="text-[10px] whitespace-nowrap" style={{ color: C.dim, fontWeight: 400 }}>
              Auto-refresh 30s{lastUpdate ? ` · ${lastUpdate.toLocaleTimeString("pt-BR")}` : ""}
            </span>
          </div>
          <div className="h-[1px] flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(77,166,255,0.25), transparent)" }} />
        </motion.div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(77,166,255,0.2); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(77,166,255,0.4); }
      `}</style>
    </div>
  );
}
