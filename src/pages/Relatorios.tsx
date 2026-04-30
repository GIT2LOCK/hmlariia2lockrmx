import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Activity, AlertTriangle, BarChart3, Building2, Download, Link2, Loader2, RefreshCw, Search, Timer, TrendingUp, Trophy, Wifi } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { exportGlpiReportWorkbook } from "@/lib/glpiReportExcel";

interface UnitRankingItem {
  company: string;
  unit: string;
  total: number;
  linkTickets: number;
  avgResolutionMinutes?: number;
  avgLinkResolutionMinutes?: number;
  resolvedCount?: number;
  resolvedLinkCount?: number;
}

interface OperatorRankingItem {
  operator: string;
  total: number;
  byCompany: Record<string, number>;
  avgResolutionMinutes: number;
  resolvedCount: number;
  topUnit: string | null;
  topUnitTickets: number;
}

interface GlpiReportsData {
  totalTickets: number;
  totalLinkTickets?: number;
  avgLinkResolutionMinutes?: number;
  byCompany: Record<string, number>;
  unitRanking: UnitRankingItem[];
  internetLinkRanking: UnitRankingItem[];
  operatorRanking?: OperatorRankingItem[];
  generatedAt: string;
}

const PERIODS = [
  { label: "30 dias", value: "30" },
  { label: "90 dias", value: "90" },
  { label: "180 dias", value: "180" },
  { label: "Todos", value: "all" },
];

const COMPANY_OPTIONS = ["Todos", "GoodStorage", "PetCare", "Brava", "Indefinido"];
const LIMIT_OPTIONS = [10, 25, 50, 100];

function isValidUnitRow(item: UnitRankingItem) {
  const unit = item.unit.trim().toUpperCase();
  if (!unit) return false;
  if (item.company === "GoodStorage") return unit !== "GOODSTORAGE";
  if (item.company === "PetCare") return unit !== "PETCARE" && unit !== "TECSA";
  if (item.company === "Brava") return unit !== "BRAVA" && !unit.startsWith("POLO");
  return unit !== "INDEFINIDO";
}

function formatDuration(minutes?: number) {
  if (!minutes || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export default function Relatorios() {
  const { toast } = useToast();
  const [period, setPeriod] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("Todos");
  const [unitSearch, setUnitSearch] = useState("");
  const [ticketType, setTicketType] = useState<"todos" | "links">("todos");
  const [minTickets, setMinTickets] = useState("0");
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState<GlpiReportsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/glpi-proxy?action=reports&days=${period}`, {
        headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro ${res.status}`);
      }
      setData(await res.json());
    } catch (err: any) {
      toast({ title: "Erro ao carregar relatórios do GLPI", description: err.message, variant: "destructive" });
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [period]);

  const companyChart = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.byCompany)
      .filter(([empresa]) => companyFilter === "Todos" || empresa === companyFilter)
      .map(([empresa, total]) => ({ empresa, total }));
  }, [companyFilter, data]);

  const filteredUnits = useMemo(() => {
    if (!data) return [];
    const min = Number(minTickets) || 0;
    const source = ticketType === "links" ? data.internetLinkRanking : data.unitRanking;
    return source
      .filter(item => companyFilter === "Todos" || item.company === companyFilter)
      .filter(isValidUnitRow)
      .filter(item => item.unit.toLowerCase().includes(unitSearch.trim().toLowerCase()))
      .filter(item => (ticketType === "links" ? item.linkTickets : item.total) >= min)
      .sort((a, b) => (ticketType === "links" ? b.linkTickets - a.linkTickets : b.total - a.total));
  }, [companyFilter, data, minTickets, ticketType, unitSearch]);

  const filteredOperators = useMemo(() => {
    if (!data?.operatorRanking) return [];
    return data.operatorRanking
      .filter(op => companyFilter === "Todos" || (op.byCompany[companyFilter] || 0) > 0)
      .map(op => ({
        ...op,
        displayTotal: companyFilter === "Todos" ? op.total : (op.byCompany[companyFilter] || 0),
      }))
      .sort((a, b) => b.displayTotal - a.displayTotal);
  }, [companyFilter, data]);

  const filteredTotalTickets = useMemo(() => {
    if (!data) return 0;
    if (companyFilter === "Todos") return data.totalTickets;
    return data.byCompany[companyFilter] || 0;
  }, [companyFilter, data]);

  const topUnit = filteredUnits[0];
  const linkRows = filteredUnits.filter(item => item.linkTickets > 0);
  const topOperator = filteredOperators[0];
  const worstMttrUnit = useMemo(
    () => [...linkRows].filter(u => u.avgLinkResolutionMinutes && u.avgLinkResolutionMinutes > 0)
      .sort((a, b) => (b.avgLinkResolutionMinutes || 0) - (a.avgLinkResolutionMinutes || 0))[0],
    [linkRows],
  );

  const CHART_COLORS = ["hsl(var(--primary))", "hsl(215 85% 65%)", "hsl(35 95% 60%)", "hsl(280 70% 60%)", "hsl(160 70% 45%)", "hsl(0 75% 60%)", "hsl(45 95% 55%)", "hsl(195 80% 50%)"];

  const topOperatorsChart = useMemo(() => filteredOperators.slice(0, 8).map(op => ({
    operator: op.operator, chamados: op.displayTotal, mttrHoras: Math.round((op.avgResolutionMinutes || 0) / 60 * 10) / 10,
  })), [filteredOperators]);

  const topUnitsChart = useMemo(() => filteredUnits.slice(0, 10).map(u => ({
    unit: u.unit.length > 18 ? u.unit.slice(0, 17) + "…" : u.unit,
    chamados: ticketType === "links" ? u.linkTickets : u.total,
  })), [filteredUnits, ticketType]);

  const worstMttrUnitsChart = useMemo(() => [...linkRows]
    .filter(u => u.avgLinkResolutionMinutes && u.avgLinkResolutionMinutes > 0)
    .sort((a, b) => (b.avgLinkResolutionMinutes || 0) - (a.avgLinkResolutionMinutes || 0))
    .slice(0, 8)
    .map(u => ({ unit: u.unit.length > 18 ? u.unit.slice(0, 17) + "…" : u.unit, horas: Math.round((u.avgLinkResolutionMinutes || 0) / 60 * 10) / 10 })),
  [linkRows]);

  const operatorMttrChart = useMemo(() => [...filteredOperators]
    .filter(o => o.avgResolutionMinutes > 0)
    .sort((a, b) => b.avgResolutionMinutes - a.avgResolutionMinutes)
    .slice(0, 8)
    .map(o => ({ operator: o.operator, horas: Math.round((o.avgResolutionMinutes || 0) / 60 * 10) / 10 })),
  [filteredOperators]);

  const totalLinkTickets = data?.totalLinkTickets ?? 0;
  const ticketTypeChart = useMemo(() => ([
    { name: "Indisp. de Link", value: totalLinkTickets },
    { name: "Outros chamados", value: Math.max(0, (data?.totalTickets ?? 0) - totalLinkTickets) },
  ]), [data, totalLinkTickets]);

  const linkResolutionRate = data && data.totalLinkTickets ? Math.round(((data as any).resolvedLinkCount ?? 0) / data.totalLinkTickets * 100) : null;

  const exportReport = () => { if (data) exportGlpiReportWorkbook(data, isValidUnitRow); };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground">Indicadores de chamados do GLPI por empresa, unidade e operadora.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map(item => (
            <Button key={item.value} variant={period === item.value ? "default" : "outline"} size="sm" onClick={() => setPeriod(item.value)}>{item.label}</Button>
          ))}
          <Button variant="outline" size="icon" onClick={fetchReports} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : data && (
        <>
          <Card>
            <CardHeader><CardTitle>Filtros</CardTitle></CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr]">
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">Empresa</span>
                <div className="flex flex-wrap gap-2">
                  {COMPANY_OPTIONS.map(company => (
                    <Button key={company} variant={companyFilter === company ? "default" : "outline"} size="sm" onClick={() => setCompanyFilter(company)}>{company}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">Unidade</span>
                <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={unitSearch} onChange={e => setUnitSearch(e.target.value)} placeholder="Ex: GS LAPA" className="pl-9" /></div>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">Tipo</span>
                <div className="flex gap-2"><Button variant={ticketType === "todos" ? "default" : "outline"} size="sm" onClick={() => setTicketType("todos")}>Todos</Button><Button variant={ticketType === "links" ? "default" : "outline"} size="sm" onClick={() => setTicketType("links")}>Links</Button></div>
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">Mínimo</span>
                <Input type="number" min="0" value={minTickets} onChange={e => setMinTickets(e.target.value)} />
              </div>
              <div className="space-y-2">
                <span className="text-sm font-medium text-foreground">Top</span>
                <div className="flex flex-wrap gap-2">{LIMIT_OPTIONS.map(value => <Button key={value} variant={limit === value ? "default" : "outline"} size="sm" onClick={() => setLimit(value)}>{value}</Button>)}</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4" /> Total de chamados</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{filteredTotalTickets}</div><p className="text-sm text-muted-foreground">{companyFilter === "Todos" ? "Todas as empresas" : companyFilter}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" /> Indisponibilidade de Link</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{data.totalLinkTickets ?? 0}</div><p className="text-sm text-muted-foreground">MTTR médio: {formatDuration(data.avgLinkResolutionMinutes)}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Wifi className="h-4 w-4" /> Operadora mais problemática</CardTitle></CardHeader><CardContent><div className="truncate text-xl font-bold">{topOperator?.operator || "—"}</div><p className="text-sm text-muted-foreground">{topOperator ? `${topOperator.total} chamados • MTTR ${formatDuration(topOperator.avgResolutionMinutes)}` : "—"}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Timer className="h-4 w-4" /> Pior MTTR de unidade</CardTitle></CardHeader><CardContent><div className="truncate text-xl font-bold">{worstMttrUnit?.unit || "—"}</div><p className="text-sm text-muted-foreground">{worstMttrUnit ? formatDuration(worstMttrUnit.avgLinkResolutionMinutes) : "—"}</p></CardContent></Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Building2 className="h-4 w-4" /> Unidades filtradas</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{filteredUnits.length}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Trophy className="h-4 w-4" /> Unidade com mais chamados</CardTitle></CardHeader><CardContent><div className="truncate text-xl font-bold">{topUnit?.unit || "—"}</div><p className="text-sm text-muted-foreground">{topUnit ? (ticketType === "links" ? topUnit.linkTickets : topUnit.total) : 0} chamados</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" /> Maior recorrência de link</CardTitle></CardHeader><CardContent><div className="truncate text-xl font-bold">{linkRows[0]?.unit || "—"}</div><p className="text-sm text-muted-foreground">{linkRows[0]?.linkTickets || 0} chamados • MTTR {formatDuration(linkRows[0]?.avgLinkResolutionMinutes)}</p></CardContent></Card>
          </div>

          <Tabs defaultValue="visao" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="visao">Visão Geral</TabsTrigger>
                <TabsTrigger value="empresas">Empresas</TabsTrigger>
                <TabsTrigger value="unidades">Unidades</TabsTrigger>
                <TabsTrigger value="links">Links</TabsTrigger>
                <TabsTrigger value="operadoras">Operadoras</TabsTrigger>
              </TabsList>
              <Button variant="outline" size="sm" onClick={exportReport}><Download className="mr-2 h-4 w-4" /> Excel</Button>
            </div>

            <TabsContent value="visao" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-l-4" style={{ borderLeftColor: "hsl(var(--primary))" }}>
                  <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-primary" /> Top 8 unidades — Pior MTTR de link</CardTitle></CardHeader>
                  <CardContent className="h-80">
                    {worstMttrUnitsChart.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados de MTTR no período.</p> : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={worstMttrUnitsChart} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                          <XAxis type="number" unit="h" />
                          <YAxis type="category" dataKey="unit" width={120} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(v: number) => [`${v} h`, "MTTR médio"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                          <Bar dataKey="horas" fill="hsl(0 75% 60%)" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-l-4" style={{ borderLeftColor: "hsl(35 95% 60%)" }}>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5" style={{ color: "hsl(35 95% 60%)" }} /> Operadoras — Pior tempo de retorno</CardTitle></CardHeader>
                  <CardContent className="h-80">
                    {operatorMttrChart.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados de MTTR por operadora.</p> : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={operatorMttrChart} layout="vertical" margin={{ left: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                          <XAxis type="number" unit="h" />
                          <YAxis type="category" dataKey="operator" width={120} tick={{ fontSize: 12 }} />
                          <Tooltip formatter={(v: number) => [`${v} h`, "MTTR médio"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                          <Bar dataKey="horas" fill="hsl(35 95% 60%)" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Operadoras — Volume de chamados</CardTitle></CardHeader>
                  <CardContent className="h-80">
                    {topOperatorsChart.length === 0 ? <p className="text-sm text-muted-foreground">Sem dados de operadoras.</p> : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topOperatorsChart}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="operator" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                          <YAxis allowDecimals={false} />
                          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                          <Bar dataKey="chamados" radius={[6, 6, 0, 0]}>
                            {topOperatorsChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" /> Composição dos chamados</CardTitle></CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={ticketTypeChart} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={110} paddingAngle={3}>
                          <Cell fill="hsl(0 75% 60%)" />
                          <Cell fill="hsl(var(--primary))" />
                        </Pie>
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Top 10 unidades — Volume de chamados</CardTitle></CardHeader>
                <CardContent className="h-80">
                  {topUnitsChart.length === 0 ? <p className="text-sm text-muted-foreground">Sem unidades no filtro atual.</p> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topUnitsChart}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="unit" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                        <YAxis allowDecimals={false} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar dataKey="chamados" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="empresas">
              <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                <Card><CardHeader><CardTitle>Chamados por empresa</CardTitle></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={companyChart}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="empresa" /><YAxis allowDecimals={false} /><Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} /><Bar dataKey="total" radius={[6, 6, 0, 0]}>{companyChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></CardContent></Card>
                <Card><CardHeader><CardTitle>Distribuição</CardTitle></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={companyChart} dataKey="total" nameKey="empresa" cx="50%" cy="50%" outerRadius={110} label>{companyChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} /><Legend /></PieChart></ResponsiveContainer></CardContent></Card>
              </div>
            </TabsContent>

            <TabsContent value="unidades">
              <RankingTable rows={filteredUnits.slice(0, limit)} valueKey="total" mttrKey="avgResolutionMinutes" label="Total de chamados" title="Unidades com mais chamados" />
            </TabsContent>

            <TabsContent value="links">
              <RankingTable rows={linkRows.slice(0, limit)} valueKey="linkTickets" mttrKey="avgLinkResolutionMinutes" label="Indisp. de link" title="Unidades com mais indisponibilidades de link" />
            </TabsContent>

            <TabsContent value="operadoras" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Wifi className="h-5 w-5" /> Volume por operadora</CardTitle></CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topOperatorsChart}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="operator" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                        <YAxis allowDecimals={false} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar dataKey="chamados" radius={[6, 6, 0, 0]}>{topOperatorsChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5" /> MTTR por operadora (horas)</CardTitle></CardHeader>
                  <CardContent className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={operatorMttrChart} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                        <XAxis type="number" unit="h" />
                        <YAxis type="category" dataKey="operator" width={120} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v: number) => [`${v} h`, "MTTR"]} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar dataKey="horas" fill="hsl(35 95% 60%)" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Wifi className="h-5 w-5" /> Ranking de operadoras (Indisponibilidade de Link)</CardTitle></CardHeader>
                <CardContent>
                  {filteredOperators.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma operadora identificada nas descrições dos chamados de link no período.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Operadora</TableHead>
                          <TableHead className="text-right">Chamados</TableHead>
                          <TableHead className="text-right">MTTR (média off→on)</TableHead>
                          <TableHead className="text-right">Resolvidos</TableHead>
                          <TableHead>Unidade mais afetada</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredOperators.slice(0, limit).map((op, index) => (
                          <TableRow key={op.operator}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell className="font-medium"><Badge variant="secondary">{op.operator}</Badge></TableCell>
                            <TableCell className="text-right font-bold">{op.displayTotal}</TableCell>
                            <TableCell className="text-right">{formatDuration(op.avgResolutionMinutes)}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{op.resolvedCount}</TableCell>
                            <TableCell className="text-sm">{op.topUnit || "—"}{op.topUnit && <span className="text-muted-foreground"> ({op.topUnitTickets})</span>}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function RankingTable({ rows, valueKey, mttrKey, label, title }: {
  rows: UnitRankingItem[];
  valueKey: "total" | "linkTickets";
  mttrKey: "avgResolutionMinutes" | "avgLinkResolutionMinutes";
  label: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5" /> {title}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Empresa</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="text-right">{label}</TableHead>
              <TableHead className="text-right">Total geral</TableHead>
              <TableHead className="text-right">MTTR médio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.company}-${row.unit}`}>
                <TableCell>{index + 1}</TableCell>
                <TableCell><Badge variant="secondary">{row.company}</Badge></TableCell>
                <TableCell className="font-medium">{row.unit}</TableCell>
                <TableCell className="text-right font-bold">{row[valueKey]}</TableCell>
                <TableCell className="text-right text-muted-foreground">{row.total}</TableCell>
                <TableCell className="text-right">{formatDuration(row[mttrKey])}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
