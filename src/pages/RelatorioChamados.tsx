import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity, ArrowDownRight, ArrowUpRight, BarChart3, Building2, CheckCircle2, Download,
  FileSpreadsheet, FileText, Loader2, RefreshCw, Search, Timer, Trophy, Wifi,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  PDF_COLORS, SERIES_PALETTE, pdfBarChart, pdfCoverPage, pdfDonutChart, pdfGaugeBar,
  pdfHBarChart, pdfHeatmap, pdfKpiCards, pdfLineChart, pdfPageFooter, pdfPageHeader,
  pdfParetoChart, pdfStackedBarChart, type KpiItem,
} from "@/lib/pdfCharts";


/* ----------------------------- domínio ----------------------------- */

const STATUS_OPTIONS = [
  "NOVO", "TRIAGEM", "EM_ATENDIMENTO", "AGUARDANDO_CLIENTE", "AGUARDANDO_OPERADORA",
  "AGUARDANDO_TERCEIRO", "AGENDADO", "RESOLVIDO", "FECHADO", "CANCELADO",
] as const;

const OPEN_STATUSES = new Set([
  "NOVO", "TRIAGEM", "EM_ATENDIMENTO", "AGUARDANDO_CLIENTE",
  "AGUARDANDO_OPERADORA", "AGUARDANDO_TERCEIRO", "AGENDADO",
]);

const PRIORIDADES = ["CRITICO", "ALTO", "MEDIO", "BAIXO"] as const;
const ORIGENS = ["MANUAL", "EMAIL", "TELEFONE", "CHAT", "MONITORAMENTO", "API", "N8N"] as const;
const NIVEIS = ["N1", "N2", "N3"] as const;

const PERIOD_PRESETS = [
  { value: "7d", label: "Últimos 7 dias", days: 7 },
  { value: "30d", label: "Últimos 30 dias", days: 30 },
  { value: "90d", label: "Últimos 90 dias", days: 90 },
  { value: "180d", label: "Últimos 180 dias", days: 180 },
  { value: "365d", label: "Últimos 12 meses", days: 365 },
  { value: "custom", label: "Período personalizado", days: 0 },
];

const GROUP_BY = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
];

const PRIORITY_COLORS: Record<string, string> = {
  CRITICO: "hsl(0 75% 55%)",
  ALTO: "hsl(25 90% 55%)",
  MEDIO: "hsl(45 95% 55%)",
  BAIXO: "hsl(215 85% 65%)",
};

const label = (v: string | null | undefined) => (v ? v.replace(/_/g, " ") : "—");

interface Ticket {
  id: number; codigo: string; titulo: string;
  empresa_id: number | null; unidade_id: number | null; operadora_id: number | null; link_id: number | null;
  tecnico_id: number | null; fila_id: number | null; assigned_group_id: number | null;
  categoria_id: number | null; subcategoria_id: number | null;
  prioridade: string; status: string; origem: string; tipo_chamado: string; nivel_escalonamento: string;
  data_abertura: string; data_primeiro_atendimento: string | null;
  data_solucao: string | null; data_fechamento: string | null;
  first_response_due_at: string | null; resolution_due_at: string | null;
  first_response_sla_status: string | null; resolution_sla_status: string | null;
  motivo_encerramento: string | null; solicitante_nome: string | null; solicitante_email: string | null;
  ativo: string | null;
}

interface Named { id: number; nome: string }
interface Lookups {
  empresas: { id: number; nome_fantasia: string }[];
  unidades: { id: number; nome_unidade: string; empresa_id: number; cidade: string | null; estado: string | null }[];
  operadoras: Named[];
  tecnicos: (Named & { ativo: boolean | null })[];
  filas: (Named & { ativo: boolean | null })[];
  categorias: { id: number; nome: string; parent_id: number | null }[];
  grupos: (Named & { ativo: boolean | null })[];
  links: { id: number; nome_link: string | null; unidade_id: number; operadora_id: number; finalidade: string | null; tipo_link: string | null }[];
}

const EMPTY_LOOKUPS: Lookups = {
  empresas: [], unidades: [], operadoras: [], tecnicos: [], filas: [], categorias: [], grupos: [], links: [],
};

/* ----------------------------- helpers ----------------------------- */

const minutesBetween = (a: string, b: string) =>
  Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

const fmtDuration = (minutes: number | null) => {
  if (minutes === null || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
};

const avg = (values: number[]) => (values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null);

const closedAt = (t: Ticket) => t.data_solucao || t.data_fechamento;

const resolutionMinutes = (t: Ticket) => {
  const end = closedAt(t);
  return end ? minutesBetween(t.data_abertura, end) : null;
};

const firstResponseMinutes = (t: Ticket) =>
  t.data_primeiro_atendimento ? minutesBetween(t.data_abertura, t.data_primeiro_atendimento) : null;

const slaResolution = (t: Ticket): "CUMPRIDO" | "VIOLADO" | null => {
  const end = closedAt(t);
  if (!t.resolution_due_at) return null;
  const due = new Date(t.resolution_due_at).getTime();
  if (end) return new Date(end).getTime() <= due ? "CUMPRIDO" : "VIOLADO";
  return Date.now() > due ? "VIOLADO" : null;
};

const slaFirstResponse = (t: Ticket): "CUMPRIDO" | "VIOLADO" | null => {
  if (!t.first_response_due_at) return null;
  const due = new Date(t.first_response_due_at).getTime();
  if (t.data_primeiro_atendimento) return new Date(t.data_primeiro_atendimento).getTime() <= due ? "CUMPRIDO" : "VIOLADO";
  return Date.now() > due ? "VIOLADO" : null;
};

const bucketKey = (iso: string, mode: string) => {
  const d = parseISO(iso);
  if (mode === "month") return format(d, "yyyy-MM");
  if (mode === "week") {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return format(monday, "yyyy-MM-dd");
  }
  return format(d, "yyyy-MM-dd");
};

const bucketLabel = (key: string, mode: string) =>
  mode === "month"
    ? format(parseISO(key + "-01"), "MMM/yy", { locale: ptBR })
    : format(parseISO(key), "dd/MM", { locale: ptBR });

const rank = <T,>(items: T[], keyOf: (item: T) => string) => {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
};

/* ----------------------------- página ----------------------------- */

export default function RelatorioChamados() {
  const [period, setPeriod] = useState("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [compare, setCompare] = useState(true);
  const [groupBy, setGroupBy] = useState("day");

  const [empresaId, setEmpresaId] = useState("all");
  const [unidadeId, setUnidadeId] = useState("all");
  const [operadoraId, setOperadoraId] = useState("all");
  const [linkId, setLinkId] = useState("all");
  const [tecnicoId, setTecnicoId] = useState("all");
  const [filaId, setFilaId] = useState("all");
  const [grupoId, setGrupoId] = useState("all");
  const [categoriaId, setCategoriaId] = useState("all");
  const [tipoChamado, setTipoChamado] = useState("all");
  const [nivel, setNivel] = useState("all");
  const [origem, setOrigem] = useState("all");
  const [slaFilter, setSlaFilter] = useState("all");
  const [statusSel, setStatusSel] = useState<string[]>([]);
  const [prioridadeSel, setPrioridadeSel] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState<Ticket[]>([]);
  const [lookups, setLookups] = useState<Lookups>(EMPTY_LOOKUPS);

  const ranges = useMemo(() => {
    const now = new Date();
    if (period === "custom") {
      if (!customFrom || !customTo) return null;
      const from = new Date(`${customFrom}T00:00:00`);
      const till = new Date(`${customTo}T23:59:59`);
      if (from >= till) return null;
      const span = till.getTime() - from.getTime();
      return { from, till, prevFrom: new Date(from.getTime() - span), prevTill: from };
    }
    const days = PERIOD_PRESETS.find((p) => p.value === period)?.days || 30;
    const from = new Date(now.getTime() - days * 86400_000);
    return { from, till: now, prevFrom: new Date(now.getTime() - 2 * days * 86400_000), prevTill: from };
  }, [period, customFrom, customTo]);

  const fetchData = async () => {
    if (!ranges) {
      toast.error("Período inválido");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("report-tickets", {
        body: { from: ranges.prevFrom.toISOString(), till: ranges.till.toISOString() },
      });
      if (error) throw error;
      setRaw((data?.tickets as Ticket[]) || []);
      setLookups({ ...EMPTY_LOOKUPS, ...(data?.lookups || {}) });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar chamados");
      setRaw([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period, customFrom, customTo]);

  const names = useMemo(() => ({
    empresa: new Map(lookups.empresas.map((e) => [e.id, e.nome_fantasia])),
    unidade: new Map(lookups.unidades.map((u) => [u.id, u.nome_unidade])),
    operadora: new Map(lookups.operadoras.map((o) => [o.id, o.nome])),
    tecnico: new Map(lookups.tecnicos.map((t) => [t.id, t.nome])),
    fila: new Map(lookups.filas.map((f) => [f.id, f.nome])),
    grupo: new Map(lookups.grupos.map((g) => [g.id, g.nome])),
    categoria: new Map(lookups.categorias.map((c) => [c.id, c.nome])),
    link: new Map(lookups.links.map((l) => [l.id, l.nome_link || `Link #${l.id}`])),
  }), [lookups]);

  const unidadesFiltradas = useMemo(
    () => (empresaId === "all" ? lookups.unidades : lookups.unidades.filter((u) => String(u.empresa_id) === empresaId)),
    [lookups.unidades, empresaId],
  );

  const linksFiltrados = useMemo(() => lookups.links.filter((l) => {
    if (unidadeId !== "all" && String(l.unidade_id) !== unidadeId) return false;
    if (operadoraId !== "all" && String(l.operadora_id) !== operadoraId) return false;
    if (empresaId !== "all") {
      const u = lookups.unidades.find((x) => x.id === l.unidade_id);
      if (!u || String(u.empresa_id) !== empresaId) return false;
    }
    return true;
  }), [lookups.links, lookups.unidades, unidadeId, operadoraId, empresaId]);

  const matches = (t: Ticket) => {
    if (empresaId !== "all" && String(t.empresa_id) !== empresaId) return false;
    if (unidadeId !== "all" && String(t.unidade_id) !== unidadeId) return false;
    if (operadoraId !== "all" && String(t.operadora_id) !== operadoraId) return false;
    if (linkId !== "all" && String(t.link_id) !== linkId) return false;
    if (tecnicoId !== "all" && String(t.tecnico_id) !== tecnicoId) return false;
    if (filaId !== "all" && String(t.fila_id) !== filaId) return false;
    if (grupoId !== "all" && String(t.assigned_group_id) !== grupoId) return false;
    if (categoriaId !== "all" && String(t.categoria_id) !== categoriaId && String(t.subcategoria_id) !== categoriaId) return false;
    if (tipoChamado !== "all" && t.tipo_chamado !== tipoChamado) return false;
    if (nivel !== "all" && t.nivel_escalonamento !== nivel) return false;
    if (origem !== "all" && t.origem !== origem) return false;
    if (statusSel.length && !statusSel.includes(t.status)) return false;
    if (prioridadeSel.length && !prioridadeSel.includes(t.prioridade)) return false;
    if (slaFilter !== "all") {
      const res = slaResolution(t);
      const fr = slaFirstResponse(t);
      if (slaFilter === "res_ok" && res !== "CUMPRIDO") return false;
      if (slaFilter === "res_violado" && res !== "VIOLADO") return false;
      if (slaFilter === "fr_ok" && fr !== "CUMPRIDO") return false;
      if (slaFilter === "fr_violado" && fr !== "VIOLADO") return false;
    }
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      const haystack = [
        t.codigo, t.titulo, t.solicitante_nome, t.solicitante_email, t.ativo,
        names.unidade.get(t.unidade_id || -1), names.empresa.get(t.empresa_id || -1),
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(s)) return false;
    }
    return true;
  };

  const inRange = (t: Ticket, from: Date, till: Date) => {
    const ts = new Date(t.data_abertura).getTime();
    return ts >= from.getTime() && ts <= till.getTime();
  };

  const current = useMemo(
    () => (ranges ? raw.filter((t) => inRange(t, ranges.from, ranges.till) && matches(t)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, ranges, empresaId, unidadeId, operadoraId, linkId, tecnicoId, filaId, grupoId, categoriaId, tipoChamado, nivel, origem, slaFilter, statusSel, prioridadeSel, search, names],
  );

  const previous = useMemo(
    () => (ranges ? raw.filter((t) => inRange(t, ranges.prevFrom, ranges.prevTill) && matches(t)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, ranges, empresaId, unidadeId, operadoraId, linkId, tecnicoId, filaId, grupoId, categoriaId, tipoChamado, nivel, origem, slaFilter, statusSel, prioridadeSel, search, names],
  );

  const summarize = (list: Ticket[]) => {
    const abertos = list.filter((t) => OPEN_STATUSES.has(t.status)).length;
    const encerrados = list.filter((t) => t.status === "RESOLVIDO" || t.status === "FECHADO").length;
    const resMinutes = list.map(resolutionMinutes).filter((v): v is number => v !== null);
    const frMinutes = list.map(firstResponseMinutes).filter((v): v is number => v !== null);
    const slaRes = list.map(slaResolution).filter(Boolean) as string[];
    const slaFr = list.map(slaFirstResponse).filter(Boolean) as string[];
    return {
      total: list.length,
      abertos,
      encerrados,
      mttr: avg(resMinutes),
      tma: avg(frMinutes),
      slaResPct: slaRes.length ? Math.round((slaRes.filter((s) => s === "CUMPRIDO").length / slaRes.length) * 100) : null,
      slaFrPct: slaFr.length ? Math.round((slaFr.filter((s) => s === "CUMPRIDO").length / slaFr.length) * 100) : null,
      slaResViolados: slaRes.filter((s) => s === "VIOLADO").length,
    };
  };

  const kpi = useMemo(() => summarize(current), [current]);
  const kpiPrev = useMemo(() => summarize(previous), [previous]);

  const serie = useMemo(() => {
    const map = new Map<string, { abertos: number; encerrados: number }>();
    const touch = (key: string) => map.get(key) || map.set(key, { abertos: 0, encerrados: 0 }).get(key)!;
    for (const t of current) {
      touch(bucketKey(t.data_abertura, groupBy)).abertos += 1;
      const end = closedAt(t);
      if (end) touch(bucketKey(end, groupBy)).encerrados += 1;
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ periodo: bucketLabel(key, groupBy), ...v }));
  }, [current, groupBy]);

  const byStatus = useMemo(() => rank(current, (t) => label(t.status)), [current]);
  const byPrioridade = useMemo(
    () => PRIORIDADES.map((p) => ({ name: p, total: current.filter((t) => t.prioridade === p).length })).filter((r) => r.total),
    [current],
  );
  const byUnidade = useMemo(() => rank(current, (t) => names.unidade.get(t.unidade_id || -1) || "Sem unidade"), [current, names]);
  const byOperadora = useMemo(() => rank(current, (t) => names.operadora.get(t.operadora_id || -1) || "Sem operadora"), [current, names]);
  const byEmpresa = useMemo(() => rank(current, (t) => names.empresa.get(t.empresa_id || -1) || "Sem empresa"), [current, names]);
  const byCategoria = useMemo(() => rank(current, (t) => names.categoria.get(t.categoria_id || -1) || "Sem categoria"), [current, names]);
  const byTecnico = useMemo(() => rank(current, (t) => names.tecnico.get(t.tecnico_id || -1) || "Sem técnico"), [current, names]);
  const byFila = useMemo(() => rank(current, (t) => names.fila.get(t.fila_id || -1) || "Sem fila"), [current, names]);

  const mttrPor = (keyOf: (t: Ticket) => string) => {
    const map = new Map<string, number[]>();
    for (const t of current) {
      const m = resolutionMinutes(t);
      if (m === null) continue;
      const key = keyOf(t);
      map.set(key, [...(map.get(key) || []), m]);
    }
    return Array.from(map.entries())
      .map(([name, list]) => ({ name, minutos: avg(list) || 0, chamados: list.length }))
      .sort((a, b) => b.minutos - a.minutos);
  };

  const mttrOperadora = useMemo(() => mttrPor((t) => names.operadora.get(t.operadora_id || -1) || "Sem operadora"), [current, names]);
  const mttrUnidade = useMemo(() => mttrPor((t) => names.unidade.get(t.unidade_id || -1) || "Sem unidade"), [current, names]);

  const resetFilters = () => {
    setEmpresaId("all"); setUnidadeId("all"); setOperadoraId("all"); setLinkId("all");
    setTecnicoId("all"); setFilaId("all"); setGrupoId("all"); setCategoriaId("all");
    setTipoChamado("all"); setNivel("all"); setOrigem("all"); setSlaFilter("all");
    setStatusSel([]); setPrioridadeSel([]); setSearch("");
  };

  const toggle = (setter: (fn: (prev: string[]) => string[]) => void, value: string) =>
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const detailRows = () => current.map((t) => ({
    Código: t.codigo,
    Abertura: format(parseISO(t.data_abertura), "dd/MM/yyyy HH:mm"),
    Empresa: names.empresa.get(t.empresa_id || -1) || "—",
    Unidade: names.unidade.get(t.unidade_id || -1) || "—",
    Operadora: names.operadora.get(t.operadora_id || -1) || "—",
    Título: t.titulo,
    Tipo: t.tipo_chamado,
    Categoria: names.categoria.get(t.categoria_id || -1) || "—",
    Fila: names.fila.get(t.fila_id || -1) || "—",
    Técnico: names.tecnico.get(t.tecnico_id || -1) || "—",
    Prioridade: t.prioridade,
    Status: label(t.status),
    Nível: t.nivel_escalonamento,
    Origem: t.origem,
    "1º atendimento (min)": firstResponseMinutes(t) ?? "",
    "Solução (min)": resolutionMinutes(t) ?? "",
    "SLA 1º atendimento": slaFirstResponse(t) || "—",
    "SLA solução": slaResolution(t) || "—",
  }));

  const exportXLSX = () => {
    if (!current.length) return toast.error("Sem dados para exportar");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Indicador: "Total de chamados", Valor: kpi.total },
      { Indicador: "Em aberto", Valor: kpi.abertos },
      { Indicador: "Encerrados", Valor: kpi.encerrados },
      { Indicador: "Tempo médio de 1º atendimento", Valor: fmtDuration(kpi.tma) },
      { Indicador: "Tempo médio de solução (MTTR)", Valor: fmtDuration(kpi.mttr) },
      { Indicador: "SLA de solução cumprido (%)", Valor: kpi.slaResPct ?? "—" },
      { Indicador: "Operadora com mais chamados", Valor: byOperadora[0]?.name || "—" },
      { Indicador: "Unidade com mais chamados", Valor: byUnidade[0]?.name || "—" },
    ]), "Resumo");
    const sheet = (rows: { name: string; total: number }[]) =>
      XLSX.utils.json_to_sheet(rows.map((r, i) => ({ "#": i + 1, Nome: r.name, Chamados: r.total })));
    XLSX.utils.book_append_sheet(wb, sheet(byEmpresa), "Empresas");
    XLSX.utils.book_append_sheet(wb, sheet(byUnidade), "Unidades");
    XLSX.utils.book_append_sheet(wb, sheet(byOperadora), "Operadoras");
    XLSX.utils.book_append_sheet(wb, sheet(byCategoria), "Categorias");
    XLSX.utils.book_append_sheet(wb, sheet(byTecnico), "Tecnicos");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      mttrOperadora.map((r) => ({ Operadora: r.name, "MTTR (min)": r.minutos, Chamados: r.chamados })),
    ), "MTTR Operadoras");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows()), "Chamados");
    XLSX.writeFile(wb, `relatorio-chamados-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const exportCSV = () => {
    const rows = detailRows();
    if (!rows.length) return toast.error("Sem dados para exportar");
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(";"),
      ...rows.map((r) => headers.map((h) => `"${String((r as any)[h] ?? "").replace(/"/g, '""')}"`).join(";")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-chamados-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* --------------------------- exportação PDF --------------------------- */

  const SLA_META = 95;

  const activeFilterLabels = () => {
    const out: string[] = [];
    if (empresaId !== "all") out.push(`Empresa: ${names.empresa.get(Number(empresaId)) || empresaId}`);
    if (unidadeId !== "all") out.push(`Unidade: ${names.unidade.get(Number(unidadeId)) || unidadeId}`);
    if (operadoraId !== "all") out.push(`Operadora: ${names.operadora.get(Number(operadoraId)) || operadoraId}`);
    if (linkId !== "all") out.push(`Link: ${names.link.get(Number(linkId)) || linkId}`);
    if (tecnicoId !== "all") out.push(`Técnico: ${names.tecnico.get(Number(tecnicoId)) || tecnicoId}`);
    if (filaId !== "all") out.push(`Fila: ${names.fila.get(Number(filaId)) || filaId}`);
    if (grupoId !== "all") out.push(`Equipe: ${names.grupo.get(Number(grupoId)) || grupoId}`);
    if (categoriaId !== "all") out.push(`Categoria: ${names.categoria.get(Number(categoriaId)) || categoriaId}`);
    if (tipoChamado !== "all") out.push(`Tipo: ${tipoChamado}`);
    if (nivel !== "all") out.push(`Nível: ${nivel}`);
    if (origem !== "all") out.push(`Origem: ${origem}`);
    if (slaFilter !== "all") out.push(`SLA: ${slaFilter}`);
    if (statusSel.length) out.push(`Status: ${statusSel.map(label).join(", ")}`);
    if (prioridadeSel.length) out.push(`Prioridade: ${prioridadeSel.join(", ")}`);
    if (search.trim()) out.push(`Busca: "${search.trim()}"`);
    return out;
  };

  /** Métricas agregadas por dimensão, usadas nas tabelas cruzadas do PDF. */
  const crossBy = (keyOf: (t: Ticket) => string) => {
    const map = new Map<string, Ticket[]>();
    for (const t of current) {
      const k = keyOf(t);
      map.set(k, [...(map.get(k) || []), t]);
    }
    return Array.from(map.entries())
      .map(([name, list]) => {
        const s = summarize(list);
        return {
          name,
          total: s.total,
          abertos: s.abertos,
          encerrados: s.encerrados,
          mttr: s.mttr,
          tma: s.tma,
          slaPct: s.slaResPct,
          violados: s.slaResViolados,
          criticos: list.filter((t) => t.prioridade === "CRITICO").length,
        };
      })
      .sort((a, b) => b.total - a.total);
  };

  const exportPDF = () => {
    if (!current.length) return toast.error("Sem dados para exportar");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const periodo = ranges
      ? `${format(ranges.from, "dd/MM/yyyy HH:mm")} a ${format(ranges.till, "dd/MM/yyyy HH:mm")}`
      : "—";
    const geradoEm = format(new Date(), "dd/MM/yyyy HH:mm");
    const footer = `Ariia 2lock · Relatório de Chamados · ${periodo}`;

    const M = 12;
    const colW = (W - M * 2 - 6) / 2;
    const rowY1 = 24;
    const rowY2 = 112;
    const chartH = 82;

    const newSection = (title: string) => {
      doc.addPage();
      pdfPageHeader(doc, title, `${periodo} · gerado em ${geradoEm}`);
      pdfPageFooter(doc, footer);
    };

    /* ---------- dados derivados ---------- */
    const bucketsSorted = (() => {
      const set = new Set<string>();
      for (const t of current) {
        set.add(bucketKey(t.data_abertura, groupBy));
        const end = closedAt(t);
        if (end) set.add(bucketKey(end, groupBy));
      }
      return Array.from(set).sort();
    })();
    const bucketLabels = bucketsSorted.map((k) => bucketLabel(k, groupBy));

    const abertosSerie = bucketsSorted.map((k) => current.filter((t) => bucketKey(t.data_abertura, groupBy) === k).length);
    const encerradosSerie = bucketsSorted.map(
      (k) => current.filter((t) => { const e = closedAt(t); return e && bucketKey(e, groupBy) === k; }).length,
    );
    const backlogSerie = (() => {
      let acc = 0;
      return bucketsSorted.map((_, i) => { acc += abertosSerie[i] - encerradosSerie[i]; return Math.max(0, acc); });
    })();

    const prioridadeStack = PRIORIDADES.map((p, i) => ({
      name: p,
      color: [PDF_COLORS.red, PDF_COLORS.orange, PDF_COLORS.amber, PDF_COLORS.lightBlue][i],
      values: bucketsSorted.map(
        (k) => current.filter((t) => t.prioridade === p && bucketKey(t.data_abertura, groupBy) === k).length,
      ),
    }));

    const mttrSerie = bucketsSorted.map((k) => {
      const mins = current
        .filter((t) => { const e = closedAt(t); return e && bucketKey(e, groupBy) === k; })
        .map(resolutionMinutes)
        .filter((v): v is number => v !== null);
      return mins.length ? Math.round((avg(mins) || 0) / 60) : 0;
    });

    const slaSerie = bucketsSorted.map((k) => {
      const list = current.filter((t) => bucketKey(t.data_abertura, groupBy) === k);
      const st = list.map(slaResolution).filter(Boolean) as string[];
      return st.length ? Math.round((st.filter((s) => s === "CUMPRIDO").length / st.length) * 100) : 0;
    });
    const slaFrSerie = bucketsSorted.map((k) => {
      const list = current.filter((t) => bucketKey(t.data_abertura, groupBy) === k);
      const st = list.map(slaFirstResponse).filter(Boolean) as string[];
      return st.length ? Math.round((st.filter((s) => s === "CUMPRIDO").length / st.length) * 100) : 0;
    });

    const violPorUnidade = crossBy((t) => names.unidade.get(t.unidade_id || -1) || "Sem unidade")
      .filter((r) => r.violados > 0)
      .sort((a, b) => b.violados - a.violados);
    const violPorOperadora = crossBy((t) => names.operadora.get(t.operadora_id || -1) || "Sem operadora")
      .filter((r) => r.violados > 0)
      .sort((a, b) => b.violados - a.violados);

    const byOrigem = rank(current, (t) => label(t.origem) || "—");
    const byTipo = rank(current, (t) => label(t.tipo_chamado) || "—");
    const byNivel = rank(current, (t) => t.nivel_escalonamento || "—");

    const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const heatDowHour = DOW.map((_, d) =>
      Array.from({ length: 24 }, (_, h) =>
        current.filter((t) => {
          const dt = parseISO(t.data_abertura);
          return dt.getDay() === d && dt.getHours() === h;
        }).length,
      ),
    );

    const topUnidades = byUnidade.slice(0, 10).map((r) => r.name);
    const heatUnidadePrio = topUnidades.map((u) =>
      PRIORIDADES.map((p) => current.filter(
        (t) => (names.unidade.get(t.unidade_id || -1) || "Sem unidade") === u && t.prioridade === p,
      ).length),
    );

    const crossUnidade = crossBy((t) => names.unidade.get(t.unidade_id || -1) || "Sem unidade");
    const crossOperadora = crossBy((t) => names.operadora.get(t.operadora_id || -1) || "Sem operadora");
    const crossTecnico = crossBy((t) => names.tecnico.get(t.tecnico_id || -1) || "Sem técnico");
    const crossCategoria = crossBy((t) => names.categoria.get(t.categoria_id || -1) || "Sem categoria");

    const delta = (cur: number | null, prev: number | null, invert = false) => {
      if (cur === null || prev === null || prev === 0) return undefined;
      const diff = Math.round(((cur - prev) / prev) * 100);
      const sign = diff > 0 ? "+" : "";
      const tone: KpiItem["tone"] = diff === 0 ? "neutral" : (invert ? diff < 0 : diff > 0) ? "good" : "bad";
      return { hint: `${sign}${diff}% vs. período anterior`, tone };
    };

    /* ---------- 1. Capa ---------- */
    pdfCoverPage(doc, {
      title: "Relatório de Chamados",
      subtitle: "Indicadores operacionais, SLA e cruzamentos",
      periodo,
      geradoEm,
      filtros: activeFilterLabels(),
    });

    /* ---------- 2. Painel de indicadores ---------- */
    newSection("Painel de indicadores");
    const d1 = delta(kpi.total, kpiPrev.total, true);
    const d2 = delta(kpi.mttr, kpiPrev.mttr, true);
    const d3 = delta(kpi.tma, kpiPrev.tma, true);
    const d4 = delta(kpi.slaResPct, kpiPrev.slaResPct);
    const kpis: KpiItem[] = [
      { label: "Total de chamados", value: String(kpi.total), hint: d1?.hint, tone: d1?.tone },
      { label: "Em aberto", value: String(kpi.abertos), tone: kpi.abertos ? "warn" : "good" },
      { label: "Encerrados", value: String(kpi.encerrados), tone: "good" },
      { label: "Backlog final", value: String(Math.max(0, kpi.total - kpi.encerrados)) },
      { label: "MTTR (solução)", value: fmtDuration(kpi.mttr), hint: d2?.hint, tone: d2?.tone },
      { label: "Tempo 1º atendimento", value: fmtDuration(kpi.tma), hint: d3?.hint, tone: d3?.tone },
      { label: "SLA solução cumprido", value: kpi.slaResPct !== null ? `${kpi.slaResPct}%` : "—", hint: d4?.hint, tone: d4?.tone },
      { label: "SLA 1º atendimento", value: kpi.slaFrPct !== null ? `${kpi.slaFrPct}%` : "—" },
      { label: "SLA violados", value: String(kpi.slaResViolados), tone: kpi.slaResViolados ? "bad" : "good" },
      { label: "Chamados críticos", value: String(current.filter((t) => t.prioridade === "CRITICO").length), tone: "bad" },
      { label: "Unidade + acionada", value: (byUnidade[0]?.name || "—").slice(0, 22), hint: byUnidade[0] ? `${byUnidade[0].total} chamados` : undefined },
      { label: "Operadora + acionada", value: (byOperadora[0]?.name || "—").slice(0, 22), hint: byOperadora[0] ? `${byOperadora[0].total} chamados` : undefined },
    ];
    pdfKpiCards(doc, { x: M, y: 24, w: W - M * 2, h: 46 }, kpis, 6, 22);

    pdfGaugeBar(
      doc, { x: M, y: 74, w: colW, h: 34 },
      "SLA de solução — dentro x fora do prazo",
      kpi.slaResPct ?? 0, SLA_META,
      `${current.filter((t) => slaResolution(t) === "CUMPRIDO").length} dentro do prazo`,
      `${kpi.slaResViolados} fora do prazo`,
    );
    pdfGaugeBar(
      doc, { x: M + colW + 6, y: 74, w: colW, h: 34 },
      "SLA de 1º atendimento — dentro x fora do prazo",
      kpi.slaFrPct ?? 0, SLA_META,
      `${current.filter((t) => slaFirstResponse(t) === "CUMPRIDO").length} dentro do prazo`,
      `${current.filter((t) => slaFirstResponse(t) === "VIOLADO").length} fora do prazo`,
    );

    pdfLineChart(
      doc, { x: M, y: 112, w: colW, h: 76 },
      "Nível de serviço (% dentro do SLA) x meta",
      bucketLabels,
      [
        { name: "SLA solução", color: PDF_COLORS.blue, values: slaSerie },
        { name: "SLA 1º atendimento", color: PDF_COLORS.teal, values: slaFrSerie },
        { name: `Meta ${SLA_META}%`, color: PDF_COLORS.red, values: bucketsSorted.map(() => SLA_META), dashed: true },
      ],
      (v) => `${Math.round(v)}%`,
    );
    pdfDonutChart(
      doc, { x: M + colW + 6, y: 112, w: colW, h: 76 },
      "Distribuição por status",
      byStatus.slice(0, 8).map((r, i) => ({ name: r.name, value: r.total, color: SERIES_PALETTE[i % SERIES_PALETTE.length] })),
    );

    /* ---------- 3. Volume, backlog e tempos ---------- */
    newSection("Volume, backlog e tempos");
    pdfLineChart(
      doc, { x: M, y: rowY1, w: colW, h: chartH },
      "Chamados abertos, encerrados e backlog",
      bucketLabels,
      [
        { name: "Abertos", color: PDF_COLORS.navy, values: abertosSerie },
        { name: "Encerrados", color: PDF_COLORS.teal, values: encerradosSerie },
        { name: "Backlog", color: PDF_COLORS.orange, values: backlogSerie },
      ],
    );
    pdfStackedBarChart(
      doc, { x: M + colW + 6, y: rowY1, w: colW, h: chartH },
      "Composição por prioridade no tempo",
      bucketLabels,
      prioridadeStack,
    );
    pdfBarChart(
      doc, { x: M, y: rowY2, w: colW, h: chartH },
      "MTTR médio por período (horas)",
      bucketLabels,
      [{ name: "MTTR (h)", color: PDF_COLORS.purple, values: mttrSerie }],
      (v) => `${Math.round(v)}h`,
      true,
    );
    pdfHeatmap(
      doc, { x: M + colW + 6, y: rowY2, w: colW, h: chartH },
      "Abertura por dia da semana x hora",
      DOW,
      Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0")),
      heatDowHour,
    );

    /* ---------- 4. SLA e criticidade ---------- */
    newSection("SLA e criticidade");
    pdfHBarChart(
      doc, { x: M, y: rowY1, w: colW, h: chartH },
      "Unidades com mais violações de SLA",
      violPorUnidade.slice(0, 10).map((r) => ({ name: r.name, value: r.violados, color: PDF_COLORS.red })),
    );
    pdfHBarChart(
      doc, { x: M + colW + 6, y: rowY1, w: colW, h: chartH },
      "Operadoras com mais violações de SLA",
      violPorOperadora.slice(0, 10).map((r) => ({ name: r.name, value: r.violados, color: PDF_COLORS.orange })),
    );
    pdfBarChart(
      doc, { x: M, y: rowY2, w: colW, h: chartH },
      "% dentro do SLA por unidade (Top 12) x meta",
      crossUnidade.slice(0, 12).map((r) => r.name.slice(0, 12)),
      [
        { name: "% dentro do SLA", color: PDF_COLORS.blue, values: crossUnidade.slice(0, 12).map((r) => r.slaPct ?? 0) },
        { name: `Meta ${SLA_META}%`, color: PDF_COLORS.red, values: crossUnidade.slice(0, 12).map(() => SLA_META) },
      ],
      (v) => `${Math.round(v)}%`,
    );
    pdfHeatmap(
      doc, { x: M + colW + 6, y: rowY2, w: colW, h: chartH },
      "Unidade x prioridade",
      topUnidades,
      [...PRIORIDADES],
      heatUnidadePrio,
      PDF_COLORS.red,
    );

    /* ---------- 5. Rankings ---------- */
    newSection("Rankings e Pareto");
    pdfHBarChart(
      doc, { x: M, y: rowY1, w: colW, h: chartH },
      "Top unidades por chamados",
      byUnidade.slice(0, 10).map((r) => ({ name: r.name, value: r.total, color: PDF_COLORS.navy })),
    );
    pdfHBarChart(
      doc, { x: M + colW + 6, y: rowY1, w: colW, h: chartH },
      "Top operadoras por chamados",
      byOperadora.slice(0, 10).map((r) => ({ name: r.name, value: r.total, color: PDF_COLORS.blue })),
    );
    pdfParetoChart(
      doc, { x: M, y: rowY2, w: colW, h: chartH },
      "Pareto — categorias de serviço",
      byCategoria.slice(0, 10).map((r) => ({ name: r.name.slice(0, 12), value: r.total })),
    );
    pdfHBarChart(
      doc, { x: M + colW + 6, y: rowY2, w: colW, h: chartH },
      "Top técnicos por chamados atendidos",
      byTecnico.slice(0, 10).map((r) => ({ name: r.name, value: r.total, color: PDF_COLORS.teal })),
    );

    /* ---------- 6. Cruzamentos operacionais ---------- */
    newSection("Cruzamentos operacionais");
    pdfDonutChart(
      doc, { x: M, y: rowY1, w: colW, h: chartH },
      "Forma de solicitação (origem)",
      byOrigem.slice(0, 8).map((r, i) => ({ name: r.name, value: r.total, color: SERIES_PALETTE[i % SERIES_PALETTE.length] })),
    );
    pdfDonutChart(
      doc, { x: M + colW + 6, y: rowY1, w: colW, h: chartH },
      "Tipos de chamado",
      byTipo.slice(0, 8).map((r, i) => ({ name: r.name, value: r.total, color: SERIES_PALETTE[(i + 3) % SERIES_PALETTE.length] })),
    );
    pdfBarChart(
      doc, { x: M, y: rowY2, w: colW, h: chartH },
      "Atendimento por nível de solução",
      byNivel.map((r) => r.name),
      [{ name: "Chamados", color: PDF_COLORS.navy, values: byNivel.map((r) => r.total) }],
      (v) => String(Math.round(v)),
      true,
    );
    pdfHBarChart(
      doc, { x: M + colW + 6, y: rowY2, w: colW, h: chartH },
      "MTTR por operadora (horas)",
      mttrOperadora.slice(0, 10).map((r) => ({ name: r.name, value: Math.round(r.minutos / 60), color: PDF_COLORS.purple })),
      (v) => `${v}h`,
    );

    /* ---------- 7. Tabelas cruzadas ---------- */
    const crossTable = (
      title: string,
      dimension: string,
      rows: ReturnType<typeof crossBy>,
      startY: number,
    ) => {
      autoTable(doc, {
        startY,
        head: [[dimension, "Total", "Abertos", "Encerrados", "Críticos", "1º atend.", "MTTR", "SLA %", "Violados"]],
        body: rows.slice(0, 15).map((r) => [
          r.name, String(r.total), String(r.abertos), String(r.encerrados), String(r.criticos),
          fmtDuration(r.tma), fmtDuration(r.mttr), r.slaPct !== null ? `${r.slaPct}%` : "—", String(r.violados),
        ]),
        styles: { fontSize: 7, cellPadding: 1.4 },
        headStyles: { fillColor: PDF_COLORS.navy as [number, number, number], fontSize: 7 },
        alternateRowStyles: { fillColor: [246, 248, 251] },
        margin: { left: M, right: M },
        didDrawPage: () => {
          pdfPageHeader(doc, title, `${periodo} · gerado em ${geradoEm}`);
          pdfPageFooter(doc, footer);
        },
      });
      return ((doc as any).lastAutoTable?.finalY ?? startY) + 8;
    };

    doc.addPage();
    let y = crossTable("Cruzamento por unidade e operadora", "Unidade", crossUnidade, 24);
    y = crossTable("Cruzamento por unidade e operadora", "Operadora", crossOperadora, y);

    doc.addPage();
    y = crossTable("Cruzamento por técnico e categoria", "Técnico", crossTecnico, 24);
    y = crossTable("Cruzamento por técnico e categoria", "Categoria", crossCategoria, y);

    /* ---------- 8. Série temporal detalhada ---------- */
    doc.addPage();
    autoTable(doc, {
      startY: 24,
      head: [["Período", "Abertos", "Encerrados", "Backlog", "MTTR (h)", "SLA solução %", "SLA 1º atend. %"]],
      body: bucketLabels.map((l, i) => [
        l, String(abertosSerie[i]), String(encerradosSerie[i]), String(backlogSerie[i]),
        String(mttrSerie[i]), `${slaSerie[i]}%`, `${slaFrSerie[i]}%`,
      ]),
      styles: { fontSize: 7, cellPadding: 1.4 },
      headStyles: { fillColor: PDF_COLORS.navy as [number, number, number], fontSize: 7 },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      margin: { left: M, right: M },
      didDrawPage: () => {
        pdfPageHeader(doc, "Série temporal consolidada", `${periodo} · gerado em ${geradoEm}`);
        pdfPageFooter(doc, footer);
      },
    });

    /* ---------- 9. Detalhamento ---------- */
    doc.addPage();
    const rows = detailRows();
    const cols = [
      "Código", "Abertura", "Empresa", "Unidade", "Operadora", "Título", "Tipo",
      "Prioridade", "Status", "Técnico", "1º atendimento (min)", "Solução (min)", "SLA solução",
    ];
    autoTable(doc, {
      startY: 24,
      head: [cols],
      body: rows.map((r) => cols.map((c) => String((r as any)[c] ?? "—"))),
      styles: { fontSize: 6, cellPadding: 1 },
      headStyles: { fillColor: PDF_COLORS.navy as [number, number, number], fontSize: 6 },
      alternateRowStyles: { fillColor: [246, 248, 251] },
      margin: { left: M, right: M, top: 24, bottom: 14 },
      didDrawPage: () => {
        pdfPageHeader(doc, "Detalhamento dos chamados", `${rows.length} registros · ${periodo}`);
        pdfPageFooter(doc, footer);
      },
    });

    doc.save(`relatorio-chamados-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };


  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatório de Chamados</h1>
          <p className="text-sm text-muted-foreground">
            Volume, tempo médio, SLA, operadoras e unidades — com filtros granulares e comparação de períodos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportXLSX}><FileSpreadsheet className="mr-2 h-4 w-4" /> Excel</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="mr-2 h-4 w-4" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileText className="mr-2 h-4 w-4" /> PDF</Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Filtros</CardTitle>
          <Button variant="ghost" size="sm" onClick={resetFilters}>Limpar filtros</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Período</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {period === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label>De</Label>
                  <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Até</Label>
                  <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>Agrupar série por</Label>
              <Select value={groupBy} onValueChange={setGroupBy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GROUP_BY.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch id="compare" checked={compare} onCheckedChange={setCompare} />
              <Label htmlFor="compare" className="cursor-pointer">Comparar com período anterior</Label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FilterSelect label="Empresa" value={empresaId} onChange={(v) => { setEmpresaId(v); setUnidadeId("all"); setLinkId("all"); }}
              options={lookups.empresas.map((e) => ({ value: String(e.id), label: e.nome_fantasia }))} />
            <FilterSelect label="Unidade" value={unidadeId} onChange={(v) => { setUnidadeId(v); setLinkId("all"); }}
              options={unidadesFiltradas.map((u) => ({ value: String(u.id), label: u.nome_unidade }))} />
            <FilterSelect label="Operadora" value={operadoraId} onChange={setOperadoraId}
              options={lookups.operadoras.map((o) => ({ value: String(o.id), label: o.nome }))} />
            <FilterSelect label="Link" value={linkId} onChange={setLinkId}
              options={linksFiltrados.map((l) => ({ value: String(l.id), label: l.nome_link || `Link #${l.id}` }))} />
            <FilterSelect label="Fila" value={filaId} onChange={setFilaId}
              options={lookups.filas.map((f) => ({ value: String(f.id), label: f.nome }))} />
            <FilterSelect label="Equipe" value={grupoId} onChange={setGrupoId}
              options={lookups.grupos.map((g) => ({ value: String(g.id), label: g.nome }))} />
            <FilterSelect label="Técnico" value={tecnicoId} onChange={setTecnicoId}
              options={lookups.tecnicos.map((t) => ({ value: String(t.id), label: t.nome }))} />
            <FilterSelect label="Categoria" value={categoriaId} onChange={setCategoriaId}
              options={lookups.categorias.map((c) => ({ value: String(c.id), label: c.nome }))} />
            <FilterSelect label="Tipo de chamado" value={tipoChamado} onChange={setTipoChamado}
              options={[{ value: "I", label: "Incidente" }, { value: "R", label: "Requisição" }]} />
            <FilterSelect label="Nível" value={nivel} onChange={setNivel}
              options={NIVEIS.map((n) => ({ value: n, label: n }))} />
            <FilterSelect label="Origem" value={origem} onChange={setOrigem}
              options={ORIGENS.map((o) => ({ value: o, label: label(o) }))} />
            <FilterSelect label="SLA" value={slaFilter} onChange={setSlaFilter}
              options={[
                { value: "res_ok", label: "Solução cumprida" },
                { value: "res_violado", label: "Solução violada" },
                { value: "fr_ok", label: "1º atendimento cumprido" },
                { value: "fr_violado", label: "1º atendimento violado" },
              ]} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <Chip key={s} active={statusSel.includes(s)} onClick={() => toggle(setStatusSel, s)}>{label(s)}</Chip>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <div className="flex flex-wrap gap-2">
                {PRIORIDADES.map((p) => (
                  <Chip key={p} active={prioridadeSel.includes(p)} color={PRIORITY_COLORS[p]} onClick={() => toggle(setPrioridadeSel, p)}>{p}</Chip>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Busca livre (código, título, solicitante, ativo, unidade)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex: GS LAPA, link caiu, #123..." />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<BarChart3 className="h-4 w-4" />} label="Quantos chamados" value={kpi.total} prev={compare ? kpiPrev.total : null} />
        <Kpi icon={<Timer className="h-4 w-4" />} label="Tempo médio de solução" value={fmtDuration(kpi.mttr)} prev={compare ? kpiPrev.mttr : null} raw={kpi.mttr} invert />
        <Kpi icon={<Activity className="h-4 w-4" />} label="Tempo médio de 1º atendimento" value={fmtDuration(kpi.tma)} prev={compare ? kpiPrev.tma : null} raw={kpi.tma} invert />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="SLA de solução cumprido" value={kpi.slaResPct === null ? "—" : `${kpi.slaResPct}%`} prev={compare ? kpiPrev.slaResPct : null} raw={kpi.slaResPct} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Activity className="h-4 w-4" />} label="Em aberto" value={kpi.abertos} prev={compare ? kpiPrev.abertos : null} invert />
        <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Encerrados" value={kpi.encerrados} prev={compare ? kpiPrev.encerrados : null} />
        <Kpi icon={<Wifi className="h-4 w-4" />} label="Operadora com mais problemas"
          value={byOperadora[0]?.name || "—"} sub={byOperadora[0] ? `${byOperadora[0].total} chamados` : "—"} />
        <Kpi icon={<Trophy className="h-4 w-4" />} label="Unidade com mais chamados"
          value={byUnidade[0]?.name || "—"} sub={byUnidade[0] ? `${byUnidade[0].total} chamados` : "—"} />
      </div>

      <Tabs defaultValue="visao" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="tempos">Tempos & SLA</TabsTrigger>
          <TabsTrigger value="detalhe">Detalhamento ({current.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Chamados abertos x encerrados</CardTitle></CardHeader>
            <CardContent className="h-80">
              {serie.length === 0 ? <Empty loading={loading} /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="periodo" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="abertos" name="Abertos" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="encerrados" name="Encerrados" stroke="hsl(215 85% 65%)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Por status" data={byStatus} />
            <Card>
              <CardHeader><CardTitle className="text-base">Por prioridade</CardTitle></CardHeader>
              <CardContent className="h-72">
                {byPrioridade.length === 0 ? <Empty loading={loading} /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byPrioridade}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="total" name="Chamados">
                        {byPrioridade.map((entry) => <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="rankings" className="grid gap-4 lg:grid-cols-2">
          <RankTable title="Unidades com mais chamados" icon={<Building2 className="h-4 w-4" />} rows={byUnidade} total={kpi.total} />
          <RankTable title="Operadoras com mais chamados" icon={<Wifi className="h-4 w-4" />} rows={byOperadora} total={kpi.total} />
          <RankTable title="Empresas" icon={<Building2 className="h-4 w-4" />} rows={byEmpresa} total={kpi.total} />
          <RankTable title="Categorias" icon={<BarChart3 className="h-4 w-4" />} rows={byCategoria} total={kpi.total} />
          <RankTable title="Técnicos" icon={<Activity className="h-4 w-4" />} rows={byTecnico} total={kpi.total} />
          <RankTable title="Filas" icon={<Activity className="h-4 w-4" />} rows={byFila} total={kpi.total} />
        </TabsContent>

        <TabsContent value="tempos" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Kpi icon={<Timer className="h-4 w-4" />} label="SLA de 1º atendimento cumprido" value={kpi.slaFrPct === null ? "—" : `${kpi.slaFrPct}%`} prev={compare ? kpiPrev.slaFrPct : null} raw={kpi.slaFrPct} />
            <Kpi icon={<Timer className="h-4 w-4" />} label="SLA de solução violados" value={kpi.slaResViolados} prev={compare ? kpiPrev.slaResViolados : null} invert />
            <Kpi icon={<Timer className="h-4 w-4" />} label="Chamados com solução medida" value={current.filter((t) => resolutionMinutes(t) !== null).length} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <MttrTable title="MTTR por operadora" rows={mttrOperadora} />
            <MttrTable title="MTTR por unidade" rows={mttrUnidade} />
          </div>
        </TabsContent>

        <TabsContent value="detalhe">
          <Card>
            <CardHeader><CardTitle className="text-base">Chamados no período ({current.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[600px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Abertura</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead>Operadora</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Prioridade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Solução</TableHead>
                      <TableHead>SLA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {current.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                        {loading ? "Carregando..." : "Nenhum chamado com os filtros atuais."}
                      </TableCell></TableRow>
                    )}
                    {current.slice(0, 500).map((t) => {
                      const sla = slaResolution(t);
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.codigo}</TableCell>
                          <TableCell className="whitespace-nowrap">{format(parseISO(t.data_abertura), "dd/MM/yy HH:mm")}</TableCell>
                          <TableCell>{names.unidade.get(t.unidade_id || -1) || "—"}</TableCell>
                          <TableCell>{names.operadora.get(t.operadora_id || -1) || "—"}</TableCell>
                          <TableCell className="max-w-xs truncate" title={t.titulo}>{t.titulo}</TableCell>
                          <TableCell>
                            <Badge style={{ backgroundColor: PRIORITY_COLORS[t.prioridade], color: "white" }}>{t.prioridade}</Badge>
                          </TableCell>
                          <TableCell>{label(t.status)}</TableCell>
                          <TableCell className="whitespace-nowrap">{fmtDuration(resolutionMinutes(t))}</TableCell>
                          <TableCell>
                            {sla ? <Badge variant={sla === "CUMPRIDO" ? "secondary" : "destructive"}>{sla}</Badge> : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {current.length > 500 && (
                <p className="p-3 text-xs text-muted-foreground">
                  Exibindo os 500 chamados mais recentes. Use a exportação para a lista completa.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ----------------------------- componentes ----------------------------- */

function FilterSelect({ label: title, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label>{title}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value="all">Todos</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Chip({ active, color, onClick, children }: {
  active: boolean; color?: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? "border-transparent text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
      }`}
      style={active ? { backgroundColor: color || "hsl(var(--primary))" } : {}}
    >
      {children}
    </button>
  );
}

function Kpi({ icon, label: title, value, sub, prev, raw, invert }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string;
  prev?: number | null; raw?: number | null; invert?: boolean;
}) {
  const currentValue = raw !== undefined ? raw : typeof value === "number" ? value : null;
  let delta: number | null = null;
  if (prev !== null && prev !== undefined && currentValue !== null && prev > 0) {
    delta = Math.round(((currentValue - prev) / prev) * 100);
  }
  const good = delta === null ? null : invert ? delta <= 0 : delta >= 0;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">{icon} {title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="truncate text-2xl font-bold" title={typeof value === "string" ? value : undefined}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        {delta !== null && (
          <p className={`flex items-center gap-1 text-xs ${good ? "text-emerald-600" : "text-red-600"}`}>
            {delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(delta)}% vs período anterior
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Empty({ loading }: { loading: boolean }) {
  return <p className="text-sm text-muted-foreground">{loading ? "Carregando..." : "Sem dados no período/filtros."}</p>;
}

function ChartCard({ title, data }: { title: string; data: { name: string; total: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? <Empty loading={false} /> : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="total" name="Chamados" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function RankTable({ title, icon, rows, total }: {
  title: string; icon: React.ReactNode; rows: { name: string; total: number }[]; total: number;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base">{icon} {title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="max-h-80 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow><TableHead>#</TableHead><TableHead>Nome</TableHead><TableHead className="text-right">Chamados</TableHead><TableHead className="text-right">%</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Sem dados.</TableCell></TableRow>}
              {rows.map((r, i) => (
                <TableRow key={r.name}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{r.total}</TableCell>
                  <TableCell className="text-right">{total ? Math.round((r.total / total) * 100) : 0}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function MttrTable({ title, rows }: { title: string; rows: { name: string; minutos: number; chamados: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Timer className="h-4 w-4" /> {title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="max-h-80 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow><TableHead>Nome</TableHead><TableHead className="text-right">MTTR</TableHead><TableHead className="text-right">Chamados</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={3} className="py-6 text-center text-muted-foreground">Sem dados.</TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right">{fmtDuration(r.minutos)}</TableCell>
                  <TableCell className="text-right">{r.chamados}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
