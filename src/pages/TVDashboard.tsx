import { useEffect, useState, useCallback, useMemo } from "react";
import { RefreshCw, Monitor, Clock, TrendingUp, AlertCircle } from "lucide-react";

interface TicketCounts {
  totalOpen: number;
  byEntity: Record<string, number>;
  fetchedAt: string;
}

const ENTITIES = [
  { id: "8", name: "GOODSTORAGE", accent: "hsl(215, 85%, 55%)" },
  { id: "7", name: "PETCARE", accent: "hsl(160, 70%, 45%)" },
  { id: "1", name: "BRAVA", accent: "hsl(25, 90%, 55%)" },
];

const KNOWN_IDS = new Set(["1", "7", "8"]);
const REFRESH_INTERVAL = 30_000;
const HISTORY_SIZE = 20;

const TVDashboard = () => {
  const [data, setData] = useState<TicketCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [history, setHistory] = useState<Array<{ time: string; counts: Record<string, number>; total: number }>>([]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchCounts = useCallback(async () => {
    try {
      setError(null);
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/glpi-proxy?action=ticket-counts`,
        { headers: { apikey: anonKey, "Content-Type": "application/json" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: TicketCounts = await res.json();
      setData(result);
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
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  const getCount = (id: string) => data?.byEntity[id] || 0;
  const unidentifiedCount = useMemo(() => {
    if (!data?.byEntity) return 0;
    return Object.entries(data.byEntity)
      .filter(([id]) => !KNOWN_IDS.has(id))
      .reduce((s, [, c]) => s + c, 0);
  }, [data]);

  const maxCount = useMemo(() => {
    const all = [...ENTITIES.map((e) => getCount(e.id)), unidentifiedCount];
    return Math.max(...all, 1);
  }, [data, unidentifiedCount]);

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
    ...ENTITIES.map((e) => ({ id: e.id, name: e.name, accent: e.accent, count: getCount(e.id) })),
    { id: "other", name: "Não Identificado", accent: "hsl(220, 15%, 50%)", count: unidentifiedCount },
  ];

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden" style={{ background: "hsl(235, 30%, 6%)" }}>
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(215, 85%, 55%) 1px, transparent 1px), linear-gradient(90deg, hsl(215, 85%, 55%) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative h-full flex flex-col p-6 lg:p-8">
        <header className="flex items-center justify-between mb-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "hsl(215, 85%, 55%)" }}>
              <Monitor className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
                Painel de Chamados
              </h1>
              <p className="text-xs lg:text-sm" style={{ color: "hsl(215, 20%, 55%)" }}>
                Atualização a cada 30 segundos
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {error && (
              <div className="flex items-center gap-2 text-sm" style={{ color: "hsl(0, 65%, 60%)" }}>
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            <button
              onClick={fetchCounts}
              className="p-2 rounded-lg transition-colors"
              style={{ color: "hsl(215, 20%, 55%)" }}
              title="Atualizar agora"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <div className="flex items-center gap-2 text-white">
              <Clock className="h-4 w-4" style={{ color: "hsl(215, 20%, 55%)" }} />
              <span className="text-2xl font-mono font-semibold tabular-nums">
                {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 grid grid-cols-4 grid-rows-[1fr_auto] gap-4 lg:gap-5 min-h-0">
          {allCards.map((card) => {
            const pct = maxCount > 0 ? (card.count / maxCount) * 100 : 0;
            return (
              <div
                key={card.id}
                className="relative rounded-2xl overflow-hidden flex flex-col items-center justify-center transition-all duration-700"
                style={{
                  background: "hsl(235, 25%, 10%)",
                  border: "1px solid hsl(235, 20%, 18%)",
                  boxShadow: `0 0 40px ${card.accent}15, inset 0 1px 0 hsl(235, 25%, 15%)`,
                }}
              >
                <div
                  className="absolute top-0 left-0 right-0 h-1"
                  style={{ background: card.accent }}
                />
                <div
                  className="absolute inset-0 opacity-10"
                  style={{
                    background: `radial-gradient(ellipse at 50% 120%, ${card.accent}, transparent 70%)`,
                  }}
                />

                <div className="relative z-10 flex flex-col items-center gap-3">
                  <span
                    className="text-xs lg:text-sm font-bold uppercase tracking-[0.2em]"
                    style={{ color: card.accent }}
                  >
                    {card.name}
                  </span>
                  <span
                    className="text-[72px] lg:text-[100px] xl:text-[120px] font-black leading-none tabular-nums text-white transition-all duration-500"
                    style={{
                      textShadow: `0 0 40px ${card.accent}40`,
                    }}
                  >
                    {loading && !data ? "—" : card.count}
                  </span>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-1.5" style={{ background: "hsl(235, 20%, 14%)" }}>
                  <div
                    className="h-full transition-all duration-1000 ease-out rounded-r-full"
                    style={{ width: `${pct}%`, background: card.accent }}
                  />
                </div>
              </div>
            );
          })}

          <div
            className="col-span-4 rounded-2xl flex items-center justify-between px-8 py-4"
            style={{
              background: "hsl(235, 25%, 10%)",
              border: "1px solid hsl(235, 20%, 18%)",
            }}
          >
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "hsl(215, 20%, 50%)" }}>
                  Total em aberto
                </p>
                <p className="text-4xl lg:text-5xl font-black text-white tabular-nums">
                  {data?.totalOpen ?? "—"}
                </p>
              </div>

              <div className="flex items-end gap-3 h-12 ml-4">
                {allCards.map((card) => {
                  const h = maxCount > 0 ? Math.max((card.count / maxCount) * 48, 4) : 4;
                  return (
                    <div key={card.id} className="flex flex-col items-center gap-1">
                      <div
                        className="w-8 lg:w-10 rounded-t transition-all duration-1000"
                        style={{ height: `${h}px`, background: card.accent }}
                      />
                      <span className="text-[9px] font-bold uppercase" style={{ color: "hsl(215, 20%, 45%)" }}>
                        {card.name.slice(0, 4)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: "hsl(215, 20%, 50%)" }}>
                  <TrendingUp className="h-3 w-3 inline mr-1" />
                  Histórico
                </p>
                <p className="text-xs" style={{ color: "hsl(215, 20%, 40%)" }}>
                  Últimas {history.length} leituras
                </p>
              </div>
              <svg viewBox="0 0 100 40" className="w-48 lg:w-64 h-10" preserveAspectRatio="none">
                {sparklinePath && (
                  <>
                    <defs>
                      <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(215, 85%, 55%)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="hsl(215, 85%, 55%)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d={`${sparklinePath} L 100 40 L 0 40 Z`} fill="url(#sparkGrad)" />
                    <path d={sparklinePath} fill="none" stroke="hsl(215, 85%, 55%)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    {history.length > 0 && (
                      <circle
                        cx={100}
                        cy={40 - (history[history.length - 1].total / Math.max(...history.map((h) => h.total), 1)) * 40}
                        r="2.5"
                        fill="hsl(215, 85%, 55%)"
                      >
                        <animate attributeName="r" values="2.5;4;2.5" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                  </>
                )}
              </svg>
            </div>

            {lastUpdate && (
              <div className="text-right">
                <p className="text-xs" style={{ color: "hsl(215, 20%, 40%)" }}>
                  Última atualização
                </p>
                <p className="text-sm font-mono text-white tabular-nums">
                  {lastUpdate.toLocaleTimeString("pt-BR")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TVDashboard;
