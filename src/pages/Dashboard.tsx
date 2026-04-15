import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, MapPin, Radio, Wifi, Search, Monitor,
  RefreshCw, ArrowLeft, HelpCircle, Cloud, Home, PawPrint, Activity
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Area, AreaChart,
  BarChart, Bar, Legend,
} from "recharts";
import { motion } from "framer-motion";

// ─── Types ───
interface TicketData {
  totalOpen: number;
  byEntity: Record<string, number>;
  entityTotals: Record<string, number>;
  byStatusEntity: Record<string, Record<string, number>>;
  last7Days: Record<string, number>;
  last7DaysByEntity: Record<string, Record<string, number>>;
  last24Hours: Record<string, number>;
  fetchedAt: string;
}

// ─── Constants ───
const ENTITIES = [
  { id: "8", name: "GoodStorage", icon: Cloud },
  { id: "1", name: "Brava", icon: Home },
  { id: "7", name: "PetCare", icon: PawPrint },
];
const REFRESH_INTERVAL = 30_000;

const ENTITY_COLORS: Record<string, string> = {
  "8": "#4da6ff",
  "7": "#3dd9b4",
  "1": "#ff9f43",
  indefinido: "#7c8ca1",
};

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_andamento: "Em Andamento",
  pendente: "Pendente",
};
const STATUS_COLORS = ["#5bc0de", "#4da6ff", "#3366cc"];
const STATUS_ROWS = ["novo", "em_andamento", "pendente"] as const;

// ─── Palette shortcuts ───
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
};

const tooltipStyle: React.CSSProperties = {
  background: "rgba(8,14,35,0.96)",
  border: `1px solid ${C.border}`,
  borderRadius: "10px",
  fontSize: "12px",
  color: C.white,
  backdropFilter: "blur(12px)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUB-COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Animated count-up number */
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

/** Particle canvas background */
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

/** Glassmorphism card with glow */
const GlowCard = ({ children, className = "", hi = false, delay = 0 }: {
  children: React.ReactNode; className?: string; hi?: boolean; delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 24, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    whileHover={{ scale: 1.025, transition: { duration: 0.18 } }}
    className={`relative rounded-2xl overflow-hidden group ${className}`}
    style={{
      background: C.cardBg,
      backdropFilter: "blur(16px)",
      border: `1px solid ${hi ? C.borderHi : C.border}`,
      boxShadow: hi ? C.glowLg : C.glowSm,
    }}
  >
    {/* top edge glow */}
    <div className="absolute top-0 left-[8%] right-[8%] h-[1px]"
      style={{ background: `linear-gradient(90deg, transparent, rgba(77,166,255,${hi ? 0.9 : 0.45}), transparent)` }} />
    {/* shine sweep */}
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] opacity-[0.04] group-hover:opacity-[0.08] transition-opacity duration-700"
        style={{ background: "conic-gradient(from 180deg at 50% 50%, transparent 0deg, rgba(77,166,255,0.8) 60deg, transparent 120deg)" }} />
    </div>
    {/* hover radial glow */}
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
      style={{ background: "radial-gradient(ellipse at 50% 40%, rgba(77,166,255,0.06) 0%, transparent 65%)" }} />
    <div className="relative z-10">{children}</div>
  </motion.div>
);

/** Mini donut inside KPI card */
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

/** Pulsing dot indicator */
const PulseDot = ({ color }: { color: string }) => (
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-40" style={{ backgroundColor: color }} />
    <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
  </span>
);

type DonutSlice = { name: string; value: number; color: string; pct?: number };

/** Stable donut card for TV View */
const TvDonutCard = ({ title, items, total }: { title: string; items: DonutSlice[]; total: number }) => {
  const gradient = useMemo(() => {
    const active = items.filter((item) => item.value > 0);
    const totalValue = active.reduce((sum, item) => sum + item.value, 0);

    if (!active.length || totalValue <= 0) {
      return `conic-gradient(from -90deg, rgba(77,166,255,0.12) 0% 100%)`;
    }

    let offset = 0;
    const stops = active.map((item) => {
      const start = offset;
      offset += (item.value / totalValue) * 100;
      return `${item.color} ${start}% ${offset}%`;
    });

    return `conic-gradient(from -90deg, ${stops.join(", ")})`;
  }, [items]);

  return (
    <div className="p-3 h-full flex flex-col">
      <p className="text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color: C.textCyan }}>
        {title}
      </p>
      <div className="flex flex-1 items-center justify-center py-1">
        <div className="relative h-[164px] w-[164px]">
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: gradient,
              boxShadow: `0 0 18px rgba(77,166,255,0.10)`,
            }}
          />
          <div
            className="absolute inset-[16px] rounded-full"
            style={{
              background: "rgba(6,12,30,0.96)",
              border: `1px solid ${C.border}`,
              boxShadow: "inset 0 0 24px rgba(77,166,255,0.08)",
            }}
          />
          <div
            className="absolute inset-[29px] rounded-full"
            style={{ border: `1px solid rgba(77,166,255,0.10)` }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-[30px] leading-none tabular-nums"
              style={{ color: C.white, fontWeight: 400, textShadow: `0 0 12px ${C.cyan}40` }}
            >
              {total}
            </span>
            <span className="mt-1 text-[9px] tracking-[0.18em]" style={{ color: C.dim, fontWeight: 400 }}>
              TOTAL
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
        {items.map((item) => (
          <span key={item.name} className="flex items-center gap-1.5 text-[10px]" style={{ color: C.dim, fontWeight: 400 }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.color, boxShadow: `0 0 5px ${item.color}60` }} />
            {item.pct ?? 0}% {item.name}
          </span>
        ))}
      </div>
    </div>
  );
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const Dashboard = () => {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ empresas: 0, unidades: 0, operadoras: 0, links: 0 });
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [secAgo, setSecAgo] = useState(0);

  // Clock
  useEffect(() => {
    if (!tvMode) return;
    const t = setInterval(() => { setNow(new Date()); setSecAgo(p => p + 1); }, 1000);
    return () => clearInterval(t);
  }, [tvMode]);

  // Supabase counts
  useEffect(() => {
    (async () => {
      const [e, u, o, l] = await Promise.all([
        supabase.from("empresas").select("id", { count: "exact", head: true }),
        supabase.from("unidades").select("id", { count: "exact", head: true }),
        supabase.from("operadoras").select("id", { count: "exact", head: true }),
        supabase.from("links_internet").select("id", { count: "exact", head: true }),
      ]);
      setCounts({ empresas: e.count || 0, unidades: u.count || 0, operadoras: o.count || 0, links: l.count || 0 });
    })();
  }, []);

  // Search
  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const term = `%${search}%`;
      const { data } = await supabase.from("unidades")
        .select("id, nome_unidade, cidade, estado, empresas(nome_fantasia)")
        .or(`nome_unidade.ilike.${term},cidade.ilike.${term},codigo_unidade.ilike.${term},logradouro.ilike.${term}`)
        .limit(10);
      setResults(data || []); setSearching(false);
    }, 400);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch tickets
  const fetchTickets = useCallback(async () => {
    try {
      setTicketError(null); setTicketLoading(true);
      const pid = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const r = await fetch(`https://${pid}.supabase.co/functions/v1/glpi-proxy?action=ticket-counts`,
        { headers: { apikey: key, "Content-Type": "application/json" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTicketData(await r.json()); setLastUpdate(new Date()); setSecAgo(0);
    } catch (err) {
      console.error("TV fetch error:", err);
      setTicketError(err instanceof Error ? err.message : "Erro");
    } finally { setTicketLoading(false); }
  }, []);

  useEffect(() => {
    if (!tvMode) return;
    fetchTickets();
    const iv = setInterval(fetchTickets, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [tvMode, fetchTickets]);

  // Derived data
  const totals = useMemo(() => ticketData?.entityTotals || {}, [ticketData]);
  const totalOpen = ticketData?.totalOpen ?? 0;
  const getC = (id: string) => totals[id] || 0;

  const pieData = useMemo(() => {
    const t = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
    return [
      ...ENTITIES.map(e => ({ name: e.name, value: totals[e.id] || 0, pct: Math.round(((totals[e.id] || 0) / t) * 100), color: ENTITY_COLORS[e.id] })),
      { name: "Indefinido", value: totals["indefinido"] || 0, pct: Math.round(((totals["indefinido"] || 0) / t) * 100), color: ENTITY_COLORS["indefinido"] },
    ];
  }, [totals]);

  const statusPie = useMemo(() => STATUS_ROWS.map((s, i) => {
    const row = ticketData?.byStatusEntity?.[s] || {};
    return { name: STATUS_LABELS[s], value: Object.values(row).reduce((a, b) => a + b, 0), color: STATUS_COLORS[i] };
  }), [ticketData]);

  const lineData = useMemo(() => {
    if (!ticketData?.last7Days) return [];
    const dn = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return Object.entries(ticketData.last7Days).map(([date]) => {
      const d = new Date(date + "T12:00:00");
      const be = ticketData.last7DaysByEntity || {};
      return { name: dn[d.getDay()], GoodStorage: be["8"]?.[date] || 0, Brava: be["1"]?.[date] || 0, PetCare: be["7"]?.[date] || 0, Indefinido: be["indefinido"]?.[date] || 0 };
    });
  }, [ticketData]);

  const barData = useMemo(() => {
    if (!ticketData?.last24Hours) return [];
    return Object.entries(ticketData.last24Hours).map(([h, c]) => ({ name: h, chamados: c }));
  }, [ticketData]);

  // ━━━ TV MODE ━━━
  if (tvMode) {
    const kpis = [
      { id: "total", name: "Chamados Total", val: totalOpen, icon: Activity, color: C.cyan, hi: true },
      ...ENTITIES.map(e => ({ id: e.id, name: e.name, val: getC(e.id), icon: e.icon, color: ENTITY_COLORS[e.id], hi: false })),
      { id: "indef", name: "Indefinido", val: getC("indefinido"), icon: HelpCircle, color: ENTITY_COLORS["indefinido"], hi: false },
    ];

    const totalPie = pieData.reduce((s, d) => s + d.value, 0);
    const totalStatus = statusPie.reduce((s, d) => s + d.value, 0);

    return (
      <div className="-m-4 md:-m-6 min-h-[calc(100vh-56px)] lg:min-h-screen overflow-hidden relative" style={{ background: C.pageBg, fontFamily: "'Poppins', sans-serif" }}>
        <Particles />

        <div className="relative z-10 p-4 lg:p-5 flex flex-col h-[calc(100vh-56px)] lg:h-screen">

          {/* ═══ HEADER ═══ */}
          <motion.div initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}
            className="flex items-center justify-between mb-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setTvMode(false)} className="p-2 rounded-xl transition-all hover:bg-white/5 hover:scale-110 active:scale-95">
                <ArrowLeft className="h-5 w-5" style={{ color: C.dim }} />
              </button>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl" style={{ background: "rgba(77,166,255,0.12)", boxShadow: "0 0 20px rgba(77,166,255,0.25), inset 0 0 12px rgba(77,166,255,0.08)" }}>
                  <Monitor className="h-6 w-6" style={{ color: C.cyan, filter: `drop-shadow(0 0 6px ${C.cyan})` }} />
                </div>
                <div>
                  <h1 className="text-xl tracking-wide" style={{ color: C.white, textShadow: `0 0 20px ${C.cyan}20`, fontWeight: 400 }}>
                    Painel de Chamados
                  </h1>
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: C.dim }}>
                    <PulseDot color="#3dd9b4" />
                    <span style={{ fontWeight: 400 }}>Monitoramento em tempo real</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {ticketError && (
                <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-xs px-3 py-1.5 rounded-full font-medium"
                  style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.10)", border: "1px solid rgba(255,107,107,0.25)" }}>
                  ⚠ {ticketError}
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
                <button onClick={fetchTickets} disabled={ticketLoading}
                  className="p-2 rounded-lg transition-all hover:bg-white/8 hover:scale-110" style={{ color: C.dim }}>
                  <RefreshCw className={`h-4 w-4 ${ticketLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
          </motion.div>

          {/* ═══ KPI CARDS ═══ */}
          <div className="grid grid-cols-5 gap-3 mb-3 flex-shrink-0">
            {kpis.map((k, i) => (
              <GlowCard key={k.id} hi={k.hi} delay={i * 0.07}>
                <div className="p-4 lg:p-5 flex items-center gap-4 min-h-[110px]">
                  <MiniDonut pct={k.id === "total" ? 100 : (totalOpen > 0 ? (k.val / totalOpen) * 100 : 0)} color={k.color} size={58} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <k.icon className="h-4 w-4 flex-shrink-0" style={{ color: k.color, filter: `drop-shadow(0 0 5px ${k.color}60)` }} />
                      <span className="text-[11px] uppercase tracking-[0.15em] truncate" style={{ color: k.color, fontWeight: 400 }}>
                        {k.name}
                      </span>
                    </div>
                    <AnimNum value={k.val}
                      className="text-5xl xl:text-6xl tabular-nums block leading-none"
                      style={{ color: C.white, textShadow: `0 0 35px ${k.color}45, 0 0 70px ${k.color}15`, fontWeight: 400 }} />
                    {k.id === "total" && pieData.filter(p => p.value > 0).length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {pieData.filter(p => p.value > 0).map(p => (
                          <span key={p.name} className="flex items-center gap-1 text-[10px]" style={{ color: C.dim, fontWeight: 400 }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 5px ${p.color}` }} />
                            {p.pct}%
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </GlowCard>
            ))}
          </div>

          {/* ═══ MIDDLE: Table + Donuts ═══ */}
          <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-3 mb-3 flex-1 min-h-0">

            {/* Status Grid */}
            <GlowCard delay={0.4}>
              <div className="p-3 h-full flex flex-col">
                {/* Header row */}
                <div className="grid grid-cols-6 gap-0" style={{ borderBottom: `1px solid ${C.grid}` }}>
                  {["Grupo", "Total", ...ENTITIES.map(e => e.name), "Indef."].map((label, i) => (
                    <div key={label} className={`px-3 py-2 ${i === 0 ? "text-left" : "text-center"}`}>
                      <span className="text-[11px] uppercase tracking-[0.12em]"
                        style={{ color: i === 0 || i === 1 ? C.textCyan : i <= 4 ? ENTITY_COLORS[ENTITIES[i - 2]?.id] || C.dim : ENTITY_COLORS["indefinido"], fontWeight: 400 }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Data rows */}
                {STATUS_ROWS.map((status, i) => {
                  const row = ticketData?.byStatusEntity?.[status] || {};
                  const rowTotal = Object.values(row).reduce((s, v) => s + v, 0);
                  return (
                    <motion.div key={status}
                      initial={{ opacity: 0, x: -30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.12, ease: "easeOut" }}
                      className="grid grid-cols-6 gap-0 rounded-xl min-h-[62px] transition-colors duration-200 hover:bg-[rgba(77,166,255,0.04)] items-center"
                      style={i < STATUS_ROWS.length - 1 ? { borderBottom: `1px solid rgba(77,166,255,0.06)` } : {}}>
                      <div className="px-3 py-2 flex items-center">
                        <div className="flex items-center gap-2">
                          <span className="w-1 h-7 rounded-full" style={{ background: STATUS_COLORS[i], boxShadow: `0 0 8px ${STATUS_COLORS[i]}50` }} />
                          <span className="text-sm" style={{ color: C.textCyan, fontWeight: 400 }}>{STATUS_LABELS[status]}</span>
                        </div>
                      </div>
                      <div className="px-3 py-2 flex items-center justify-center">
                        <AnimNum value={rowTotal} className="text-3xl xl:text-4xl tabular-nums"
                          style={{ color: C.white, textShadow: `0 0 25px ${C.cyan}35`, fontWeight: 400 }} />
                      </div>
                      {ENTITIES.map(e => (
                        <div key={e.id} className="px-3 py-2 flex items-center justify-center">
                          <AnimNum value={row[e.id] || 0} className="text-3xl xl:text-4xl tabular-nums"
                            style={{ color: C.white, fontWeight: 400 }} />
                        </div>
                      ))}
                      <div className="px-3 py-2 flex items-center justify-center">
                        <AnimNum value={row["indefinido"] || 0} className="text-3xl xl:text-4xl tabular-nums"
                          style={{ color: C.white, fontWeight: 400 }} />
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </GlowCard>

            {/* Donut Charts */}
            <div className="flex flex-col gap-3">
              <GlowCard delay={0.5} className="min-h-[218px]">
                <TvDonutCard title="Distribuição por Empresa" items={pieData} total={totalPie} />
              </GlowCard>

              <GlowCard delay={0.6} className="min-h-[218px]">
                <TvDonutCard
                  title="Distribuição por Status"
                  items={statusPie.map((item) => ({
                    ...item,
                    pct: totalStatus > 0 ? Math.round((item.value / totalStatus) * 100) : 0,
                  }))}
                  total={totalStatus}
                />
              </GlowCard>
            </div>
          </div>

          {/* ═══ BOTTOM: Area + Bar ═══ */}
          <div className="grid grid-cols-2 gap-3 flex-shrink-0">
            {/* 7-day Area Chart */}
            <GlowCard delay={0.7}>
              <div className="p-3 lg:p-4">
                <p className="text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color: C.textCyan }}>
                  Últimos 7 Dias
                </p>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={lineData}>
                    <defs>
                      {Object.entries(ENTITY_COLORS).map(([id, color]) => (
                        <linearGradient key={id} id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.dim, fontWeight: 600 }} axisLine={{ stroke: C.grid }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: C.dim }} allowDecimals={false} axisLine={{ stroke: C.grid }} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: "10px", color: C.dim, fontWeight: 600 }} />
                    <Area type="monotone" dataKey="GoodStorage" stroke={ENTITY_COLORS["8"]} strokeWidth={2.5} fill="url(#area-8)"
                      dot={{ r: 4, fill: ENTITY_COLORS["8"], strokeWidth: 0 }}
                      activeDot={{ r: 7, fill: ENTITY_COLORS["8"], stroke: ENTITY_COLORS["8"], strokeWidth: 3, strokeOpacity: 0.3 }}
                      animationDuration={1800} animationBegin={600} />
                    <Area type="monotone" dataKey="Brava" stroke={ENTITY_COLORS["1"]} strokeWidth={2.5} fill="url(#area-1)"
                      dot={{ r: 4, fill: ENTITY_COLORS["1"], strokeWidth: 0 }}
                      animationDuration={1800} animationBegin={800} />
                    <Area type="monotone" dataKey="PetCare" stroke={ENTITY_COLORS["7"]} strokeWidth={2.5} fill="url(#area-7)"
                      dot={{ r: 4, fill: ENTITY_COLORS["7"], strokeWidth: 0 }}
                      animationDuration={1800} animationBegin={1000} />
                    <Area type="monotone" dataKey="Indefinido" stroke={ENTITY_COLORS["indefinido"]} strokeWidth={2} fill="url(#area-indefinido)"
                      dot={{ r: 3, fill: ENTITY_COLORS["indefinido"], strokeWidth: 0 }}
                      strokeDasharray="5 5" animationDuration={1800} animationBegin={1200} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </GlowCard>

            {/* 24h Bar chart */}
            <GlowCard delay={0.8}>
              <div className="p-3 lg:p-4">
                <p className="text-[11px] uppercase tracking-[0.15em] mb-2" style={{ color: C.textCyan }}>
                  Últimas 24 Horas
                </p>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={barData}>
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.cyan} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={C.cyan} stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.dim, fontWeight: 600 }} interval={2} axisLine={{ stroke: C.grid }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: C.dim }} allowDecimals={false} axisLine={{ stroke: C.grid }} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="chamados" radius={[5, 5, 0, 0]} animationDuration={1400} animationBegin={900}>
                      {barData.map((_, i) => <Cell key={i} fill="url(#barGrad)" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlowCard>
          </div>

          {/* ═══ FOOTER ═══ */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
            className="flex items-center justify-center gap-4 pt-2 flex-shrink-0">
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
      </div>
    );
  }

  // ━━━ NORMAL DASHBOARD ━━━
  const stats = [
    { label: "Empresas", value: counts.empresas, icon: Building2, color: "text-primary" },
    { label: "Unidades", value: counts.unidades, icon: MapPin, color: "text-secondary" },
    { label: "Operadoras", value: counts.operadoras, icon: Radio, color: "text-accent" },
    { label: "Links de Internet", value: counts.links, icon: Wifi, color: "text-destructive" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-normal text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do sistema de consulta técnica</p>
        </div>
        <Button onClick={() => setTvMode(true)} variant="outline" className="gap-2">
          <Monitor className="h-4 w-4" /> TV View
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-6 flex items-center gap-4">
              <s.icon className={`h-10 w-10 ${s.color}`} />
              <div>
                <p className="text-2xl font-normal">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" /> Busca Rápida de Unidades
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Buscar por nome, cidade, código ou logradouro..." value={search} onChange={e => setSearch(e.target.value)} />
          {results.length > 0 && (
            <div className="border rounded-md divide-y">
              {results.map((r: any) => (
                <div key={r.id} className="p-3 hover:bg-muted/50 cursor-pointer flex justify-between items-center"
                  onClick={() => navigate(`/dashboard/unidades/${r.id}`)}>
                  <div>
                    <p className="font-medium">{r.nome_unidade}</p>
                    <p className="text-sm text-muted-foreground">{r.empresas?.nome_fantasia} • {r.cidade}/{r.estado}</p>
                  </div>
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
          {searching && <p className="text-sm text-muted-foreground">Buscando...</p>}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
