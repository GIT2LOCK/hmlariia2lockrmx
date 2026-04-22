import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { BarChart3, Building2, Download, Link2, Loader2, RefreshCw, Search, Trophy } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface UnitRankingItem {
  company: string;
  unit: string;
  total: number;
  linkTickets: number;
}

interface GlpiReportsData {
  totalTickets: number;
  byCompany: Record<string, number>;
  unitRanking: UnitRankingItem[];
  internetLinkRanking: UnitRankingItem[];
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

  useEffect(() => {
    fetchReports();
  }, [period]);

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
      .filter(item => item.unit.toLowerCase().includes(unitSearch.trim().toLowerCase()))
      .filter(item => (ticketType === "links" ? item.linkTickets : item.total) >= min)
      .sort((a, b) => (ticketType === "links" ? b.linkTickets - a.linkTickets : b.total - a.total));
  }, [companyFilter, data, minTickets, ticketType, unitSearch]);

  const filteredTotalTickets = useMemo(() => {
    if (!data) return 0;
    if (companyFilter === "Todos") return data.totalTickets;
    return data.byCompany[companyFilter] || 0;
  }, [companyFilter, data]);

  const topUnit = filteredUnits[0];
  const linkRows = filteredUnits.filter(item => item.linkTickets > 0);

  const exportCsv = () => {
    if (!data) return;
    const rows = [["Empresa", "Unidade", "Total de chamados", "Chamados de link"]];
    filteredUnits.forEach(item => rows.push([item.company, item.unit, String(item.total), String(item.linkTickets)]));
    const csv = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-glpi-unidades.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
          <p className="text-muted-foreground">Indicadores de chamados coletados do GLPI por empresa e unidade.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map(item => (
            <Button key={item.value} variant={period === item.value ? "default" : "outline"} size="sm" onClick={() => setPeriod(item.value)}>
              {item.label}
            </Button>
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

          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4" /> Quantidade total de chamados abertos</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{filteredTotalTickets}</div><p className="text-sm text-muted-foreground">{companyFilter === "Todos" ? "Todas as empresas" : companyFilter}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Building2 className="h-4 w-4" /> Chamados por Unidade</CardTitle></CardHeader><CardContent><div className="text-3xl font-bold">{filteredUnits.length}</div><p className="text-sm text-muted-foreground">unidades filtradas</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Trophy className="h-4 w-4" /> Unidades com mais chamados</CardTitle></CardHeader><CardContent><div className="truncate text-xl font-bold">{topUnit?.unit || "—"}</div><p className="text-sm text-muted-foreground">{topUnit ? (ticketType === "links" ? topUnit.linkTickets : topUnit.total) : 0} chamados</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" /> Maior recorrência link</CardTitle></CardHeader><CardContent><div className="truncate text-xl font-bold">{linkRows[0]?.unit || "—"}</div><p className="text-sm text-muted-foreground">{linkRows[0]?.linkTickets || 0} chamados</p></CardContent></Card>
          </div>

          <Tabs defaultValue="empresas" className="space-y-4">
            <div className="flex items-center justify-between gap-3"><TabsList><TabsTrigger value="empresas">Empresas</TabsTrigger><TabsTrigger value="unidades">Unidades</TabsTrigger><TabsTrigger value="links">Links de Internet</TabsTrigger></TabsList><Button variant="outline" size="sm" onClick={exportCsv}><Download className="mr-2 h-4 w-4" /> CSV</Button></div>
            <TabsContent value="empresas"><Card><CardHeader><CardTitle>Chamados por empresa</CardTitle></CardHeader><CardContent className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={companyChart}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="empresa" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="total" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card></TabsContent>
            <TabsContent value="unidades"><RankingTable rows={filteredUnits.slice(0, limit)} valueKey="total" label="Total de chamados" title="Chamados por Unidade / Unidades com mais chamados" /></TabsContent>
            <TabsContent value="links"><RankingTable rows={linkRows.slice(0, limit)} valueKey="linkTickets" label="Chamados de link" title="Unidades com mais chamados de link de internet" /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function RankingTable({ rows, valueKey, label, title }: { rows: UnitRankingItem[]; valueKey: "total" | "linkTickets"; label: string; title: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5" /> {title}</CardTitle></CardHeader>
      <CardContent>
        <Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Empresa</TableHead><TableHead>Unidade</TableHead><TableHead className="text-right">{label}</TableHead><TableHead className="text-right">Total geral</TableHead></TableRow></TableHeader><TableBody>{rows.map((row, index) => (<TableRow key={`${row.company}-${row.unit}`}><TableCell>{index + 1}</TableCell><TableCell><Badge variant="secondary">{row.company}</Badge></TableCell><TableCell className="font-medium">{row.unit}</TableCell><TableCell className="text-right font-bold">{row[valueKey]}</TableCell><TableCell className="text-right text-muted-foreground">{row.total}</TableCell></TableRow>))}</TableBody></Table>
      </CardContent>
    </Card>
  );
}