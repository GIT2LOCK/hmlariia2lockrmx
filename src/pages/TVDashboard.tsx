import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Monitor, RefreshCw } from "lucide-react";

interface TicketCounts {
  totalOpen: number;
  byEntity: Record<string, number>;
  fetchedAt: string;
}

const ENTITIES = [
  { id: "8", name: "GOODSTORAGE", color: "from-blue-500 to-blue-700", textColor: "text-blue-100", bgGlow: "shadow-blue-500/30" },
  { id: "7", name: "PETCARE", color: "from-emerald-500 to-emerald-700", textColor: "text-emerald-100", bgGlow: "shadow-emerald-500/30" },
  { id: "1", name: "BRAVA", color: "from-orange-500 to-orange-700", textColor: "text-orange-100", bgGlow: "shadow-orange-500/30" },
];

const KNOWN_IDS = new Set(["1", "7", "8"]);
const REFRESH_INTERVAL = 60_000; // 60 seconds

const TVDashboard = () => {
  const [data, setData] = useState<TicketCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchCounts = useCallback(async () => {
    try {
      setError(null);
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/glpi-proxy?action=ticket-counts`,
        { headers: { 'apikey': anonKey, 'Content-Type': 'application/json' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: TicketCounts = await res.json();
      setData(result);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Failed to fetch ticket counts:", err);
      setError(err instanceof Error ? err.message : "Erro ao buscar dados");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounts();
    const interval = setInterval(fetchCounts, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchCounts]);

  const getEntityCount = (entityId: string): number => {
    if (!data?.byEntity) return 0;
    return data.byEntity[entityId] || 0;
  };

  const getUnidentifiedCount = (): number => {
    if (!data?.byEntity) return 0;
    return Object.entries(data.byEntity)
      .filter(([id]) => !KNOWN_IDS.has(id))
      .reduce((sum, [, count]) => sum + count, 0);
  };

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col p-6 md:p-10 z-[9999]">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Monitor className="h-8 w-8 text-gray-400" />
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Chamados em Aberto
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdate && (
            <span className="text-gray-500 text-sm md:text-base">
              Atualizado: {lastUpdate.toLocaleTimeString("pt-BR")}
            </span>
          )}
          <button
            onClick={fetchCounts}
            className="text-gray-400 hover:text-white transition-colors"
            title="Atualizar agora"
          >
            <RefreshCw className={`h-6 w-6 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-xl p-4 mb-6 text-red-200 text-center text-lg">
          {error}
        </div>
      )}

      {/* Cards grid */}
      <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 auto-rows-fr">
        {ENTITIES.map((entity) => (
          <div
            key={entity.id}
            className={`bg-gradient-to-br ${entity.color} rounded-2xl md:rounded-3xl flex flex-col items-center justify-center shadow-2xl ${entity.bgGlow} transition-all duration-500`}
          >
            <span className={`text-lg md:text-2xl font-semibold ${entity.textColor} opacity-80 mb-2 md:mb-4 tracking-wide uppercase`}>
              {entity.name}
            </span>
            <span className="text-[80px] md:text-[120px] lg:text-[140px] font-black text-white leading-none drop-shadow-lg">
              {loading && !data ? "—" : getEntityCount(entity.id)}
            </span>
          </div>
        ))}

        {/* Not identified */}
        <div className="bg-gradient-to-br from-gray-600 to-gray-800 rounded-2xl md:rounded-3xl flex flex-col items-center justify-center shadow-2xl shadow-gray-500/20 transition-all duration-500">
          <span className="text-lg md:text-2xl font-semibold text-gray-300 opacity-80 mb-2 md:mb-4 tracking-wide uppercase">
            Não Identificado
          </span>
          <span className="text-[80px] md:text-[120px] lg:text-[140px] font-black text-white leading-none drop-shadow-lg">
            {loading && !data ? "—" : getUnidentifiedCount()}
          </span>
        </div>
      </div>

      {/* Footer with total */}
      <div className="mt-6 text-center">
        <span className="text-gray-500 text-base md:text-lg">
          Total em aberto:{" "}
          <span className="text-white font-bold text-xl md:text-2xl">
            {data?.totalOpen ?? "—"}
          </span>
        </span>
        <span className="text-gray-700 mx-4">•</span>
        <span className="text-gray-600 text-sm">
          Atualização automática a cada 60s
        </span>
      </div>
    </div>
  );
};

export default TVDashboard;
