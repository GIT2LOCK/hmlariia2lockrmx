import { useEffect, useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Building2, MapPin, Radio, Wifi, Search, Monitor, RefreshCw, ArrowLeft, Clock, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TicketCounts {
  totalOpen: number;
  byEntity: Record<string, number>;
  fetchedAt: string;
}

const ENTITIES = [
  { id: "8", name: "GOODSTORAGE" },
  { id: "7", name: "PETCARE" },
  { id: "1", name: "BRAVA" },
];
const KNOWN_IDS = new Set(["1", "7", "8"]);
const REFRESH_INTERVAL = 30_000;
const HISTORY_SIZE = 20;

const Dashboard = () => {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ empresas: 0, unidades: 0, operadoras: 0, links: 0 });
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // TV state
  const [tvMode, setTvMode] = useState(false);
  const [ticketData, setTicketData] = useState<TicketCounts | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [history, setHistory] = useState<Array<{ time: string; counts: Record<string, number>; total: number }>>([]);
  const [now, setNow] = useState(new Date());

  // Clock
  useEffect(() => {
    if (!tvMode) return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [tvMode]);

  // Load dashboard counts
  useEffect(() => {
    const loadCounts = async () => {
      const [e, u, o, l] = await Promise.all([
        supabase.from("empresas").select("id", { count: "exact", head: true }),
        supabase.from("unidades").select("id", { count: "exact", head: true }),
        supabase.from("operadoras").select("id", { count: "exact", head: true }),
        supabase.from("links_internet").select("id", { count: "exact", head: true }),
      ]);
      setCounts({
        empresas: e.count || 0, unidades: u.count || 0,
        operadoras: o.count || 0, links: l.count || 0,
      });
    };
    loadCounts();
  }, []);

  // Search
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

  // Ticket fetching
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
      const result: TicketCounts = await res.json();
      setTicketData(result);
      setLastUpdate(new Date());

      const unidentified = Object.entries(result.byEntity)
        .filter(([id]) => !KNOWN_IDS.has(id))
        .reduce((s, [, c]) => s + c, 0);
      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            counts: { ...Object.fromEntries(ENTITIES.map((e) => [e.id, result.byEntity[e.id] || 0])), other: unidentified },
            total: result.totalOpen,
          },
        ];
        return next.slice(-HISTORY_SIZE);
      });
    } catch (err) {
      console.error("TV fetch error:", err);
      setTicketError(err instanceof Error ? err.message : "Erro ao buscar dados");
    } finally {
      setTicketLoading(false);
    }
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!tvMode) return;
    fetchTickets();
    const interval = setInterval(fetchTickets, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [tvMode, fetchTickets]);

  const getCount = (id: string) => ticketData?.byEntity[id] || 0;
  const unidentifiedCount = useMemo(() => {
    if (!ticketData?.byEntity) return 0;
    return Object.entries(ticketData.byEntity)
      .filter(([id]) => !KNOWN_IDS.has(id))
      .reduce((s, [, c]) => s + c, 0);
  }, [ticketData]);

  const maxCount = useMemo(() => {
    const all = [...ENTITIES.map((e) => getCount(e.id)), unidentifiedCount];
    return Math.max(...all, 1);
  }, [ticketData, unidentifiedCount]);

  const sparklinePath = useMemo(() => {
    if (history.length < 2) return "";
    const maxH = Math.max(...history.map((h) => h.total), 1);
    const w = 100;
    const h = 40;
    return history
      .map((point, i) => {
        const x = (i / (history.length - 1)) * w;
        const y = h - (point.total / maxH) * h;
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [history]);

  const allCards = [
    ...ENTITIES.map((e) => ({ id: e.id, name: e.name, count: getCount(e.id) })),
    { id: "other", name: "Não Identificado", count: unidentifiedCount },
  ];

  const stats = [
    { label: "Empresas", value: counts.empresas, icon: Building2, color: "text-primary" },
    { label: "Unidades", value: counts.unidades, icon: MapPin, color: "text-secondary" },
    { label: "Operadoras", value: counts.operadoras, icon: Radio, color: "text-accent" },
    { label: "Links de Internet", value: counts.links, icon: Wifi, color: "text-destructive" },
  ];

  // ── TV MODE ──
  if (tvMode) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setTvMode(false)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Monitor className="h-6 w-6" />
                Chamados em Aberto
              </h1>
              <p className="text-muted-foreground text-sm">Atualização automática a cada 30 segundos</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {ticketError && (
              <span className="text-sm text-destructive">{ticketError}</span>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span className="font-mono text-lg font-semibold text-foreground tabular-nums">
                {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
            <Button variant="outline" size="icon" onClick={fetchTickets} disabled={ticketLoading}>
              <RefreshCw className={`h-4 w-4 ${ticketLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Ticket cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {allCards.map((card) => {
            const pct = maxCount > 0 ? (card.count / maxCount) * 100 : 0;
            return (
              <Card key={card.id} className="relative overflow-hidden">
                <CardContent className="p-6 flex flex-col items-center justify-center text-center min-h-[220px]">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">
                    {card.name}
                  </p>
                  <p className="text-7xl lg:text-8xl font-black text-foreground leading-none tabular-nums">
                    {ticketLoading && !ticketData ? "—" : card.count}
                  </p>
                </CardContent>
                {/* Bottom progress bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-1000 ease-out rounded-r-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </Card>
            );
          })}
        </div>

        {/* Bottom: Total + Bar chart + Sparkline */}
        <Card>
          <CardContent className="p-6 flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* Total */}
            <div className="text-center lg:text-left">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Total em aberto
              </p>
              <p className="text-5xl font-black text-foreground tabular-nums">
                {ticketData?.totalOpen ?? "—"}
              </p>
            </div>

            {/* Mini bar chart */}
            <div className="flex items-end gap-3 h-16">
              {allCards.map((card) => {
                const h = maxCount > 0 ? Math.max((card.count / maxCount) * 64, 4) : 4;
                return (
                  <div key={card.id} className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-foreground tabular-nums">{card.count}</span>
                    <div
                      className="w-10 rounded-t bg-primary transition-all duration-1000"
                      style={{ height: `${h}px` }}
                    />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                      {card.name.length > 6 ? card.name.slice(0, 5) + "." : card.name}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Sparkline */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1 justify-end">
                  <TrendingUp className="h-3 w-3" />
                  Histórico
                </p>
                <p className="text-xs text-muted-foreground">
                  {history.length} leituras
                </p>
              </div>
              <svg viewBox="0 0 100 40" className="w-40 lg:w-56 h-10" preserveAspectRatio="none">
                {sparklinePath && (
                  <>
                    <defs>
                      <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={`${sparklinePath} L 100 40 L 0 40 Z`} fill="url(#sparkGrad)" />
                    <path d={sparklinePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    {history.length > 0 && (
                      <circle
                        cx={100}
                        cy={40 - (history[history.length - 1].total / Math.max(...history.map((h) => h.total), 1)) * 40}
                        r="2.5"
                        fill="hsl(var(--primary))"
                      >
                        <animate attributeName="r" values="2.5;4;2.5" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                  </>
                )}
              </svg>
            </div>

            {/* Last update */}
            {lastUpdate && (
              <div className="text-center lg:text-right">
                <p className="text-xs text-muted-foreground">Última atualização</p>
                <p className="text-sm font-mono font-semibold text-foreground tabular-nums">
                  {lastUpdate.toLocaleTimeString("pt-BR")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
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
