import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, MapPin, Radio, Wifi, Search, Monitor,
  RefreshCw, ArrowLeft, EyeOff, Eye, AlertTriangle,
  Clock, CheckCircle2, UserX, Ticket, SlidersHorizontal,
  LayoutDashboard, Move, RotateCcw,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";

// ─── Types ───
interface TvCompanyColumn {
  id: string;
  key: string;
  name: string;
  total: number;
  open: number;
  pct: number;
  color: string;
}

interface TvStatusRow {
  id: string;
  name: string;
  color: string;
  total: number;
  byCompany: Record<string, number>;
}

interface TvAttentionItem {
  id: number;
  codigo: string;
  titulo: string;
  status: string;
  prioridade: string;
  empresa: string;
  unidade?: string;
  tecnico: string;
  motivo: string;
  pct_sla: number;
  age_hours: number;
}

interface TicketData {
  totalOpen: number;
  createdToday: number;
  closedToday: number;
  overdue: number;
  dueSoon: number;
  unassigned: number;
  criticalOpen: number;
  companyColumns: TvCompanyColumn[];
  byCompany: Record<string, number>;
  byStatus: Record<string, number>;
  statusRows: TvStatusRow[];
  last7Days: Array<Record<string, string | number>>;
  attention: TvAttentionItem[];
  counts?: { empresas: number; unidades: number; operadoras: number; links: number };
  fetchedAt: string;
}

type TvTileId = "status" | "trend" | "companies" | "base" | "health" | "attention";

interface TvLayoutItem {
  id: TvTileId;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
}

type TvResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

interface TvCanvasInteraction {
  id: TvTileId;
  mode: "move" | "resize";
  handle?: TvResizeHandle;
  startX: number;
  startY: number;
  origin: TvLayoutItem;
  rect: DOMRect;
}

// ─── Constants ───
const REFRESH_INTERVAL = 300_000;
const TV_DAY_MS = 24 * 60 * 60 * 1000;
const TV_TZ = "America/Sao_Paulo";

const EMPTY_COMPANY_COLUMNS: TvCompanyColumn[] = [
  { id: "goodstorage", key: "goodstorage", name: "GoodStorage", total: 0, open: 0, pct: 0, color: "#58b7ff" },
  { id: "petcare", key: "petcare", name: "PetCare", total: 0, open: 0, pct: 0, color: "#38d6b2" },
  { id: "outros", key: "outros", name: "Outros", total: 0, open: 0, pct: 0, color: "#8da4c5" },
];

const DEFAULT_TV_COMPANY_FILTERS: Record<string, boolean> = {
  goodstorage: true,
  petcare: true,
  outros: true,
};

const TV_LAYOUT_STORAGE_KEY = "ariia-tv-dashboard-canvas-v2";
const TV_CANVAS_MIN_W = 16;
const TV_CANVAS_MIN_H = 14;
const DEFAULT_TV_LAYOUT: TvLayoutItem[] = [
  { id: "status", x: 0, y: 0, w: 44, h: 45, z: 1 },
  { id: "trend", x: 0, y: 48, w: 44, h: 52, z: 2 },
  { id: "companies", x: 45, y: 0, w: 27, h: 45, z: 3 },
  { id: "base", x: 45, y: 48, w: 27, h: 52, z: 4 },
  { id: "health", x: 73, y: 0, w: 27, h: 36, z: 5 },
  { id: "attention", x: 73, y: 39, w: 27, h: 61, z: 6 },
];

const TV_RESIZE_HANDLES: Array<{ id: TvResizeHandle; className: string }> = [
  { id: "n", className: "left-5 right-5 top-[-4px] h-2 cursor-ns-resize" },
  { id: "s", className: "left-5 right-5 bottom-[-4px] h-2 cursor-ns-resize" },
  { id: "e", className: "right-[-4px] top-5 bottom-5 w-2 cursor-ew-resize" },
  { id: "w", className: "left-[-4px] top-5 bottom-5 w-2 cursor-ew-resize" },
  { id: "nw", className: "left-[-5px] top-[-5px] h-3 w-3 cursor-nwse-resize rounded-full" },
  { id: "ne", className: "right-[-5px] top-[-5px] h-3 w-3 cursor-nesw-resize rounded-full" },
  { id: "sw", className: "left-[-5px] bottom-[-5px] h-3 w-3 cursor-nesw-resize rounded-full" },
  { id: "se", className: "right-[-5px] bottom-[-5px] h-3 w-3 cursor-nwse-resize rounded-full" },
];

const TV_TILE_LABELS: Record<TvTileId, string> = {
  status: "Status",
  trend: "Ultimos 7 dias",
  companies: "Empresas",
  base: "Base Ariia",
  health: "Saude",
  attention: "Atencao",
};

const TV_CLOSED_STATUSES = new Set(["RESOLVIDO", "FECHADO", "CANCELADO"]);
const TV_PAUSED_STATUSES = new Set(["AGUARDANDO_CLIENTE", "AGUARDANDO_OPERADORA", "AGUARDANDO_TERCEIRO", "AGENDADO", "TRIAGEM"]);
const TV_STATUS_GROUPS = [
  { id: "novos", name: "Novos", color: "#58b7ff", statuses: new Set(["NOVO", "TRIAGEM"]) },
  { id: "atendimento", name: "Em atendimento", color: "#3d86ff", statuses: new Set(["EM_ATENDIMENTO"]) },
  { id: "aguardando", name: "Aguardando", color: "#ffc45f", statuses: new Set(["AGUARDANDO_CLIENTE", "AGUARDANDO_OPERADORA", "AGUARDANDO_TERCEIRO", "AGENDADO"]) },
];

const TV_DATE_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TV_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TV_DAY_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TV_TZ,
  weekday: "short",
});

type TvTicketRow = Record<string, any>;

// ─── Palette shortcuts ───
const C = {
  cyan: "#4bb8d8",
  blue: "#3d7ee8",
  white: "#e8eef8",
  dim: "#9aa9bf",
  muted: "#6d7a90",
  grid: "rgba(160,185,220,0.08)",
  border: "rgba(180,205,235,0.11)",
  shell: "linear-gradient(145deg, rgba(12,24,43,0.72), rgba(8,18,34,0.82) 54%, rgba(7,10,24,0.78))",
  panel: "linear-gradient(145deg, rgba(14,28,50,0.66), rgba(8,18,34,0.80) 52%, rgba(10,12,28,0.76))",
  panelFlat: "rgba(10,24,44,0.54)",
  panelSoft: "linear-gradient(135deg, rgba(75,184,216,0.11), rgba(61,126,232,0.07))",
  pageBg: "linear-gradient(135deg, #050812 0%, #071424 48%, #070d1d 100%)",
  danger: "#e46b78",
  warning: "#e99552",
  ok: "#51c59f",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUB-COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TvPanel = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <section
    className={`relative overflow-hidden rounded-lg border ${className}`}
    style={{
      background: C.panel,
      borderColor: C.border,
      boxShadow: "0 16px 34px rgba(0,0,0,0.32), inset 0 1px 0 rgba(170,205,235,0.045)",
      backdropFilter: "blur(7px) saturate(1.04)",
      WebkitBackdropFilter: "blur(7px) saturate(1.04)",
    }}
  >
    <span
      className="pointer-events-none absolute inset-x-0 top-0 h-px"
      style={{ background: "linear-gradient(90deg, transparent, rgba(120,180,220,0.12), transparent)" }}
    />
    {children}
  </section>
);

const TvSectionTitle = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs 2xl:text-sm uppercase tracking-[0.12em]" style={{ color: C.dim, fontWeight: 400 }}>
    {children}
  </p>
);

const StaticDot = ({ color }: { color: string }) => (
  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
);

const clampPct = (value: number) => Math.max(0, Math.min(100, value));

const clampRange = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const roundLayoutValue = (value: number) => Math.round(value * 10) / 10;

const normalizeTvLayoutItem = (candidate: Partial<TvLayoutItem> | undefined, fallback: TvLayoutItem): TvLayoutItem => {
  const rawW = Number(candidate?.w);
  const rawH = Number(candidate?.h);
  const w = Number.isFinite(rawW) ? clampRange(rawW, TV_CANVAS_MIN_W, 100) : fallback.w;
  const h = Number.isFinite(rawH) ? clampRange(rawH, TV_CANVAS_MIN_H, 100) : fallback.h;
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

const formatMetric = (value: number) => new Intl.NumberFormat("pt-BR").format(value || 0);

const dateKey = (date: Date) => {
  const parts = TV_DATE_FORMAT.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const dayLabel = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return TV_DAY_FORMAT.format(new Date(Date.UTC(year, month - 1, day, 12))).replace(".", "");
};

const safeTime = (value: unknown) => {
  if (!value) return null;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : null;
};

const getStatus = (ticket: TvTicketRow) => String(ticket.status || "").toUpperCase();

const relationName = (value: unknown, fallback = "Indefinido") => {
  const item = Array.isArray(value) ? value[0] : value;
  if (!item || typeof item !== "object") return fallback;
  const row = item as Record<string, unknown>;
  const text = row.nome_fantasia || row.razao_social || row.nome_unidade || row.nome;
  return text ? String(text) : fallback;
};

const normalizeName = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const companyName = (ticket: TvTicketRow) => relationName(ticket.empresas, "Indefinido");
const unitName = (ticket: TvTicketRow) => relationName(ticket.unidades, "");
const techName = (ticket: TvTicketRow) => relationName(ticket.usuarios, "");

const companyBucket = (ticket: TvTicketRow) => {
  const normalized = normalizeName(companyName(ticket));
  if (normalized.includes("goodstorage") || normalized.includes("good storage")) return "goodstorage";
  if (normalized.includes("petcare") || normalized.includes("pet care")) return "petcare";
  return "outros";
};

const addTo = (map: Record<string, number>, key: string, value = 1) => {
  map[key] = (map[key] || 0) + value;
};

const slaSnapshot = (ticket: TvTicketRow, nowMs: number) => {
  const status = getStatus(ticket);
  if (TV_CLOSED_STATUSES.has(status)) {
    return { level: "done", pct: 100, remainingMs: null as number | null };
  }

  const explicitStatus = String(ticket.resolution_sla_status || "").toLowerCase();
  if (explicitStatus === "breached") {
    return { level: "overdue", pct: 100, remainingMs: -1 };
  }

  const dueAt = safeTime(ticket.resolution_due_at);
  const openedAt = safeTime(ticket.data_abertura);
  const targetMs = Number(ticket.sla_solucao_minutos || 0) * 60 * 1000;

  if (dueAt && targetMs > 0) {
    const remainingMs = dueAt - nowMs;
    const pct = clampPct(((targetMs - remainingMs) / targetMs) * 100);
    if (remainingMs < 0) return { level: "overdue", pct: 100, remainingMs };
    if (TV_PAUSED_STATUSES.has(status)) return { level: "paused", pct, remainingMs };
    if (pct >= 80) return { level: "warning", pct, remainingMs };
    return { level: "ok", pct, remainingMs };
  }

  if (openedAt && targetMs > 0) {
    const pauseMs = Number(ticket.sla_pausa_total_segundos || 0) * 1000;
    const activePauseStart = TV_PAUSED_STATUSES.has(status) ? safeTime(ticket.sla_pausa_inicio) : null;
    const elapsedMs = nowMs - openedAt - pauseMs - (activePauseStart ? nowMs - activePauseStart : 0);
    const remainingMs = targetMs - elapsedMs;
    const pct = clampPct((elapsedMs / targetMs) * 100);
    if (remainingMs < 0) return { level: "overdue", pct: 100, remainingMs };
    if (TV_PAUSED_STATUSES.has(status)) return { level: "paused", pct, remainingMs };
    if (pct >= 80) return { level: "warning", pct, remainingMs };
    return { level: "ok", pct, remainingMs };
  }

  return { level: TV_PAUSED_STATUSES.has(status) ? "paused" : "ok", pct: 0, remainingMs: null as number | null };
};

const buildTvData = (
  tickets: TvTicketRow[],
  tableCounts: { empresas: number; unidades: number; operadoras: number; links: number },
  now = new Date(),
): TicketData => {
  const nowMs = now.getTime();
  const todayKey = dateKey(now);
  const dayKeys = Array.from({ length: 7 }, (_, index) => dateKey(new Date(nowMs - (6 - index) * TV_DAY_MS)));
  const seriesMap = new Map<string, Record<string, string | number>>(
    dayKeys.map((key) => [key, { date: key, name: dayLabel(key), abertos: 0, fechados: 0, goodstorage: 0, petcare: 0, outros: 0 }]),
  );

  const byStatus: Record<string, number> = {};
  const byCompany: Record<string, number> = { goodstorage: 0, petcare: 0, outros: 0 };
  const totalByCompany: Record<string, number> = { goodstorage: 0, petcare: 0, outros: 0 };
  const openByCompany: Record<string, number> = { goodstorage: 0, petcare: 0, outros: 0 };
  const statusByCompany: Record<string, Record<string, number>> = {};
  let totalOpen = 0;
  let createdToday = 0;
  let closedToday = 0;
  let overdue = 0;
  let dueSoon = 0;
  let unassigned = 0;
  let criticalOpen = 0;
  const attention: TvAttentionItem[] = [];

  tickets.forEach((ticket) => {
    const status = getStatus(ticket);
    const bucket = companyBucket(ticket);
    const openedAt = safeTime(ticket.data_abertura);
    const closedAt = safeTime(ticket.data_fechamento) || safeTime(ticket.data_solucao);
    const isClosed = TV_CLOSED_STATUSES.has(status);
    addTo(totalByCompany, bucket);

    if (openedAt) {
      const key = dateKey(new Date(openedAt));
      if (key === todayKey) createdToday += 1;
      const day = seriesMap.get(key);
      if (day) {
        day.abertos = Number(day.abertos || 0) + 1;
        day[bucket] = Number(day[bucket] || 0) + 1;
      }
    }

    if (closedAt) {
      const key = dateKey(new Date(closedAt));
      if (key === todayKey) closedToday += 1;
      const day = seriesMap.get(key);
      if (day) day.fechados = Number(day.fechados || 0) + 1;
    }

    if (isClosed) return;

    totalOpen += 1;
    addTo(byCompany, bucket);
    addTo(openByCompany, bucket);
    addTo(byStatus, status || "SEM_STATUS");

    const group = TV_STATUS_GROUPS.find((item) => item.statuses.has(status));
    if (group) {
      statusByCompany[group.id] = statusByCompany[group.id] || { goodstorage: 0, petcare: 0, outros: 0 };
      addTo(statusByCompany[group.id], bucket);
    }

    if (!ticket.tecnico_id) unassigned += 1;
    if (String(ticket.prioridade || "").toUpperCase() === "CRITICO") criticalOpen += 1;

    const sla = slaSnapshot(ticket, nowMs);
    if (sla.level === "overdue") overdue += 1;
    if (sla.level === "warning") dueSoon += 1;

    const updatedAt = safeTime(ticket.atualizado_em);
    const waitingSince = safeTime(ticket.aguardando_cliente_desde);
    let motivo = "";
    if (sla.level === "overdue") motivo = "SLA vencido";
    else if (sla.level === "warning") motivo = "SLA acima de 80%";
    else if (!ticket.tecnico_id) motivo = "Sem tecnico";
    else if (String(ticket.prioridade || "").toUpperCase() === "CRITICO") motivo = "Chamado critico";
    else if (status === "AGUARDANDO_CLIENTE" && waitingSince && nowMs - waitingSince > 7 * TV_DAY_MS) motivo = "Aguardando cliente ha +7 dias";
    else if (updatedAt && nowMs - updatedAt > 3 * TV_DAY_MS) motivo = "Parado ha +3 dias";

    if (motivo) {
      attention.push({
        id: Number(ticket.id || 0),
        codigo: String(ticket.codigo || ""),
        titulo: String(ticket.titulo || "Chamado sem titulo"),
        status,
        prioridade: String(ticket.prioridade || ""),
        empresa: companyName(ticket),
        unidade: unitName(ticket),
        tecnico: techName(ticket),
        motivo,
        pct_sla: Math.round(sla.pct),
        age_hours: openedAt ? Math.round((nowMs - openedAt) / 36_000) / 100 : 0,
      });
    }
  });

  const statusRows = TV_STATUS_GROUPS.map((group) => {
    const byCompanyRow = statusByCompany[group.id] || { goodstorage: 0, petcare: 0, outros: 0 };
    return {
      id: group.id,
      name: group.name,
      color: group.color,
      total: Object.values(byCompanyRow).reduce((sum, value) => sum + value, 0),
      byCompany: byCompanyRow,
    };
  });

  const companyColumns = EMPTY_COMPANY_COLUMNS.map((company) => ({
    ...company,
    total: totalByCompany[company.id] || 0,
    open: openByCompany[company.id] || 0,
    pct: clampPct(totalOpen > 0 ? ((openByCompany[company.id] || 0) / totalOpen) * 100 : 0),
  }));

  attention.sort((a, b) => {
    const priorityScore = (item: TvAttentionItem) =>
      item.motivo.includes("SLA vencido") ? 5
        : item.motivo.includes("SLA acima") ? 4
          : item.motivo.includes("Sem tecnico") ? 3
            : item.motivo.includes("critico") ? 2
              : 1;
    return priorityScore(b) - priorityScore(a) || b.pct_sla - a.pct_sla || b.age_hours - a.age_hours;
  });

  return {
    totalOpen,
    createdToday,
    closedToday,
    overdue,
    dueSoon,
    unassigned,
    criticalOpen,
    companyColumns,
    byCompany,
    byStatus,
    statusRows,
    last7Days: Array.from(seriesMap.values()),
    attention: attention.slice(0, 12),
    counts: tableCounts,
    fetchedAt: now.toISOString(),
  };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const Dashboard = () => {
  const navigate = useNavigate();
  const { isTvView } = useUser();
  const [counts, setCounts] = useState({ empresas: 0, unidades: 0, operadoras: 0, links: 0 });
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [tvRawTickets, setTvRawTickets] = useState<TvTicketRow[]>([]);
  const [tvFiltersOpen, setTvFiltersOpen] = useState(false);
  const [tvCompanyFilters, setTvCompanyFilters] = useState<Record<string, boolean>>(DEFAULT_TV_COMPANY_FILTERS);
  const [tvTechnicianFilter, setTvTechnicianFilter] = useState("all");
  const [tvEditLayout, setTvEditLayout] = useState(false);
  const [tvActiveTile, setTvActiveTile] = useState<TvTileId | null>(null);
  const [tvLayout, setTvLayout] = useState<TvLayoutItem[]>(DEFAULT_TV_LAYOUT);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [secAgo, setSecAgo] = useState(0);
  const tvCanvasRef = useRef<HTMLDivElement | null>(null);
  const tvInteractionRef = useRef<TvCanvasInteraction | null>(null);
  const realtimeRefreshRef = useRef<number | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "live" | "fallback">("connecting");

  // Auto-enter TV mode for TV_VIEW users
  useEffect(() => {
    if (isTvView) {
      setTvMode(true);
      setSidebarHidden(true);
    }
  }, [isTvView]);

  useEffect(() => {
    try {
      const savedLayout = localStorage.getItem(TV_LAYOUT_STORAGE_KEY);
      if (!savedLayout) return;

      const parsed = JSON.parse(savedLayout) as TvLayoutItem[];
      if (!Array.isArray(parsed)) return;

      const hydrated = DEFAULT_TV_LAYOUT.map((item) => {
        const savedItem = parsed.find((candidate) => candidate.id === item.id);
        return normalizeTvLayoutItem(savedItem, item);
      });

      setTvLayout(hydrated);
    } catch {
      setTvLayout(DEFAULT_TV_LAYOUT);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(TV_LAYOUT_STORAGE_KEY, JSON.stringify(tvLayout));
    } catch {
      // Device-local layout preference only; safe to ignore storage failures.
    }
  }, [tvLayout]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = tvInteractionRef.current;
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

        if (handle.includes("e")) {
          nextW = clampRange(origin.w + dx, TV_CANVAS_MIN_W, 100 - origin.x);
        }

        if (handle.includes("s")) {
          nextH = clampRange(origin.h + dy, TV_CANVAS_MIN_H, 100 - origin.y);
        }

        if (handle.includes("w")) {
          const maxX = origin.x + origin.w - TV_CANVAS_MIN_W;
          nextX = clampRange(origin.x + dx, 0, maxX);
          nextW = origin.w + origin.x - nextX;
        }

        if (handle.includes("n")) {
          const maxY = origin.y + origin.h - TV_CANVAS_MIN_H;
          nextY = clampRange(origin.y + dy, 0, maxY);
          nextH = origin.h + origin.y - nextY;
        }
      }

      setTvLayout((layout) =>
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
      tvInteractionRef.current = null;
      setTvActiveTile(null);
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

  // Clock
  useEffect(() => {
    if (!tvMode) return;
    const t = setInterval(() => { setNow(new Date()); setSecAgo(p => p + 1); }, 1000);
    return () => clearInterval(t);
  }, [tvMode]);

  // Hide sidebar in TV mode
  useEffect(() => {
    if (sidebarHidden) {
      document.documentElement.setAttribute("data-sidebar-hidden", "true");
    } else {
      document.documentElement.removeAttribute("data-sidebar-hidden");
    }
    return () => document.documentElement.removeAttribute("data-sidebar-hidden");
  }, [sidebarHidden]);

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

  // Fetch Ariia TV data
  const fetchTickets = useCallback(async () => {
    try {
      setTicketError(null);
      setTicketLoading(true);

      const fetchStartedAt = new Date();
      const recentStart = new Date(fetchStartedAt.getTime() - 8 * TV_DAY_MS).toISOString();
      const sessionToken = localStorage.getItem("auth_token") || "";
      const ticketColumns = `
        id,codigo,titulo,status,prioridade,data_abertura,data_solucao,data_fechamento,atualizado_em,
        aguardando_cliente_desde,resolution_due_at,resolution_sla_status,sla_solucao_minutos,
        sla_pausa_inicio,sla_pausa_total_segundos,tecnico_id,empresa_id,unidade_id,
        empresas:empresa_id(id,nome_fantasia,razao_social),
        unidades:unidade_id(id,nome_unidade),
        usuarios:tecnico_id(id,nome)
      `;
      const makeCountQueries = () => [
        supabase.from("empresas").select("id", { count: "exact", head: true }),
        supabase.from("unidades").select("id", { count: "exact", head: true }),
        supabase.from("operadoras").select("id", { count: "exact", head: true }),
        supabase.from("links_internet").select("id", { count: "exact", head: true }),
      ] as const;

      if (sessionToken) {
        try {
          const [ticketsResult, empresasResult, unidadesResult, operadorasResult, linksResult] = await Promise.all([
            supabase.functions.invoke("list-tickets", {
              headers: { Authorization: `Bearer ${sessionToken}` },
            }),
            ...makeCountQueries(),
          ]);

          if (!ticketsResult.error) {
            const apiRows = Array.isArray(ticketsResult.data)
              ? ticketsResult.data
              : Array.isArray((ticketsResult.data as any)?.tickets)
                ? (ticketsResult.data as any).tickets
                : [];

            if (apiRows.length > 0) {
              const nextCounts = {
                empresas: empresasResult.count || 0,
                unidades: unidadesResult.count || 0,
                operadoras: operadorasResult.count || 0,
                links: linksResult.count || 0,
              };
              const nextRows = apiRows as TvTicketRow[];
              const nextData = buildTvData(nextRows, nextCounts, fetchStartedAt);

              setTvRawTickets(nextRows);
              setTicketData(nextData);
              setCounts(nextCounts);
              setLastUpdate(new Date());
              setSecAgo(0);
              return;
            }
          }
        } catch (apiError) {
          console.warn("TV internal ticket API fallback:", apiError);
        }
      }

      const openQuery = supabase
        .from("tickets")
        .select(ticketColumns)
        .not("status", "in", "(RESOLVIDO,FECHADO,CANCELADO)")
        .order("data_abertura", { ascending: false })
        .limit(5000);

      const openedRecentQuery = supabase
        .from("tickets")
        .select(ticketColumns)
        .gte("data_abertura", recentStart)
        .order("data_abertura", { ascending: false })
        .limit(5000);

      const solvedRecentQuery = supabase
        .from("tickets")
        .select(ticketColumns)
        .gte("data_solucao", recentStart)
        .order("data_solucao", { ascending: false })
        .limit(5000);

      const closedRecentQuery = supabase
        .from("tickets")
        .select(ticketColumns)
        .gte("data_fechamento", recentStart)
        .order("data_fechamento", { ascending: false })
        .limit(5000);

      const [
        openResult,
        openedRecentResult,
        solvedRecentResult,
        closedRecentResult,
        empresasResult,
        unidadesResult,
        operadorasResult,
        linksResult,
      ] = await Promise.all([
        openQuery,
        openedRecentQuery,
        solvedRecentQuery,
        closedRecentQuery,
        ...makeCountQueries(),
      ]);

      const firstError = [
        openResult.error,
        openedRecentResult.error,
        solvedRecentResult.error,
        closedRecentResult.error,
        empresasResult.error,
        unidadesResult.error,
        operadorasResult.error,
        linksResult.error,
      ].find(Boolean);
      if (firstError) throw firstError;

      const byId = new Map<number, TvTicketRow>();
      [openResult.data, openedRecentResult.data, solvedRecentResult.data, closedRecentResult.data].forEach((list) => {
        (list || []).forEach((ticket) => byId.set(Number((ticket as TvTicketRow).id), ticket as TvTicketRow));
      });

      const nextCounts = {
        empresas: empresasResult.count || 0,
        unidades: unidadesResult.count || 0,
        operadoras: operadorasResult.count || 0,
        links: linksResult.count || 0,
      };
      const nextRows = Array.from(byId.values());
      const nextData = buildTvData(nextRows, nextCounts, fetchStartedAt);

      setTvRawTickets(nextRows);
      setTicketData(nextData);
      setCounts(nextCounts);
      setLastUpdate(new Date());
      setSecAgo(0);
    } catch (err) {
      console.error("TV fetch error:", err);
      setTicketError(err instanceof Error ? err.message : "Erro ao carregar dados internos");
    } finally {
      setTicketLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!tvMode) return;
    fetchTickets();
    setRealtimeStatus("connecting");

    const fallbackInterval = window.setInterval(fetchTickets, REFRESH_INTERVAL);
    const channel = supabase
      .channel("ariia-tv-dashboard-tickets")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "tickets" },
        () => {
          if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current);
          realtimeRefreshRef.current = window.setTimeout(() => {
            fetchTickets();
            realtimeRefreshRef.current = null;
          }, 450);
        },
      )
      .subscribe((status) => {
        setRealtimeStatus(status === "SUBSCRIBED" ? "live" : "fallback");
      });

    return () => {
      window.clearInterval(fallbackInterval);
      if (realtimeRefreshRef.current) window.clearTimeout(realtimeRefreshRef.current);
      supabase.removeChannel(channel);
    };
  }, [tvMode, fetchTickets]);

  // Derived data
  const technicianOptions = useMemo(() => {
    const names = new Set<string>();
    tvRawTickets.forEach((ticket) => {
      const name = techName(ticket);
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tvRawTickets]);

  const filteredTvTickets = useMemo(() => {
    return tvRawTickets.filter((ticket) => {
      const bucket = companyBucket(ticket);
      if (tvCompanyFilters[bucket] === false) return false;

      const assignedName = techName(ticket);
      if (tvTechnicianFilter === "all") return true;
      if (tvTechnicianFilter === "__unassigned") return !ticket.tecnico_id && !assignedName;
      return assignedName === tvTechnicianFilter;
    });
  }, [tvRawTickets, tvCompanyFilters, tvTechnicianFilter]);

  const activeTicketData = useMemo(() => {
    if (!ticketData || tvRawTickets.length === 0) return ticketData;
    return buildTvData(filteredTvTickets, ticketData.counts || counts, lastUpdate || new Date(ticketData.fetchedAt));
  }, [ticketData, tvRawTickets.length, filteredTvTickets, counts, lastUpdate]);

  const totalOpen = activeTicketData?.totalOpen ?? 0;
  const companyColumns = useMemo(
    () => (activeTicketData?.companyColumns?.length ? activeTicketData.companyColumns : EMPTY_COMPANY_COLUMNS).slice(0, 3),
    [activeTicketData],
  );
  const statusGridTemplate = `minmax(130px, 1.1fr) minmax(100px, 0.8fr) repeat(${companyColumns.length}, minmax(90px, 1fr))`;

  const statusRows = useMemo(() => activeTicketData?.statusRows || [], [activeTicketData]);

  const lineData = useMemo(() => {
    return activeTicketData?.last7Days || [];
  }, [activeTicketData]);

  // ━━━ TV MODE ━━━
  if (tvMode) {
    const kpis = [
      { id: "total", name: "Abertos", val: totalOpen, icon: Ticket, color: C.cyan },
      { id: "today", name: "Abertos hoje", val: activeTicketData?.createdToday ?? 0, icon: Clock, color: C.blue },
      { id: "sla", name: "SLA vencido", val: activeTicketData?.overdue ?? 0, icon: AlertTriangle, color: C.danger },
      { id: "soon", name: "Vencendo", val: activeTicketData?.dueSoon ?? 0, icon: Clock, color: C.warning },
      { id: "unassigned", name: "Sem tecnico", val: activeTicketData?.unassigned ?? 0, icon: UserX, color: "#9fb4d1" },
      { id: "closed", name: "Fechados hoje", val: activeTicketData?.closedToday ?? 0, icon: CheckCircle2, color: C.ok },
    ];
    const trendData = lineData.slice(-7);
    const trendMax = Math.max(
      1,
      ...trendData.map((day) =>
        companyColumns.reduce((sum, company) => sum + Number(day[company.key] || 0), 0),
      ),
    );
    const companyTotal = companyColumns.reduce((sum, company) => sum + company.open, 0);
    const safeCompanyTotal = Math.max(1, companyTotal);
    const attentionItems = (activeTicketData?.attention || []).slice(0, 4);
    const companyGradient = (() => {
      if (companyTotal <= 0) return `conic-gradient(${C.grid} 0deg 360deg)`;
      let cursor = 0;
      const stops = companyColumns
        .filter((company) => company.open > 0)
        .map((company) => {
          const start = cursor;
          cursor += (company.open / safeCompanyTotal) * 360;
          return `${company.color} ${start}deg ${cursor}deg`;
        });
      return `conic-gradient(${stops.join(", ")})`;
    })();
    const healthItems = [
      { label: "SLA vencido", val: activeTicketData?.overdue ?? 0, color: C.danger },
      { label: "Vencendo", val: activeTicketData?.dueSoon ?? 0, color: C.warning },
      { label: "Criticos", val: activeTicketData?.criticalOpen ?? 0, color: "#9b83ff" },
      { label: "Sem tecnico", val: activeTicketData?.unassigned ?? 0, color: "#9fb4d1" },
    ];
    const structureItems = [
      { label: "Empresas", val: activeTicketData?.counts?.empresas ?? counts.empresas, icon: Building2, color: C.cyan },
      { label: "Unidades", val: activeTicketData?.counts?.unidades ?? counts.unidades, icon: MapPin, color: "#82ddff" },
      { label: "Operadoras", val: activeTicketData?.counts?.operadoras ?? counts.operadoras, icon: Radio, color: C.ok },
      { label: "Links", val: activeTicketData?.counts?.links ?? counts.links, icon: Wifi, color: "#9b83ff" },
    ];
    const realtimeLabel =
      realtimeStatus === "live"
        ? "Atualizacao em tempo real"
        : realtimeStatus === "connecting"
          ? "Conectando ao tempo real"
          : "Atualizacao periodica ativa";
    const lastUpdateLabel = lastUpdate ? lastUpdate.toLocaleTimeString("pt-BR") : "--:--:--";
    const activeCompanyFilterCount = EMPTY_COMPANY_COLUMNS.filter((company) => tvCompanyFilters[company.id] !== false).length;

    const resetTvFilters = () => {
      setTvCompanyFilters(DEFAULT_TV_COMPANY_FILTERS);
      setTvTechnicianFilter("all");
    };

    const resetTvLayout = () => {
      setTvLayout(DEFAULT_TV_LAYOUT);
      setTvActiveTile(null);
      tvInteractionRef.current = null;
    };

    const beginTvCanvasInteraction = (
      event: React.PointerEvent<HTMLElement>,
      item: TvLayoutItem,
      mode: "move" | "resize",
      handle?: TvResizeHandle,
    ) => {
      if (!tvEditLayout) return;

      const canvasRect = tvCanvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      event.preventDefault();
      event.stopPropagation();

      const topZ = Math.max(...tvLayout.map((candidate) => candidate.z || 0), 0);
      tvInteractionRef.current = {
        id: item.id,
        mode,
        handle,
        startX: event.clientX,
        startY: event.clientY,
        origin: item,
        rect: canvasRect,
      };
      setTvActiveTile(item.id);
      setTvLayout((layout) => {
        return layout.map((candidate) =>
          candidate.id === item.id ? { ...candidate, z: topZ + 1 } : candidate,
        );
      });
    };

    const renderResizeHandles = (item: TvLayoutItem) => {
      if (!tvEditLayout) return null;

      return (
        <>
          {TV_RESIZE_HANDLES.map((handle) => (
            <span
              key={handle.id}
              data-tv-no-drag
              onPointerDown={(event) => beginTvCanvasInteraction(event, item, "resize", handle.id)}
              className={`absolute z-30 ${handle.className}`}
              style={{ background: tvActiveTile === item.id ? "rgba(75,184,216,0.70)" : "rgba(160,185,220,0.28)" }}
            />
          ))}
        </>
      );
    };

    const renderTileControls = (item: TvLayoutItem) => {
      if (!tvEditLayout) return null;

      return (
        <div
          data-tv-no-drag
          onPointerDown={(event) => beginTvCanvasInteraction(event, item, "move")}
          className="absolute left-2 top-2 z-20 flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
          style={{ borderColor: C.border, background: "rgba(5,12,24,0.84)", color: C.dim, cursor: "move" }}
        >
          <Move className="h-3.5 w-3.5" />
          <span className="text-[10px] uppercase tracking-[0.10em]" style={{ fontWeight: 300 }}>
            {TV_TILE_LABELS[item.id]}
          </span>
        </div>
      );
    };

    const tileWrapperClass = (item: TvLayoutItem) =>
      `absolute min-h-0 rounded-lg ${tvEditLayout ? "select-none" : ""} ${tvActiveTile === item.id ? "ring-1" : ""}`;

    const tileWrapperStyle = (item: TvLayoutItem): React.CSSProperties => ({
      left: `${item.x}%`,
      top: `${item.y}%`,
      width: `${item.w}%`,
      height: `${item.h}%`,
      zIndex: item.z,
      touchAction: "none",
      ...(tvActiveTile === item.id ? { ["--tw-ring-color" as string]: "rgba(75,184,216,0.58)" } : {}),
    });

    const tilePointerHandlers = (item: TvLayoutItem) => ({
      onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
        if (!tvEditLayout) return;
        const target = event.target as HTMLElement;
        if (target.closest("[data-tv-no-drag]")) return;
        beginTvCanvasInteraction(event, item, "move");
      },
    });

    const tileContentPadding = tvEditLayout ? "pt-12" : "";

    const renderTileShell = (item: TvLayoutItem, children: React.ReactNode) => (
      <div key={item.id} className={tileWrapperClass(item)} style={tileWrapperStyle(item)} {...tilePointerHandlers(item)}>
        <TvPanel className={`h-full p-4 ${tileContentPadding}`}>
          {renderTileControls(item)}
          {renderResizeHandles(item)}
          {children}
        </TvPanel>
      </div>
    );

    const renderTvTile = (item: TvLayoutItem) => {
      if (item.id === "status") {
        return (
          renderTileShell(item, (
            <>
              <div className="mb-3 flex items-center justify-between gap-4 pr-24">
                <TvSectionTitle>Status por empresa</TvSectionTitle>
                <span className="text-sm 2xl:text-base" style={{ color: C.muted, fontWeight: 300 }}>GoodStorage / PetCare / Outros</span>
              </div>
              <div className="min-h-0 overflow-hidden">
                <div className="grid gap-0" style={{ borderBottom: `1px solid ${C.grid}`, gridTemplateColumns: statusGridTemplate }}>
                  {["Grupo", "Total", ...companyColumns.map((company) => company.name)].map((label, i) => (
                    <div key={label} className={`px-3 pb-2 ${i === 0 ? "text-left" : "text-center"}`}>
                      <span className="text-[11px] 2xl:text-xs uppercase tracking-[0.12em]" style={{ color: i > 1 ? companyColumns[i - 2]?.color || C.dim : C.dim, fontWeight: 300 }}>
                        {label}
                      </span>
                    </div>
                  ))}
                </div>
                {statusRows.map((status, i) => {
                  const row = status.byCompany || {};
                  const rowTotal = status.total;
                  return (
                    <div
                      key={status.id}
                      className="grid gap-0 items-center min-h-[58px]"
                      style={{
                        gridTemplateColumns: statusGridTemplate,
                        ...(i < statusRows.length - 1 ? { borderBottom: `1px solid ${C.grid}` } : {}),
                      }}
                    >
                      <div className="px-3 py-2 flex items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ background: status.color }} />
                          <span className="text-base 2xl:text-lg truncate" style={{ color: C.white, fontWeight: 300 }}>{status.name}</span>
                        </div>
                      </div>
                      <div className="px-3 py-2 flex items-center justify-center">
                        <span className="text-2xl 2xl:text-3xl tabular-nums" style={{ color: C.white, fontWeight: 300 }}>{formatMetric(rowTotal)}</span>
                      </div>
                      {companyColumns.map((company) => (
                        <div key={company.id} className="px-3 py-2 flex items-center justify-center">
                          <span className="text-2xl 2xl:text-3xl tabular-nums" style={{ color: C.white, fontWeight: 300 }}>{formatMetric(row[company.id] || 0)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          ))
        );
      }

      if (item.id === "trend") {
        return (
          renderTileShell(item, (
            <>
              <div className="mb-4 flex items-center justify-between gap-4 pr-24">
                <TvSectionTitle>Ultimos 7 dias</TvSectionTitle>
                <span className="text-sm 2xl:text-base" style={{ color: C.muted, fontWeight: 300 }}>Chamados abertos por dia</span>
              </div>
              <div className="space-y-3 overflow-hidden">
                {trendData.map((day) => {
                  const dayTotal = companyColumns.reduce((sum, company) => sum + Number(day[company.key] || 0), 0);
                  const barWidth = clampPct((dayTotal / trendMax) * 100);
                  return (
                    <div key={String(day.date || day.name)} className="grid items-center gap-3" style={{ gridTemplateColumns: "54px minmax(0, 1fr) 52px" }}>
                      <span className="text-sm 2xl:text-base uppercase" style={{ color: C.dim, fontWeight: 300 }}>{String(day.name || "")}</span>
                      <div className="h-8 overflow-hidden rounded-lg border" style={{ borderColor: C.grid, background: "rgba(160,185,220,0.08)" }}>
                        <div className="flex h-full min-w-[4px] overflow-hidden rounded-lg" style={{ width: `${dayTotal > 0 ? Math.max(6, barWidth) : 0}%` }}>
                          {companyColumns.map((company) => {
                            const value = Number(day[company.key] || 0);
                            return (
                              <div
                                key={company.id}
                                style={{
                                  width: dayTotal > 0 ? `${(value / dayTotal) * 100}%` : "0%",
                                  background: company.color,
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <span className="text-right text-xl 2xl:text-2xl tabular-nums" style={{ color: C.white, fontWeight: 300 }}>{formatMetric(dayTotal)}</span>
                    </div>
                  );
                })}
                {trendData.length === 0 && (
                  <div className="h-40 flex items-center justify-center text-base" style={{ color: C.muted }}>
                    Sem dados recentes
                  </div>
                )}
              </div>
            </>
          ))
        );
      }

      if (item.id === "companies") {
        return (
          renderTileShell(item, (
            <>
              <div className="flex items-center justify-between gap-4 pr-24">
                <TvSectionTitle>Distribuicao por empresa</TvSectionTitle>
                <span className="text-sm 2xl:text-base" style={{ color: C.muted, fontWeight: 300 }}>{formatMetric(companyTotal)} abertos</span>
              </div>
              <div className="mt-5 flex items-center justify-center gap-5">
                <div className="relative h-40 w-40 2xl:h-44 2xl:w-44 rounded-full flex-shrink-0" style={{ background: companyGradient, boxShadow: "0 16px 28px rgba(0,0,0,0.22)" }}>
                  <div className="absolute inset-5 rounded-full border" style={{ background: "rgba(7,18,34,0.88)", borderColor: "rgba(160,185,220,0.09)" }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-4xl 2xl:text-5xl leading-none tabular-nums" style={{ color: C.white, fontWeight: 300 }}>{formatMetric(totalOpen)}</span>
                    <span className="mt-1 text-xs uppercase tracking-[0.10em]" style={{ color: C.dim, fontWeight: 300 }}>Abertos</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  {companyColumns.map((company) => {
                    const pct = clampPct((company.open / safeCompanyTotal) * 100);
                    return (
                      <div key={company.id}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 text-sm 2xl:text-base" style={{ color: C.white, fontWeight: 300 }}>
                            <StaticDot color={company.color} />
                            <span className="truncate">{company.name}</span>
                          </span>
                          <span className="text-xl 2xl:text-2xl tabular-nums" style={{ color: C.white, fontWeight: 300 }}>{formatMetric(company.open)}</span>
                        </div>
                        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(160,185,220,0.10)" }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: company.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ))
        );
      }

      if (item.id === "base") {
        return (
          renderTileShell(item, (
            <>
              <div className="flex items-center justify-between gap-4 pr-24">
                <TvSectionTitle>Base Ariia</TvSectionTitle>
                <span className="text-sm 2xl:text-base" style={{ color: C.muted, fontWeight: 300 }}>Inventario interno</span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {structureItems.map((item) => (
                  <div key={item.label} className="rounded-lg border p-3" style={{ borderColor: "rgba(160,185,220,0.09)", background: "rgba(10,24,44,0.42)", boxShadow: "inset 0 1px 0 rgba(170,205,235,0.035)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs uppercase tracking-[0.10em]" style={{ color: C.dim, fontWeight: 300 }}>{item.label}</span>
                      <item.icon className="h-4 w-4" style={{ color: item.color }} />
                    </div>
                    <div className="mt-2 text-3xl 2xl:text-4xl leading-none tabular-nums" style={{ color: C.white, fontWeight: 300 }}>{formatMetric(item.val)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg border p-3" style={{ borderColor: "rgba(160,185,220,0.09)", background: "rgba(7,23,46,0.42)" }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.10em]" style={{ color: C.dim, fontWeight: 300 }}>Ultima leitura</span>
                  <span className="text-lg tabular-nums" style={{ color: C.white, fontWeight: 300 }}>{lastUpdateLabel}</span>
                </div>
              </div>
            </>
          ))
        );
      }

      if (item.id === "health") {
        return (
          renderTileShell(item, (
            <>
              <div className="flex items-center justify-between gap-4 mb-3 pr-24">
                <TvSectionTitle>Saude operacional</TvSectionTitle>
                <span className="text-sm 2xl:text-base" style={{ color: C.muted, fontWeight: 300 }}>Riscos ativos</span>
              </div>
              <div className="space-y-3">
                {healthItems.map((healthItem) => {
                  const pct = clampPct(totalOpen > 0 ? (healthItem.val / totalOpen) * 100 : 0);
                  return (
                    <div key={healthItem.label}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="text-sm 2xl:text-base" style={{ color: C.white, fontWeight: 300 }}>{healthItem.label}</span>
                        <span className="text-2xl 2xl:text-3xl tabular-nums" style={{ color: C.white, fontWeight: 300 }}>{formatMetric(healthItem.val)}</span>
                      </div>
                      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(160,185,220,0.10)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: healthItem.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ))
        );
      }

      return (
        renderTileShell(item, (
          <>
            <div className="flex items-center justify-between gap-4 mb-3 pr-24">
              <TvSectionTitle>Pontos de atencao</TvSectionTitle>
              <span className="text-sm 2xl:text-base" style={{ color: C.muted, fontWeight: 300 }}>{attentionItems.length} itens</span>
            </div>
            <div className="space-y-2.5 overflow-hidden">
              {attentionItems.map((attentionItem) => (
                <div key={attentionItem.id} className="rounded-lg border p-3" style={{ borderColor: C.grid, background: "rgba(8,24,46,0.54)", boxShadow: "inset 0 1px 0 rgba(170,205,235,0.035)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-[0.08em] truncate" style={{ color: C.warning, fontWeight: 300 }}>
                      {attentionItem.codigo || `#${attentionItem.id}`} - {attentionItem.motivo}
                    </span>
                    <span className="text-sm tabular-nums flex-shrink-0" style={{ color: attentionItem.pct_sla >= 100 ? C.danger : C.warning, fontWeight: 300 }}>
                      {attentionItem.pct_sla}%
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-base 2xl:text-lg" style={{ color: C.white, fontWeight: 300 }}>
                    {attentionItem.titulo}
                  </p>
                  <p className="mt-1 truncate text-xs 2xl:text-sm" style={{ color: C.dim, fontWeight: 300 }}>
                    {attentionItem.empresa}{attentionItem.tecnico ? ` - ${attentionItem.tecnico}` : ""}
                  </p>
                </div>
              ))}
              {attentionItems.length === 0 && (
                <div className="h-40 flex items-center justify-center text-base text-center" style={{ color: C.muted }}>
                  Nenhum ponto critico no momento
                </div>
              )}
            </div>
          </>
        ))
      );
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
              boxShadow: "0 18px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(170,205,235,0.04)",
              backdropFilter: "blur(2px)",
              WebkitBackdropFilter: "blur(2px)",
            }}
          >
            <header className="flex items-center justify-between gap-5 pb-3 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {!isTvView && (
                  <button onClick={() => { setTvMode(false); setSidebarHidden(false); }} aria-label="Sair do modo TV" title="Sair do modo TV" className="h-11 w-11 rounded-lg border flex items-center justify-center" style={{ borderColor: C.border, color: C.dim, background: C.panelFlat }}>
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                )}
                {!isTvView && (
                  <button onClick={() => setSidebarHidden(!sidebarHidden)} aria-label={sidebarHidden ? "Mostrar menu" : "Ocultar menu"} className="h-11 w-11 rounded-lg border flex items-center justify-center" title={sidebarHidden ? "Mostrar menu" : "Ocultar menu"} style={{ borderColor: C.border, color: C.dim, background: C.panelFlat }}>
                    {sidebarHidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                  </button>
                )}
                <div className="h-12 w-12 rounded-lg flex items-center justify-center border" style={{ background: C.panelSoft, color: C.white, borderColor: C.border, boxShadow: "inset 0 1px 0 rgba(170,205,235,0.04)" }}>
                  <Monitor className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl 2xl:text-3xl leading-none truncate" style={{ color: C.white, fontWeight: 300 }}>
                    Ariia TV Dashboard
                  </h1>
                  <div className="mt-1 flex items-center gap-2 text-sm 2xl:text-base" style={{ color: C.dim, fontWeight: 300 }}>
                    <StaticDot color={realtimeStatus === "live" ? C.ok : C.warning} />
                    <span>{realtimeLabel}</span>
                    <span style={{ color: C.muted }}>Dados internos do Ariia</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {ticketError && (
                  <span className="max-w-[520px] truncate text-xs px-3 py-2 rounded-lg border" style={{ color: C.danger, borderColor: "rgba(255,127,127,0.42)", background: "rgba(255,127,127,0.10)" }}>
                    Erro: {ticketError}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setTvFiltersOpen((open) => !open)}
                  className="flex h-12 items-center gap-2 rounded-lg border px-4 text-sm"
                  style={{ borderColor: tvFiltersOpen ? "rgba(75,184,216,0.42)" : C.border, color: C.white, background: tvFiltersOpen ? "rgba(75,184,216,0.14)" : "rgba(8,24,48,0.58)", fontWeight: 300 }}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtros
                </button>
                <button
                  type="button"
                  onClick={() => setTvEditLayout((editing) => !editing)}
                  className="flex h-12 items-center gap-2 rounded-lg border px-4 text-sm"
                  style={{ borderColor: tvEditLayout ? "rgba(75,184,216,0.42)" : C.border, color: C.white, background: tvEditLayout ? "rgba(75,184,216,0.14)" : "rgba(8,24,48,0.58)", fontWeight: 300 }}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {tvEditLayout ? "Concluir" : "Editar layout"}
                </button>
                {tvEditLayout && (
                  <button
                    type="button"
                    onClick={resetTvLayout}
                    className="flex h-12 w-12 items-center justify-center rounded-lg border"
                    title="Restaurar layout"
                    style={{ borderColor: C.border, color: C.dim, background: "rgba(8,24,48,0.58)" }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
                <div className="rounded-lg border px-4 py-2.5 text-right" style={{ borderColor: C.border, background: "rgba(10,24,44,0.54)", boxShadow: "inset 0 1px 0 rgba(170,205,235,0.04)" }}>
                  <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: C.dim, fontWeight: 400 }}>
                    {secAgo < 5 ? "Atualizado agora" : `Atualizado ha ${secAgo}s`}
                  </p>
                  <p className="font-mono text-2xl 2xl:text-3xl tabular-nums leading-tight" style={{ color: C.white }}>
                    {now.toLocaleTimeString("pt-BR")}
                  </p>
                </div>
                <button onClick={fetchTickets} disabled={ticketLoading} className="h-12 w-12 rounded-lg border flex items-center justify-center" style={{ borderColor: C.border, color: C.dim, background: "rgba(8,24,48,0.58)" }}>
                  <RefreshCw className={`h-5 w-5 ${ticketLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </header>

            {tvFiltersOpen && (
              <div
                className="absolute right-4 top-[82px] z-30 w-[380px] rounded-lg border p-4"
                style={{
                  background: "rgba(7,18,34,0.94)",
                  borderColor: "rgba(180,205,235,0.16)",
                  boxShadow: "0 24px 44px rgba(0,0,0,0.42), inset 0 1px 0 rgba(170,205,235,0.06)",
                }}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <TvSectionTitle>Filtros</TvSectionTitle>
                    <p className="mt-1 text-sm" style={{ color: C.dim, fontWeight: 300 }}>
                      {formatMetric(filteredTvTickets.length)} de {formatMetric(tvRawTickets.length)} chamados
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetTvFilters}
                    className="rounded-lg border px-3 py-2 text-xs"
                    style={{ borderColor: C.border, color: C.dim, background: "rgba(12,28,50,0.64)", fontWeight: 300 }}
                  >
                    Limpar
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.10em]" style={{ color: C.muted, fontWeight: 300 }}>
                      Empresas
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {EMPTY_COMPANY_COLUMNS.map((company) => {
                        const checked = tvCompanyFilters[company.id] !== false;
                        return (
                          <label
                            key={company.id}
                            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
                            style={{ borderColor: checked ? `${company.color}44` : C.border, background: checked ? `${company.color}14` : "rgba(12,28,50,0.40)" }}
                          >
                            <span className="flex items-center gap-2 text-sm" style={{ color: C.white, fontWeight: 300 }}>
                              <StaticDot color={company.color} />
                              {company.name}
                            </span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setTvCompanyFilters((filters) => ({
                                  ...filters,
                                  [company.id]: filters[company.id] === false,
                                }))
                              }
                              className="h-4 w-4 accent-cyan-400"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs uppercase tracking-[0.10em]" style={{ color: C.muted, fontWeight: 300 }}>
                      Tecnico
                    </label>
                    <select
                      value={tvTechnicianFilter}
                      onChange={(event) => setTvTechnicianFilter(event.target.value)}
                      className="h-11 w-full rounded-lg border px-3 text-sm outline-none"
                      style={{ borderColor: C.border, color: C.white, background: "rgba(12,28,50,0.86)", fontWeight: 300 }}
                    >
                      <option value="all">Todos os tecnicos</option>
                      <option value="__unassigned">Sem tecnico</option>
                      {technicianOptions.map((name) => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="rounded-lg border p-3" style={{ borderColor: C.grid, background: "rgba(10,24,44,0.42)" }}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm" style={{ color: C.dim, fontWeight: 300 }}>Empresas ativas</span>
                      <span className="text-lg tabular-nums" style={{ color: C.white, fontWeight: 300 }}>
                        {activeCompanyFilterCount}/3
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-3 flex-shrink-0">
              {kpis.map((k) => (
                <TvPanel key={k.id} className="p-3 min-h-[104px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] 2xl:text-xs uppercase tracking-[0.12em] truncate" style={{ color: C.dim, fontWeight: 300 }}>
                      {k.name}
                    </span>
                    <span className="h-8 w-8 rounded-lg border flex items-center justify-center flex-shrink-0" style={{ borderColor: `${k.color}22`, background: `${k.color}12` }}>
                      <k.icon className="h-4 w-4" style={{ color: k.color }} />
                    </span>
                  </div>
                  <div className="mt-1 text-3xl 2xl:text-[40px] leading-none tabular-nums" style={{ color: C.white, fontWeight: 300 }}>
                    {formatMetric(k.val)}
                  </div>
                  <div className="mt-3 h-2 rounded-full overflow-hidden" style={{ background: "rgba(160,185,220,0.10)" }}>
                    <div className="h-full rounded-full" style={{ width: `${clampPct(totalOpen > 0 ? (k.val / totalOpen) * 100 : k.id === "total" ? 100 : 0)}%`, background: k.color }} />
                  </div>
                </TvPanel>
              ))}
            </div>

            <main
              ref={tvCanvasRef}
              className="relative mt-3 flex-1 min-h-0 overflow-hidden rounded-lg border"
              style={{
                borderColor: tvEditLayout ? "rgba(75,184,216,0.26)" : "transparent",
                background: tvEditLayout ? "rgba(3,10,22,0.20)" : "transparent",
              }}
            >
              {tvLayout.map(renderTvTile)}
            </main>
          </div>
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
