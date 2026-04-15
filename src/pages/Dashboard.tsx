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
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";

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

const ENTITIES = [
  { id: "8", name: "GoodStorage", icon: Cloud },
  { id: "1", name: "Brava", icon: Home },
  { id: "7", name: "PetCare", icon: PawPrint },
];
const KNOWN_IDS = new Set(["1", "7", "8"]);
const REFRESH_INTERVAL = 30_000;

const ENTITY_COLORS: Record<string, string> = {
  "8": "#4da6ff",
  "7": "#3dd9b4",
  "1": "#ff9f43",
  "indefinido": "#7c8ca1",
};

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_andamento: "Em Andamento",
  pendente: "Pendente",
};

const STATUS_COLORS = ["#5bc0de", "#4da6ff", "#3366cc"];

// ─── Animated Counter ───
const AnimatedNumber = ({ value, className, style }: { value: number; className?: string; style?: React.CSSProperties }) => {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const from = prev.current;
    const to = value;
    if (from === to) return;
    const duration = 800;
    const start = performance.now();
    const step = (ts: number) => {
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    prev.current = to;
  }, [value]);

  return <span className={className} style={style}>{display}</span>;
};

// ─── Particle Background ───
const ParticleCanvas = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; r: number; a: number }[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.5 + 0.5,
        a: Math.random() * 0.5 + 0.1,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(77, 166, 255, ${p.a})`;
        ctx.fill();
      });

      // Connect nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(77, 166, 255, ${0.06 * (1 - dist / 120)})`;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />;
};

// ─── Glow Card ───
const GlowCard = ({ children, className = "", highlight = false, delay = 0 }: {
  children: React.ReactNode; className?: string; highlight?: boolean; delay?: number;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20, scale: 0.97 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
    className={`relative rounded-xl overflow-hidden group ${className}`}
    style={{
      background: "linear-gradient(135deg, rgba(15, 25, 55, 0.85), rgba(8, 14, 35, 0.92))",
      backdropFilter: "blur(12px)",
      border: highlight
        ? "1px solid rgba(77, 166, 255, 0.45)"
        : "1px solid rgba(77, 166, 255, 0.2)",
      boxShadow: highlight
        ? "0 0 30px rgba(77, 166, 255, 0.2), inset 0 1px 0 rgba(77, 166, 255, 0.15), 0 0 80px rgba(77, 166, 255, 0.06)"
        : "0 0 20px rgba(77, 166, 255, 0.08), inset 0 1px 0 rgba(77, 166, 255, 0.08)",
    }}
  >
    {/* Top glow line */}
    <div
      className="absolute top-0 left-[5%] right-[5%] h-[1px]"
      style={{ background: highlight
        ? "linear-gradient(90deg, transparent, rgba(77, 166, 255, 0.8), transparent)"
        : "linear-gradient(90deg, transparent, rgba(77, 166, 255, 0.4), transparent)" }}
    />
    {/* Hover glow overlay */}
    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
      style={{ background: "radial-gradient(ellipse at center, rgba(77, 166, 255, 0.05) 0%, transparent 70%)" }}
    />
    <div className="relative z-10">{children}</div>
  </motion.div>
);

// ─── Mini Donut for KPI cards ───
const MiniDonut = ({ value, total, color }: { value: number; total: number; color: string }) => {
  const pct = total > 0 ? (value / total) * 100 : 0;
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const dashLength = (pct / 100) * circumference;

  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="flex-shrink-0">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(77, 166, 255, 0.1)" strokeWidth="4" />
      <motion.circle
        cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${dashLength} ${circumference - dashLength}`}
        strokeDashoffset={circumference / 4}
        initial={{ strokeDasharray: `0 ${circumference}` }}
        animate={{ strokeDasharray: `${dashLength} ${circumference - dashLength}` }}
        transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
        style={{ filter: `drop-shadow(0 0 4px ${color}60)` }}
      />
      <text x="22" y="22" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="9" fontWeight="bold">
        {Math.round(pct)}%
      </text>
    </svg>
  );
};

// ─── Pulse Dot ───
const PulseDot = ({ color }: { color: string }) => (
  <span className="relative flex h-2 w-2">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ backgroundColor: color }} />
    <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
  </span>
);

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
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    if (!tvMode) return;
    const t = setInterval(() => {
      setNow(new Date());
      setSecondsAgo(prev => prev + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [tvMode]);

  useEffect(() => {
    const loadCounts = async () => {
      const [e, u, o, l] = await Promise.all([
        supabase.from("empresas").select("id", { count: "exact", head: true }),
        supabase.from("unidades").select("id", { count: "exact", head: true }),
        supabase.from("operadoras").select("id", { count: "exact", head: true }),
        supabase.from("links_internet").select("id", { count: "exact", head: true }),
      ]);
      setCounts({ empresas: e.count || 0, unidades: u.count || 0, operadoras: o.count || 0, links: l.count || 0 });
    };
    loadCounts();
  }, []);

  useEffect(() => {
    if (!search.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const term = `%${search}%`;
      const { data } = await supabase
        .from("unidades")
        .select("id, nome_unidade, cidade, estado, empresas(nome_fantasia)")
        .or(`nome_unidade.ilike.${term},cidade.ilike.${term},codigo_unidade.ilike.${term},logradouro.ilike.${term}`)
        .limit(10);
      setResults(data || []);
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchTickets = useCallback(async () => {
    try {
      setTicketError(null);
      setTicketLoading(true);
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/glpi-proxy?action=ticket-counts`,
        { headers: { apikey: anonKey, "Content-Type": "application/json" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: TicketData = await res.json();
      setTicketData(result);
      setLastUpdate(new Date());
      setSecondsAgo(0);
    } catch (err) {
      console.error("TV fetch error:", err);
      setTicketError(err instanceof Error ? err.message : "Erro ao buscar dados");
    } finally {
      setTicketLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tvMode) return;
    fetchTickets();
    const interval = setInterval(fetchTickets, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [tvMode, fetchTickets]);

  const entityTotals = useMemo(() => ticketData?.entityTotals || {}, [ticketData]);
  const totalOpen = ticketData?.totalOpen ?? 0;

  const pieData = useMemo(() => {
    const total = Object.values(entityTotals).reduce((s, v) => s + v, 0) || 1;
    return [
      ...ENTITIES.map((e) => ({
        name: e.name, value: entityTotals[e.id] || 0,
        pct: Math.round(((entityTotals[e.id] || 0) / total) * 100),
        color: ENTITY_COLORS[e.id],
      })),
      {
        name: "Indefinido", value: entityTotals["indefinido"] || 0,
        pct: Math.round(((entityTotals["indefinido"] || 0) / total) * 100),
        color: ENTITY_COLORS["indefinido"],
      },
    ];
  }, [entityTotals]);

  const statusPieData = useMemo(() => {
    const statusRows = ["novo", "em_andamento", "pendente"];
    return statusRows.map((s, i) => {
      const row = ticketData?.byStatusEntity?.[s] || {};
      return { name: STATUS_LABELS[s], value: Object.values(row).reduce((sum, v) => sum + v, 0), color: STATUS_COLORS[i] };
    });
  }, [ticketData]);

  const lineChartData = useMemo(() => {
    if (!ticketData?.last7Days) return [];
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return Object.entries(ticketData.last7Days).map(([date]) => {
      const d = new Date(date + "T12:00:00");
      const byEntity = ticketData.last7DaysByEntity || {};
      return {
        name: dayNames[d.getDay()],
        GoodStorage: byEntity["8"]?.[date] || 0,
        Brava: byEntity["1"]?.[date] || 0,
        PetCare: byEntity["7"]?.[date] || 0,
        Indefinido: byEntity["indefinido"]?.[date] || 0,
      };
    });
  }, [ticketData]);

  const barChartData = useMemo(() => {
    if (!ticketData?.last24Hours) return [];
    return Object.entries(ticketData.last24Hours).map(([hour, count]) => ({
      name: hour, chamados: count,
    }));
  }, [ticketData]);

  const getCount = (id: string) => ticketData?.entityTotals?.[id] || 0;

  const stats = [
    { label: "Empresas", value: counts.empresas, icon: Building2, color: "text-primary" },
    { label: "Unidades", value: counts.unidades, icon: MapPin, color: "text-secondary" },
    { label: "Operadoras", value: counts.operadoras, icon: Radio, color: "text-accent" },
    { label: "Links de Internet", value: counts.links, icon: Wifi, color: "text-destructive" },
  ];

  // ── TV MODE ──
  if (tvMode) {
    const statusRows = ["novo", "em_andamento", "pendente"];
    const textCyan = "#7ec8e3";
    const textWhite = "#e8f0ff";
    const textDim = "#5a7a9a";
    const accentCyan = "#4da6ff";
    const gridStroke = "rgba(77, 166, 255, 0.12)";

    const tooltipStyle: React.CSSProperties = {
      background: "rgba(10, 18, 40, 0.95)",
      border: "1px solid rgba(77, 166, 255, 0.3)",
      borderRadius: "8px",
      fontSize: "12px",
      color: textWhite,
      backdropFilter: "blur(8px)",
    };

    const kpiCards = [
      { id: "total", name: "Chamados Total", value: totalOpen, icon: Activity, color: accentCyan, highlight: true },
      ...ENTITIES.map(e => ({ id: e.id, name: e.name, value: getCount(e.id), icon: e.icon, color: ENTITY_COLORS[e.id], highlight: false })),
      { id: "indefinido", name: "Indefinido", value: getCount("indefinido"), icon: HelpCircle, color: ENTITY_COLORS["indefinido"], highlight: false },
    ];

    return (
      <div className="-m-4 md:-m-6 min-h-[calc(100vh-56px)] lg:min-h-screen overflow-hidden relative"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(20, 40, 80, 0.4) 0%, rgba(5, 8, 20, 1) 70%)" }}>

        <ParticleCanvas />

        <div className="relative z-10 p-4 md:p-5 flex flex-col h-[calc(100vh-56px)] lg:h-screen">
          {/* ── Header ── */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex items-center justify-between mb-4"
          >
            <div className="flex items-center gap-3">
              <button onClick={() => setTvMode(false)} className="p-2 rounded-lg transition-all hover:bg-white/5 hover:scale-110">
                <ArrowLeft className="h-5 w-5" style={{ color: textDim }} />
              </button>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg" style={{ background: "rgba(77, 166, 255, 0.15)", boxShadow: "0 0 15px rgba(77, 166, 255, 0.2)" }}>
                  <Monitor className="h-5 w-5" style={{ color: accentCyan }} />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-wide" style={{ color: textWhite }}>
                    Painel de Chamados
                  </h1>
                  <div className="flex items-center gap-2 text-[10px]" style={{ color: textDim }}>
                    <PulseDot color="#3dd9b4" />
                    <span>Monitoramento em tempo real</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {ticketError && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="text-xs px-3 py-1 rounded-full" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.12)", border: "1px solid rgba(255,107,107,0.2)" }}>
                  {ticketError}
                </motion.span>
              )}
              <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg" style={{ background: "rgba(77, 166, 255, 0.06)", border: "1px solid rgba(77, 166, 255, 0.15)" }}>
                <span className="text-xs" style={{ color: textDim }}>
                  {secondsAgo < 5 ? "Agora" : `${secondsAgo}s atrás`}
                </span>
                <span className="font-mono text-base font-bold tabular-nums tracking-wider" style={{ color: textCyan, textShadow: `0 0 10px ${accentCyan}40` }}>
                  {now.toLocaleTimeString("pt-BR")}
                </span>
                <button onClick={fetchTickets} disabled={ticketLoading}
                  className="p-1.5 rounded-md transition-all hover:bg-white/5" style={{ color: textDim }}>
                  <RefreshCw className={`h-4 w-4 ${ticketLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>
          </motion.div>

          {/* ── KPI Cards ── */}
          <div className="grid grid-cols-5 gap-3 mb-4">
            {kpiCards.map((card, i) => (
              <GlowCard key={card.id} highlight={card.highlight} delay={i * 0.08}>
                <div className="p-4 flex items-center gap-3 min-h-[100px]">
                  {card.id === "total" && (
                    <MiniDonut value={totalOpen} total={Math.max(totalOpen, 1)} color={accentCyan} />
                  )}
                  {card.id !== "total" && (
                    <MiniDonut value={card.value} total={Math.max(totalOpen, 1)} color={card.color} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <card.icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: card.color, filter: `drop-shadow(0 0 4px ${card.color}50)` }} />
                      <span className="text-[10px] font-bold uppercase tracking-widest truncate" style={{ color: card.color }}>
                        {card.name}
                      </span>
                    </div>
                    <AnimatedNumber value={card.value}
                      className="text-4xl xl:text-5xl font-black tabular-nums block"
                      style={{ color: textWhite, textShadow: `0 0 30px ${card.color}40, 0 0 60px ${card.color}15` }}
                    />
                    {card.id === "total" && pieData.filter(p => p.value > 0).length > 0 && (
                      <div className="flex gap-2 mt-1.5">
                        {pieData.filter(p => p.value > 0).map(p => (
                          <span key={p.name} className="flex items-center gap-1 text-[9px]" style={{ color: textDim }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color, boxShadow: `0 0 4px ${p.color}` }} />
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

          {/* ── Middle Row: Table + Pie charts ── */}
          <div className="grid grid-cols-[1fr_300px] gap-3 mb-4 flex-1 min-h-0">
            {/* Status Table */}
            <GlowCard delay={0.4}>
              <div className="p-1 h-full">
                <table className="w-full h-full">
                  <thead>
                    <tr>
                      <th className="text-left p-3 text-xs font-bold uppercase tracking-widest" style={{ color: textCyan, borderBottom: "1px solid rgba(77, 166, 255, 0.15)" }}>
                        Grupo
                      </th>
                      <th className="text-center p-3 text-xs font-bold uppercase tracking-widest" style={{ color: textCyan, borderBottom: "1px solid rgba(77, 166, 255, 0.15)" }}>
                        Chamados Total
                      </th>
                      {ENTITIES.map((e) => (
                        <th key={e.id} className="text-center p-3 text-xs font-bold uppercase tracking-widest" style={{ color: ENTITY_COLORS[e.id], borderBottom: "1px solid rgba(77, 166, 255, 0.15)" }}>
                          {e.name}
                        </th>
                      ))}
                      <th className="text-center p-3 text-xs font-bold uppercase tracking-widest" style={{ color: ENTITY_COLORS["indefinido"], borderBottom: "1px solid rgba(77, 166, 255, 0.15)" }}>
                        Indef.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {statusRows.map((status, i) => {
                      const row = ticketData?.byStatusEntity?.[status] || {};
                      const total = Object.values(row).reduce((s, v) => s + v, 0);
                      return (
                        <motion.tr
                          key={status}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.5 + i * 0.1 }}
                          className="group/row transition-colors"
                          style={i < statusRows.length - 1 ? { borderBottom: "1px solid rgba(77, 166, 255, 0.08)" } : {}}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(77, 166, 255, 0.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        >
                          <td className="p-3">
                            <span className="text-sm font-bold" style={{ color: textCyan }}>{STATUS_LABELS[status]}</span>
                          </td>
                          <td className="p-3 text-center">
                            <AnimatedNumber value={total}
                              className="text-3xl xl:text-4xl font-black tabular-nums"
                              style={{ color: textWhite, textShadow: `0 0 20px ${accentCyan}30` }}
                            />
                          </td>
                          {ENTITIES.map((e) => (
                            <td key={e.id} className="p-3 text-center">
                              <AnimatedNumber value={row[e.id] || 0}
                                className="text-3xl xl:text-4xl font-black tabular-nums"
                                style={{ color: textWhite }}
                              />
                            </td>
                          ))}
                          <td className="p-3 text-center">
                            <AnimatedNumber value={row["indefinido"] || 0}
                              className="text-3xl xl:text-4xl font-black tabular-nums"
                              style={{ color: textWhite }}
                            />
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </GlowCard>

            {/* Pie Charts Column */}
            <div className="flex flex-col gap-3">
              {/* Entity Pie */}
              <GlowCard delay={0.5} className="flex-1">
                <div className="p-3 h-full flex flex-col">
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: textCyan }}>
                    Por Empresa
                  </p>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius="45%" outerRadius="70%" dataKey="value"
                          strokeWidth={2} stroke="rgba(8, 14, 35, 0.9)" animationBegin={300} animationDuration={1000}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} style={{ filter: `drop-shadow(0 0 6px ${entry.color}40)` }} />)}
                        </Pie>
                        <Tooltip formatter={(v: number, n: string) => [`${v}`, n]} contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
                    {pieData.map((p) => (
                      <span key={p.name} className="flex items-center gap-1.5 text-[10px]" style={{ color: textDim }}>
                        <span className="w-2 h-2 rounded-full" style={{ background: p.color, boxShadow: `0 0 4px ${p.color}60` }} />
                        {p.pct}% {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              </GlowCard>

              {/* Status Pie */}
              <GlowCard delay={0.6} className="flex-1">
                <div className="p-3 h-full flex flex-col">
                  <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: textCyan }}>
                    Por Status
                  </p>
                  <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusPieData} cx="50%" cy="50%" innerRadius="45%" outerRadius="70%" dataKey="value"
                          strokeWidth={2} stroke="rgba(8, 14, 35, 0.9)" animationBegin={500} animationDuration={1000}>
                          {statusPieData.map((e, i) => <Cell key={i} fill={e.color} style={{ filter: `drop-shadow(0 0 6px ${e.color}40)` }} />)}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
                    {statusPieData.map((d) => {
                      const total = statusPieData.reduce((s, x) => s + x.value, 0) || 1;
                      return (
                        <span key={d.name} className="flex items-center gap-1.5 text-[10px]" style={{ color: textDim }}>
                          <span className="w-2 h-2 rounded-full" style={{ background: d.color, boxShadow: `0 0 4px ${d.color}60` }} />
                          {d.name} {Math.round((d.value / total) * 100)}%
                        </span>
                      );
                    })}
                  </div>
                </div>
              </GlowCard>
            </div>
          </div>

          {/* ── Bottom Row: Line + Bar chart ── */}
          <div className="grid grid-cols-2 gap-3 mb-2">
            {/* 7-day Line chart */}
            <GlowCard delay={0.7}>
              <div className="p-3">
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: textCyan }}>
                  Últimos 7 Dias
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={lineChartData}>
                    <defs>
                      {Object.entries(ENTITY_COLORS).map(([id, color]) => (
                        <filter key={id} id={`glow-${id}`}>
                          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                          <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: textDim }} axisLine={{ stroke: gridStroke }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: textDim }} allowDecimals={false} axisLine={{ stroke: gridStroke }} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: "10px", color: textDim }} />
                    <Line type="monotone" dataKey="GoodStorage" stroke={ENTITY_COLORS["8"]} strokeWidth={2.5}
                      dot={{ r: 4, fill: ENTITY_COLORS["8"], strokeWidth: 0, filter: "url(#glow-8)" }}
                      activeDot={{ r: 6, fill: ENTITY_COLORS["8"], stroke: ENTITY_COLORS["8"], strokeWidth: 2, strokeOpacity: 0.3 }}
                      animationDuration={1500} animationBegin={600} />
                    <Line type="monotone" dataKey="Brava" stroke={ENTITY_COLORS["1"]} strokeWidth={2.5}
                      dot={{ r: 4, fill: ENTITY_COLORS["1"], strokeWidth: 0 }}
                      animationDuration={1500} animationBegin={800} />
                    <Line type="monotone" dataKey="PetCare" stroke={ENTITY_COLORS["7"]} strokeWidth={2.5}
                      dot={{ r: 4, fill: ENTITY_COLORS["7"], strokeWidth: 0 }}
                      animationDuration={1500} animationBegin={1000} />
                    <Line type="monotone" dataKey="Indefinido" stroke={ENTITY_COLORS["indefinido"]} strokeWidth={2}
                      dot={{ r: 3, fill: ENTITY_COLORS["indefinido"], strokeWidth: 0 }}
                      strokeDasharray="5 5" animationDuration={1500} animationBegin={1200} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </GlowCard>

            {/* 24h Bar chart */}
            <GlowCard delay={0.8}>
              <div className="p-3">
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: textCyan }}>
                  Últimas 24 Horas
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={barChartData}>
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={accentCyan} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={accentCyan} stopOpacity={0.3} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="name" tick={{ fontSize: 8, fill: textDim }} interval={2} axisLine={{ stroke: gridStroke }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: textDim }} allowDecimals={false} axisLine={{ stroke: gridStroke }} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="chamados" radius={[4, 4, 0, 0]} animationDuration={1200} animationBegin={800}>
                      {barChartData.map((_, i) => (
                        <Cell key={i} fill="url(#barGradient)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </GlowCard>
          </div>

          {/* ── Footer ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="flex items-center justify-center gap-4 pt-1"
          >
            <div className="h-[1px] flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(77,166,255,0.3), transparent)" }} />
            <div className="flex items-center gap-2">
              <PulseDot color={accentCyan} />
              <span className="text-[10px] whitespace-nowrap" style={{ color: textDim }}>
                Auto-refresh 30s {lastUpdate && `· Última atualização: ${lastUpdate.toLocaleTimeString("pt-BR")}`}
              </span>
            </div>
            <div className="h-[1px] flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(77,166,255,0.3), transparent)" }} />
          </motion.div>
        </div>
      </div>
    );
  }

  // ── NORMAL DASHBOARD ──
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do sistema de consulta técnica</p>
        </div>
        <Button onClick={() => setTvMode(true)} variant="outline" className="gap-2">
          <Monitor className="h-4 w-4" />
          TV View
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-6 flex items-center gap-4">
              <s.icon className={`h-10 w-10 ${s.color}`} />
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Busca Rápida de Unidades
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Buscar por nome, cidade, código ou logradouro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {results.length > 0 && (
            <div className="border rounded-md divide-y">
              {results.map((r: any) => (
                <div
                  key={r.id}
                  className="p-3 hover:bg-muted/50 cursor-pointer flex justify-between items-center"
                  onClick={() => navigate(`/dashboard/unidades/${r.id}`)}
                >
                  <div>
                    <p className="font-medium">{r.nome_unidade}</p>
                    <p className="text-sm text-muted-foreground">
                      {r.empresas?.nome_fantasia} • {r.cidade}/{r.estado}
                    </p>
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
