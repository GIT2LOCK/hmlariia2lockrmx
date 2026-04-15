import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Building2, MapPin, Radio, Wifi, Search, Monitor, RefreshCw, ArrowLeft } from "lucide-react";
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
const REFRESH_INTERVAL = 60_000;

const Dashboard = () => {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ empresas: 0, unidades: 0, operadoras: 0, links: 0 });
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // TV View state
  const [tvMode, setTvMode] = useState(false);
  const [ticketData, setTicketData] = useState<TicketCounts | null>(null);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

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
        { headers: { 'apikey': anonKey, 'Content-Type': 'application/json' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: TicketCounts = await res.json();
      setTicketData(result);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch ticket counts:", err);
      setTicketError(err instanceof Error ? err.message : "Erro ao buscar dados");
    } finally {
      setTicketLoading(false);
    }
  }, []);

  // Auto-refresh when TV mode is on
  useEffect(() => {
    if (!tvMode) return;
    fetchTickets();
    const interval = setInterval(fetchTickets, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [tvMode, fetchTickets]);

  const getEntityCount = (entityId: string): number => {
    if (!ticketData?.byEntity) return 0;
    return ticketData.byEntity[entityId] || 0;
  };

  const getUnidentifiedCount = (): number => {
    if (!ticketData?.byEntity) return 0;
    return Object.entries(ticketData.byEntity)
      .filter(([id]) => !KNOWN_IDS.has(id))
      .reduce((sum, [, count]) => sum + count, 0);
  };

  const stats = [
    { label: "Empresas", value: counts.empresas, icon: Building2, color: "text-primary" },
    { label: "Unidades", value: counts.unidades, icon: MapPin, color: "text-secondary" },
    { label: "Operadoras", value: counts.operadoras, icon: Radio, color: "text-accent" },
    { label: "Links de Internet", value: counts.links, icon: Wifi, color: "text-destructive" },
  ];

  // TV Mode view
  if (tvMode) {
    return (
      <div className="space-y-6">
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
              <p className="text-muted-foreground">Atualização automática a cada 60 segundos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdate && (
              <span className="text-sm text-muted-foreground">
                Atualizado: {lastUpdate.toLocaleTimeString("pt-BR")}
              </span>
            )}
            <Button variant="outline" size="icon" onClick={fetchTickets} disabled={ticketLoading}>
              <RefreshCw className={`h-4 w-4 ${ticketLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {ticketError && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-destructive text-center">
            {ticketError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {ENTITIES.map((entity) => (
            <Card key={entity.id} className="border-border">
              <CardContent className="p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  {entity.name}
                </p>
                <p className="text-7xl font-black text-foreground leading-none">
                  {ticketLoading && !ticketData ? "—" : getEntityCount(entity.id)}
                </p>
              </CardContent>
            </Card>
          ))}

          <Card className="border-border">
            <CardContent className="p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Não Identificado
              </p>
              <p className="text-7xl font-black text-foreground leading-none">
                {ticketLoading && !ticketData ? "—" : getUnidentifiedCount()}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center text-muted-foreground text-sm">
          Total em aberto:{" "}
          <span className="font-bold text-foreground text-lg">
            {ticketData?.totalOpen ?? "—"}
          </span>
        </div>
      </div>
    );
  }

  // Normal Dashboard view
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
