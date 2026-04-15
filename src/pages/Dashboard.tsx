import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, MapPin, Radio, Wifi, Search, Monitor,
  RefreshCw, ArrowLeft, HelpCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Legend,
} from "recharts";

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
  { id: "8", name: "GoodStorage", icon: Building2 },
  { id: "1", name: "Brava", icon: MapPin },
  { id: "7", name: "PetCare", icon: Radio },
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

// Glow card wrapper for TV mode
const GlowCard = ({ children, className = "", highlight = false }: { children: React.ReactNode; className?: string; highlight?: boolean }) => (
  <div
    className={`relative rounded-xl overflow-hidden ${className}`}
    style={{
      background: "linear-gradient(135deg, rgba(20, 30, 60, 0.9), rgba(10, 18, 40, 0.95))",
      border: "1px solid rgba(77, 166, 255, 0.25)",
      boxShadow: highlight
        ? "0 0 20px rgba(77, 166, 255, 0.15), inset 0 0 30px rgba(77, 166, 255, 0.05), 0 0 60px rgba(77, 166, 255, 0.08)"
        : "0 0 15px rgba(77, 166, 255, 0.08), inset 0 0 20px rgba(77, 166, 255, 0.03)",
    }}
  >
    {/* Top glow line */}
    <div
      className="absolute top-0 left-[10%] right-[10%] h-[1px]"
      style={{ background: "linear-gradient(90deg, transparent, rgba(77, 166, 255, 0.6), transparent)" }}
    />
    {children}
  </div>
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

  useEffect(() => {
    if (!tvMode) return;
    const t = setInterval(() => setNow(new Date()), 1000);
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
    const tvBg = "radial-gradient(ellipse at 50% 0%, rgba(30, 58, 110, 0.3) 0%, rgba(5, 10, 25, 1) 70%)";
    const textCyan = "#7ec8e3";
    const textWhite = "#e8f0ff";
    const textDim = "#5a7a9a";
    const accentCyan = "#4da6ff";
    const gridStroke = "rgba(77, 166, 255, 0.12)";

    const tooltipStyle = {
      background: "rgba(10, 18, 40, 0.95)",
      border: "1px solid rgba(77, 166, 255, 0.3)",
      borderRadius: "8px",
      fontSize: "12px",
      color: textWhite,
    };

    return (
      <div
        className="-m-4 md:-m-6 p-4 md:p-5 min-h-[calc(100vh-56px)] lg:min-h-screen space-y-4"
        style={{ background: tvBg }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTvMode(false)}
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
            >
              <ArrowLeft className="h-5 w-5" style={{ color: textDim }} />
            </button>
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5" style={{ color: accentCyan }} />
              <h1 className="text-lg font-bold" style={{ color: textWhite }}>
                Painel de Chamados
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {ticketError && (
              <span className="text-xs px-2 py-1 rounded" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}>
                {ticketError}
              </span>
            )}
            <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: textCyan }}>
              {now.toLocaleTimeString("pt-BR")}
            </span>
            <button
              onClick={fetchTickets}
              disabled={ticketLoading}
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: textDim }}
            >
              <RefreshCw className={`h-4 w-4 ${ticketLoading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Top cards row */}
        <div className="grid grid-cols-5 gap-3">
          {/* Total */}
          <GlowCard highlight>
            <div className="p-4 flex flex-col items-center justify-center text-center min-h-[100px]">
              <div className="flex items-center gap-2 mb-2">
                <Monitor className="h-4 w-4" style={{ color: accentCyan }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: textCyan }}>
                  Chamados Total
                </span>
              </div>
              <span className="text-5xl font-black tabular-nums" style={{ color: textWhite, textShadow: `0 0 30px ${accentCyan}40` }}>
                {ticketData?.totalOpen ?? "—"}
              </span>
              {ticketData && ticketData.totalOpen > 0 && (
                <div className="flex gap-2 mt-2">
                  {pieData.filter(p => p.value > 0).map(p => (
                    <span key={p.name} className="flex items-center gap-1 text-[10px]" style={{ color: textDim }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
                      {p.pct}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          </GlowCard>

          {/* Entity cards */}
          {ENTITIES.map((entity) => (
            <GlowCard key={entity.id}>
              <div className="p-4 flex flex-col items-center justify-center text-center min-h-[100px]">
                <div className="flex items-center gap-2 mb-2">
                  <entity.icon className="h-4 w-4" style={{ color: ENTITY_COLORS[entity.id] }} />
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ENTITY_COLORS[entity.id] }}>
                    {entity.name}
                  </span>
                </div>
                <span className="text-5xl font-black tabular-nums" style={{ color: textWhite, textShadow: `0 0 25px ${ENTITY_COLORS[entity.id]}40` }}>
                  {ticketLoading && !ticketData ? "—" : getCount(entity.id)}
                </span>
              </div>
            </GlowCard>
          ))}

          {/* Indefinido */}
          <GlowCard>
            <div className="p-4 flex flex-col items-center justify-center text-center min-h-[100px]">
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="h-4 w-4" style={{ color: ENTITY_COLORS["indefinido"] }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: ENTITY_COLORS["indefinido"] }}>
                  Indefinido
                </span>
              </div>
              <span className="text-5xl font-black tabular-nums" style={{ color: textWhite, textShadow: `0 0 25px ${ENTITY_COLORS["indefinido"]}40` }}>
                {ticketLoading && !ticketData ? "—" : getCount("indefinido")}
              </span>
            </div>
          </GlowCard>
        </div>

        {/* Middle row: Table + Pie charts */}
        <div className="grid grid-cols-[1fr_280px] gap-3">
          {/* Status table */}
          <GlowCard>
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(77, 166, 255, 0.15)" }}>
                  <th className="text-left p-3 text-xs font-bold uppercase tracking-wider" style={{ color: textCyan }}>Grupo</th>
                  <th className="text-center p-3 text-xs font-bold uppercase tracking-wider" style={{ color: textCyan }}>Chamados Total</th>
                  {ENTITIES.map((e) => (
                    <th key={e.id} className="text-center p-3 text-xs font-bold uppercase tracking-wider" style={{ color: ENTITY_COLORS[e.id] }}>
                      {e.name}
                    </th>
                  ))}
                  <th className="text-center p-3 text-xs font-bold uppercase tracking-wider" style={{ color: ENTITY_COLORS["indefinido"] }}>
                    Indef.
                  </th>
                </tr>
              </thead>
              <tbody>
                {statusRows.map((status, i) => {
                  const row = ticketData?.byStatusEntity?.[status] || {};
                  const total = Object.values(row).reduce((s, v) => s + v, 0);
                  return (
                    <tr
                      key={status}
                      style={i < statusRows.length - 1 ? { borderBottom: "1px solid rgba(77, 166, 255, 0.1)" } : {}}
                    >
                      <td className="p-3 text-sm font-bold" style={{ color: textCyan }}>{STATUS_LABELS[status]}</td>
                      <td className="p-3 text-center">
                        <span className="text-3xl font-black tabular-nums" style={{ color: textWhite, textShadow: `0 0 15px ${accentCyan}30` }}>
                          {total}
                        </span>
                      </td>
                      {ENTITIES.map((e) => (
                        <td key={e.id} className="p-3 text-center">
                          <span className="text-3xl font-black tabular-nums" style={{ color: textWhite }}>
                            {row[e.id] || 0}
                          </span>
                        </td>
                      ))}
                      <td className="p-3 text-center">
                        <span className="text-3xl font-black tabular-nums" style={{ color: textWhite }}>
                          {row["indefinido"] || 0}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlowCard>

          {/* Pie charts column */}
          <div className="space-y-3">
            {/* Distribution pie */}
            <GlowCard>
              <div className="p-3">
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: textCyan }}>
                  Por Empresa
                </p>
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={30} outerRadius={48} dataKey="value" strokeWidth={2} stroke="rgba(10,18,40,0.8)">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v}`, n]} contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
                  {pieData.map((p) => (
                    <span key={p.name} className="flex items-center gap-1 text-[10px]" style={{ color: textDim }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      {p.pct}% {p.name}
                    </span>
                  ))}
                </div>
              </div>
            </GlowCard>

            {/* Status pie */}
            <GlowCard>
              <div className="p-3">
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: textCyan }}>
                  Por Status
                </p>
                {(() => {
                  const statusColors = ["#5bc0de", accentCyan, "#3366cc"];
                  const statusData = statusRows.map((s, i) => {
                    const row = ticketData?.byStatusEntity?.[s] || {};
                    return { name: STATUS_LABELS[s], value: Object.values(row).reduce((sum, v) => sum + v, 0), color: statusColors[i] };
                  });
                  const total = statusData.reduce((s, d) => s + d.value, 0) || 1;
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={100}>
                        <PieChart>
                          <Pie data={statusData} cx="50%" cy="50%" innerRadius={25} outerRadius={40} dataKey="value" strokeWidth={2} stroke="rgba(10,18,40,0.8)">
                            {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip contentStyle={tooltipStyle} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center">
                        {statusData.map((d) => (
                          <span key={d.name} className="flex items-center gap-1 text-[10px]" style={{ color: textDim }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                            {d.name} {Math.round((d.value / total) * 100)}%
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </GlowCard>
          </div>
        </div>

        {/* Bottom row: Line chart + Bar chart */}
        <div className="grid grid-cols-[1fr_1fr] gap-3">
          {/* Line chart - 7 days */}
          <GlowCard>
            <div className="p-3">
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: textCyan }}>
                Últimos 7 Dias
              </p>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={lineChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: textDim }} axisLine={{ stroke: gridStroke }} tickLine={{ stroke: gridStroke }} />
                  <YAxis tick={{ fontSize: 11, fill: textDim }} allowDecimals={false} axisLine={{ stroke: gridStroke }} tickLine={{ stroke: gridStroke }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: "10px", color: textDim }} />
                  <Line type="monotone" dataKey="GoodStorage" stroke={ENTITY_COLORS["8"]} strokeWidth={2} dot={{ r: 3, fill: ENTITY_COLORS["8"], strokeWidth: 0 }} activeDot={{ r: 5, fill: ENTITY_COLORS["8"] }} />
                  <Line type="monotone" dataKey="Brava" stroke={ENTITY_COLORS["1"]} strokeWidth={2} dot={{ r: 3, fill: ENTITY_COLORS["1"], strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="PetCare" stroke={ENTITY_COLORS["7"]} strokeWidth={2} dot={{ r: 3, fill: ENTITY_COLORS["7"], strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="Indefinido" stroke={ENTITY_COLORS["indefinido"]} strokeWidth={2} dot={{ r: 3, fill: ENTITY_COLORS["indefinido"], strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </GlowCard>

          {/* Bar chart - 24 hours */}
          <GlowCard>
            <div className="p-3">
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: textCyan }}>
                Últimas 24 Horas
              </p>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                  <XAxis dataKey="name" tick={{ fontSize: 8, fill: textDim }} interval={2} axisLine={{ stroke: gridStroke }} tickLine={{ stroke: gridStroke }} />
                  <YAxis tick={{ fontSize: 11, fill: textDim }} allowDecimals={false} axisLine={{ stroke: gridStroke }} tickLine={{ stroke: gridStroke }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="chamados" radius={[3, 3, 0, 0]}>
                    {barChartData.map((_, i) => (
                      <Cell key={i} fill={accentCyan} fillOpacity={0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlowCard>
        </div>

        {/* Footer glow line */}
        <div className="flex items-center justify-center gap-4 pt-1">
          <div className="h-[1px] flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(77,166,255,0.3), transparent)" }} />
          {lastUpdate && (
            <span className="text-[10px] whitespace-nowrap" style={{ color: textDim }}>
              Atualizado: {lastUpdate.toLocaleTimeString("pt-BR")} · Auto-refresh 30s
            </span>
          )}
          <div className="h-[1px] flex-1" style={{ background: "linear-gradient(90deg, transparent, rgba(77,166,255,0.3), transparent)" }} />
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
