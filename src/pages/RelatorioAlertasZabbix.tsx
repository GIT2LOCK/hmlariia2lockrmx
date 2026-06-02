import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Printer,
  Search,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const SEVERITY_OPTIONS = [
  { value: 5, label: "Disaster", color: "#7c0a0a" },
  { value: 4, label: "High", color: "#dc2626" },
  { value: 3, label: "Average", color: "#f59e0b" },
  { value: 2, label: "Warning", color: "#eab308" },
  { value: 1, label: "Information", color: "#3b82f6" },
  { value: 0, label: "Not classified", color: "#6b7280" },
];

const severityLabel = (s: number) => SEVERITY_OPTIONS.find((o) => o.value === s)?.label || String(s);
const severityColor = (s: number) => SEVERITY_OPTIONS.find((o) => o.value === s)?.color || "#6b7280";

const PERIOD_PRESETS = [
  { value: "30d", label: "Últimos 30 dias", days: 30 },
  { value: "60d", label: "Últimos 60 dias", days: 60 },
  { value: "90d", label: "Últimos 90 dias", days: 90 },
  { value: "6m", label: "Últimos 6 meses", days: 180 },
  { value: "12m", label: "Últimos 12 meses", days: 365 },
  { value: "custom", label: "Período personalizado", days: 0 },
];

const AMBIENTES = [
  { value: "z1", label: "Brava" },
  { value: "z2", label: "2lock" },
];

interface ZabbixEvent {
  eventid: string;
  clock: number;
  name: string;
  severity: number;
  hostname: string;
  host_visible: string;
  groups: string[];
  duration_sec: number;
  status: "OPEN" | "RESOLVED";
  resolved_at: number | null;
  acknowledged: boolean;
}

interface Empresa { id: number; razao_social: string; }
interface HostGroup { groupid: string; name: string; }

const fmtDuration = (sec: number) => {
  if (!sec || sec < 0) return "-";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || (!d && !h)) parts.push(`${m}m`);
  return parts.join(" ");
};

const fmtDate = (ts: number | null) => (ts ? format(new Date(ts * 1000), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "-");

const fmtMonthKey = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return format(new Date(year, month - 1, 1), "MMM/yy", { locale: ptBR });
};

const buildPositiveIntegerTicks = (maxValue: number) => {
  const safeMax = Math.max(0, Math.ceil(maxValue || 0));
  if (safeMax === 0) return [0, 1];

  const roughStep = Math.max(1, Math.ceil(safeMax / 4));
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceNormalized * magnitude;
  const top = Math.ceil(safeMax / step) * step;

  return Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
};

export default function RelatorioAlertasZabbix() {
  const [ambiente, setAmbiente] = useState<string>("z1");
  const [period, setPeriod] = useState<string>("30d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [severities, setSeverities] = useState<number[]>([4]);
  const [empresaId, setEmpresaId] = useState<string>("all");
  const [hostgroupId, setHostgroupId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<ZabbixEvent[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [hostgroups, setHostgroups] = useState<HostGroup[]>([]);

  useEffect(() => {
    supabase.from("empresas").select("id, razao_social").order("razao_social").then(({ data }) => {
      setEmpresas((data as Empresa[]) || []);
    });
  }, []);

  useEffect(() => {
    setHostgroupId("all");
    supabase.functions.invoke("zabbix-dashboard", {
      body: { action: "hostgroups_by_source", source: ambiente },
    }).then(({ data, error }) => {
      if (error) return;
      setHostgroups((data as HostGroup[]) || []);
    });
  }, [ambiente]);

  const computeRange = (): { from: number; till: number } | null => {
    const now = Math.floor(Date.now() / 1000);
    if (period === "custom") {
      if (!customFrom || !customTo) return null;
      const from = Math.floor(new Date(customFrom + "T00:00:00").getTime() / 1000);
      const till = Math.floor(new Date(customTo + "T23:59:59").getTime() / 1000);
      if (from >= till) return null;
      return { from, till };
    }
    const preset = PERIOD_PRESETS.find((p) => p.value === period);
    return { from: now - (preset?.days || 30) * 86400, till: now };
  };

  const fetchEvents = async () => {
    const range = computeRange();
    if (!range) {
      toast.error("Período inválido");
      return;
    }
    if (severities.length === 0) {
      toast.error("Selecione ao menos uma severidade");
      return;
    }
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        action: "events_history",
        source: ambiente,
        time_from: range.from,
        time_till: range.till,
        severities,
        search: search || undefined,
      };
      if (hostgroupId !== "all") body.hostgroup_ids = [hostgroupId];
      const { data, error } = await supabase.functions.invoke("zabbix-dashboard", { body });
      if (error) throw error;
      setEvents((data?.events as ZabbixEvent[]) || []);
      toast.success(`${data?.total ?? 0} alertas encontrados`);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao consultar Zabbix");
    } finally {
      setLoading(false);
    }
  };

  const total = events.length;
  const resolved = events.filter((e) => e.status === "RESOLVED").length;
  const open = total - resolved;
  const avgDuration = total ? Math.round(events.reduce((s, e) => s + e.duration_sec, 0) / total) : 0;

  const monthly = useMemo(() => {
    const map: Record<string, number> = {};
    const range = computeRange();

    if (range) {
      const cursor = new Date(range.from * 1000);
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);

      const end = new Date(range.till * 1000);
      end.setDate(1);
      end.setHours(0, 0, 0, 0);

      while (cursor <= end) {
        map[format(cursor, "yyyy-MM")] = 0;
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }

    for (const e of events) {
      const key = format(new Date(e.clock * 1000), "yyyy-MM");
      map[key] = (map[key] || 0) + 1;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ month: fmtMonthKey(k), count: v }));
  }, [events, period, customFrom, customTo]);

  const monthlyTicks = useMemo(
    () => buildPositiveIntegerTicks(Math.max(0, ...monthly.map((m) => m.count))),
    [monthly],
  );
  const monthlyYAxisMax = monthlyTicks[monthlyTicks.length - 1] || 1;

  const bySeverity = useMemo(() => {
    const map: Record<number, number> = {};
    for (const e of events) map[e.severity] = (map[e.severity] || 0) + 1;
    return SEVERITY_OPTIONS.filter((o) => map[o.value]).map((o) => ({
      name: o.label,
      value: map[o.value],
      color: o.color,
    }));
  }, [events]);

  const topHosts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of events) {
      const k = e.host_visible || e.hostname || "—";
      map[k] = (map[k] || 0) + 1;
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([host, count]) => ({ host, count }));
  }, [events]);

  const rangeLabel = () => {
    const range = computeRange();
    if (!range) return "";
    return `${fmtDate(range.from)} → ${fmtDate(range.till)}`;
  };

  const exportRows = () =>
    events.map((e) => ({
      "Data/Hora": fmtDate(e.clock),
      Host: e.host_visible || e.hostname,
      Hostname: e.hostname,
      Trigger: e.name,
      Severidade: severityLabel(e.severity),
      "Duração": fmtDuration(e.duration_sec),
      "Status atual": e.status === "RESOLVED" ? "Resolvido" : "Aberto",
      "Resolvido em": fmtDate(e.resolved_at),
    }));

  const exportCSV = () => {
    const rows = exportRows();
    if (!rows.length) return toast.error("Sem dados para exportar");
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(";"),
      ...rows.map((r) => headers.map((h) => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(";")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `alertas-zabbix-${ambiente}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportXLSX = () => {
    const rows = exportRows();
    if (!rows.length) return toast.error("Sem dados para exportar");
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Alertas");
    XLSX.writeFile(wb, `alertas-zabbix-${ambiente}-${Date.now()}.xlsx`);
  };

  const exportPDF = () => {
    if (!events.length) return toast.error("Sem dados para exportar");
    const doc = new jsPDF({ orientation: "landscape" });
    const ambienteLabel = AMBIENTES.find((a) => a.value === ambiente)?.label || ambiente;

    doc.setFontSize(16);
    doc.text("Relatório de Alertas Zabbix", 14, 16);
    doc.setFontSize(10);
    doc.text(`Ambiente: ${ambienteLabel}`, 14, 24);
    doc.text(`Período: ${rangeLabel()}`, 14, 30);
    doc.text(`Severidades: ${severities.map(severityLabel).join(", ")}`, 14, 36);
    doc.text(`Total: ${total}   Resolvidos: ${resolved}   Abertos: ${open}   Duração média: ${fmtDuration(avgDuration)}`, 14, 42);

    autoTable(doc, {
      startY: 48,
      head: [["Data/Hora", "Host", "Trigger", "Severidade", "Duração", "Status", "Resolvido em"]],
      body: events.map((e) => [
        fmtDate(e.clock),
        e.host_visible || e.hostname,
        e.name,
        severityLabel(e.severity),
        fmtDuration(e.duration_sec),
        e.status === "RESOLVED" ? "Resolvido" : "Aberto",
        fmtDate(e.resolved_at),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [10, 18, 92] },
    });

    doc.save(`alertas-zabbix-${ambiente}-${Date.now()}.pdf`);
  };

  return (
    <div className="p-6 space-y-6 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatório de Alertas Zabbix</h1>
          <p className="text-sm text-muted-foreground">Análise histórica de alertas por ambiente, cliente e período</p>
        </div>
      </div>

      {/* Filtros */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Ambiente</Label>
            <Select value={ambiente} onValueChange={setAmbiente}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {AMBIENTES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Select value={empresaId} onValueChange={setEmpresaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {empresas.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.razao_social}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Host Group (Zabbix)</Label>
            <Select value={hostgroupId} onValueChange={setHostgroupId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Todos</SelectItem>
                {hostgroups.map((g) => <SelectItem key={g.groupid} value={g.groupid}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

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

          <div className="space-y-1.5 md:col-span-2">
            <Label>Severidades</Label>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((s) => {
                const active = severities.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() =>
                      setSeverities((prev) =>
                        prev.includes(s.value) ? prev.filter((v) => v !== s.value) : [...prev, s.value],
                      )
                    }
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                      active ? "text-white border-transparent" : "bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    style={active ? { backgroundColor: s.color } : {}}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label>Buscar (host / trigger)</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Filtrar pelo nome do host ou trigger..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="md:col-span-2 lg:col-span-4 flex flex-wrap gap-2 justify-end">
            <Button onClick={fetchEvents} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Activity className="h-4 w-4 mr-2" />}
              Consultar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard icon={<AlertTriangle className="h-5 w-5" />} label="Total de alertas" value={total} tone="primary" />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Em aberto" value={open} tone="warning" />
        <KpiCard icon={<CheckCircle2 className="h-5 w-5" />} label="Resolvidos" value={resolved} tone="success" />
        <KpiCard icon={<Activity className="h-5 w-5" />} label="Duração média" value={fmtDuration(avgDuration)} tone="muted" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Alertas por mês</CardTitle>
            <p className="text-xs text-muted-foreground">Quantidade de eventos gerados em cada mês; não é saldo nem variação.</p>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} domain={[0, monthlyYAxisMax]} ticks={monthlyTicks} />
                <Tooltip />
                <Bar dataKey="count" name="Alertas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Por severidade</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySeverity}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value">
                  {bySeverity.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader><CardTitle className="text-base">Top 10 hosts com mais alertas</CardTitle></CardHeader>
          <CardContent style={{ height: Math.max(288, topHosts.length * 40 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topHosts} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="host" width={200} interval={0} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Export */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" /> Exportação</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportPDF}><FileText className="h-4 w-4 mr-2" /> PDF executivo</Button>
          <Button variant="outline" onClick={exportXLSX}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)</Button>
          <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" /> CSV</Button>
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-2" /> Imprimir</Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detalhamento dos alertas ({total})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Resolvido em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {loading ? "Carregando..." : "Nenhum alerta no período selecionado."}
                    </TableCell>
                  </TableRow>
                )}
                {events.map((e) => (
                  <TableRow key={e.eventid}>
                    <TableCell className="whitespace-nowrap">{fmtDate(e.clock)}</TableCell>
                    <TableCell className="font-medium">{e.host_visible || e.hostname}</TableCell>
                    <TableCell className="max-w-md truncate" title={e.name}>{e.name}</TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: severityColor(e.severity), color: "white" }}>
                        {severityLabel(e.severity)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDuration(e.duration_sec)}</TableCell>
                    <TableCell>
                      {e.status === "RESOLVED" ? (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Resolvido</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100">Aberto</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(e.resolved_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: string }) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-amber-500/10 text-amber-600",
    success: "bg-emerald-500/10 text-emerald-600",
    muted: "bg-muted text-muted-foreground",
  }[tone] || "bg-muted text-muted-foreground";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${toneClass}`}>{icon}</div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
