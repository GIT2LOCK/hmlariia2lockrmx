import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, MapPin, Radio, Wifi, Search, Monitor,
  RefreshCw, ArrowLeft, Clock, HelpCircle
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
  "8": "hsl(215, 85%, 55%)",
  "7": "hsl(160, 65%, 45%)",
  "1": "hsl(25, 85%, 55%)",
  "indefinido": "hsl(220, 15%, 50%)",
};

const STATUS_LABELS: Record<string, string> = {
  novo: "Novo",
  em_andamento: "Em Andamento",
  pendente: "Pendente",
};

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

  // Computed data
  const entityTotals = useMemo(() => {
    if (!ticketData?.entityTotals) return {};
    return ticketData.entityTotals;
  }, [ticketData]);

  const pieData = useMemo(() => {
    const totals = entityTotals;
    const total = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
    return [
      ...ENTITIES.map((e) => ({
        name: e.name,
        value: totals[e.id] || 0,
        pct: Math.round(((totals[e.id] || 0) / total) * 100),
        color: ENTITY_COLORS[e.id],
      })),
      {
        name: "Indefinido",
        value: totals["indefinido"] || 0,
        pct: Math.round(((totals["indefinido"] || 0) / total) * 100),
        color: ENTITY_COLORS["indefinido"],
      },
    ];
  }, [entityTotals]);

  const lineChartData = useMemo(() => {
    if (!ticketData?.last7Days) return [];
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return Object.entries(ticketData.last7Days).map(([date, count]) => {
      const d = new Date(date + "T12:00:00");
      const byEntity = ticketData.last7DaysByEntity || {};
      return {
        name: dayNames[d.getDay()],
        total: count,
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
      name: hour,
      chamados: count,
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

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setTvMode(false)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Painel de Chamados
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {ticketError && <span className="text-sm text-destructive">{ticketError}</span>}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
                {now.toLocaleTimeString("pt-BR")}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={fetchTickets} disabled={ticketLoading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${ticketLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Top cards */}
        <div className="grid grid-cols-5 gap-3">
          {/* Total card */}
          <Card className="border-primary/30">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <div className="flex items-center gap-2 mb-1">
                <Monitor className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Chamados Total
                </span>
              </div>
              <span className="text-4xl font-black text-foreground tabular-nums">
                {ticketData?.totalOpen ?? "—"}
              </span>
              {ticketData && ticketData.totalOpen > 0 && (
                <div className="flex gap-2 mt-1 text-[10px] text-muted-foreground">
                  {pieData.filter(p => p.value > 0).map(p => (
                    <span key={p.name} className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
                      {p.pct}%
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Entity cards */}
          {ENTITIES.map((entity) => (
            <Card key={entity.id}>
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                <div className="flex items-center gap-2 mb-1">
                  <entity.icon className="h-4 w-4" style={{ color: ENTITY_COLORS[entity.id] }} />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {entity.name}
                  </span>
                </div>
                <span className="text-4xl font-black text-foreground tabular-nums">
                  {ticketLoading && !ticketData ? "—" : getCount(entity.id)}
                </span>
              </CardContent>
            </Card>
          ))}

          {/* Indefinido */}
          <Card>
            <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
              <div className="flex items-center gap-2 mb-1">
                <HelpCircle className="h-4 w-4" style={{ color: ENTITY_COLORS["indefinido"] }} />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Indefinido
                </span>
              </div>
              <span className="text-4xl font-black text-foreground tabular-nums">
                {ticketLoading && !ticketData ? "—" : getCount("indefinido")}
              </span>
            </CardContent>
          </Card>
        </div>

        {/* Middle: Table + Pie */}
        <div className="grid grid-cols-[1fr_300px] gap-3">
          {/* Status table */}
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Grupo</th>
                    <th className="text-center p-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">Total</th>
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
                      <tr key={status} className={i < statusRows.length - 1 ? "border-b" : ""}>
                        <td className="p-3 text-sm font-semibold text-foreground">{STATUS_LABELS[status]}</td>
                        <td className="p-3 text-center text-2xl font-black text-foreground tabular-nums">{total}</td>
                        {ENTITIES.map((e) => (
                          <td key={e.id} className="p-3 text-center text-2xl font-black text-foreground tabular-nums">
                            {row[e.id] || 0}
                          </td>
                        ))}
                        <td className="p-3 text-center text-2xl font-black text-foreground tabular-nums">
                          {row["indefinido"] || 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Pie charts */}
          <div className="space-y-3">
            <Card>
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Distribuição por Empresa
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      dataKey="value"
                      strokeWidth={2}
                      stroke="hsl(var(--card))"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value} chamados`, name]}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center px-2">
                  {pieData.map((p) => (
                    <span key={p.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      {p.name} {p.pct}%
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Status pie */}
            <Card>
              <CardHeader className="p-3 pb-0">
                <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Por Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                {(() => {
                  const statusColors = ["hsl(200, 70%, 55%)", "hsl(215, 85%, 55%)", "hsl(235, 60%, 55%)"];
                  const statusData = statusRows.map((s, i) => {
                    const row = ticketData?.byStatusEntity?.[s] || {};
                    return {
                      name: STATUS_LABELS[s],
                      value: Object.values(row).reduce((sum, v) => sum + v, 0),
                      color: statusColors[i],
                    };
                  });
                  const total = statusData.reduce((s, d) => s + d.value, 0) || 1;
                  return (
                    <>
                      <ResponsiveContainer width="100%" height={100}>
                        <PieChart>
                          <Pie data={statusData} cx="50%" cy="50%" innerRadius={25} outerRadius={40} dataKey="value" strokeWidth={2} stroke="hsl(var(--card))">
                            {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {statusData.map((d) => (
                          <span key={d.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                            {d.name} {Math.round((d.value / total) * 100)}%
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom: Line chart + Bar chart */}
        <div className="grid grid-cols-2 gap-3">
          {/* Line chart - last 7 days */}
          <Card>
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Últimos 7 Dias
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={lineChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                  <Line type="monotone" dataKey="GoodStorage" stroke={ENTITY_COLORS["8"]} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Brava" stroke={ENTITY_COLORS["1"]} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="PetCare" stroke={ENTITY_COLORS["7"]} strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="Indefinido" stroke={ENTITY_COLORS["indefinido"]} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Bar chart - last 24 hours */}
          <Card>
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Últimas 24 Horas
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={barChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    interval={2}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="chamados" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        {lastUpdate && (
          <p className="text-center text-xs text-muted-foreground">
            Última atualização: {lastUpdate.toLocaleTimeString("pt-BR")} · Atualização automática a cada 30s
          </p>
        )}
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
