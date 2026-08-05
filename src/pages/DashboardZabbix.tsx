import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Server, Wifi, Wrench, RefreshCw, CheckCircle2, Clock,
  ShieldCheck, MessageSquare, Phone, ChevronDown, ChevronRight, ArrowUp, ArrowDown, ArrowUpDown,
  Download, Monitor, Tv,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClearableSelect } from "@/components/ClearableSelect";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Send, MessageSquarePlus, Ticket } from "lucide-react";
import { TicketModal } from "@/components/TicketModal";

// Envia um update (mensagem) nos eventos do Zabbix usando o token pessoal do usuário
async function postZabbixUpdate(eventids: string[], source: string | undefined, message: string) {
  const { data } = await supabase.rpc("fn_my_zabbix_tokens" as any);
  const user_token = (Array.isArray(data) ? (data[0] as any)?.zabbix_token_z2 : null) || null;
  if (!user_token) throw new Error("Token Zabbix pessoal não configurado em Meu Perfil.");
  const res = await supabase.functions.invoke("zabbix-dashboard", {
    body: { action: "acknowledge", eventids, message: message.trim(), source, user_token },
  });
  if (res.error) throw new Error(res.error.message);
}

// ── Types ──────────────────────────────────────────────────────────────
interface ZabbixProblem {
  eventid: string;
  objectid: string;
  name: string;
  severity: string;
  clock: string;
  acknowledged: string;
  hosts: { hostid: string; host: string; name: string }[];
  groups: { groupid: string; name: string }[];
  triggerDescription: string;
  acknowledges?: { alias: string; message: string; clock: string; user?: string }[];
  tags?: { tag: string; value: string }[];
  source?: string;
  category?: string;
}

interface ZabbixMaintenance {
  maintenanceid: string;
  name: string;
  active_since: string;
  active_till: string;
  description: string;
  hosts: { hostid: string; host: string; name: string }[];
  groups: { groupid: string; name: string }[];
  source?: string;
}

interface ZabbixContato {
  prefixo: string;
  primeiro_contato_nome: string | null;
  primeiro_contato_telefone: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
}

interface ZabbixHost {
  hostid: string;
  hostname: string;
  name: string;
  status: string;
  ip: string;
  proxy: string;
  hostgroups: string[];
  templates: string[];
  tags: { tag: string; value: string }[];
  source: string;
}

const isHighOrDisaster = (problem: ZabbixProblem) => {
  const severity = Number(problem.severity);
  if (severity === 4 || severity === 5) return true;
  if (
    (problem as any).source === "z2" &&
    ((problem as any).category === "links" || (problem as any).category === "equipamentos")
  ) return true;
  return false;
};


const SECOND_UPDATE_ALERT_SECONDS = 25 * 60;

const getAckCount = (problem: ZabbixProblem) => problem.acknowledges?.length || 0;

const needsSecondUpdateAlert = (problem: ZabbixProblem) => {
  const openedAt = Number(problem.clock);
  if (!Number.isFinite(openedAt)) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - openedAt;
  return ageSeconds >= SECOND_UPDATE_ALERT_SECONDS && getAckCount(problem) < 2;
};

// ── Category mapping ────────────────────────────────────────────────────
type Category = "equipamentos" | "links" | "outros";

const CATEGORY_CONFIG: Record<Category, { label: string; icon: React.ElementType; color: string }> = {
  equipamentos: { label: "EQUIPAMENTOS", icon: Server, color: "text-blue-400" },
  links: { label: "LINKS DE INTERNET", icon: Wifi, color: "text-green-400" },
  outros: { label: "OUTROS", icon: AlertTriangle, color: "text-gray-400" },
};

const SEVERITY_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  "0": { label: "Não classificado", bg: "bg-gray-600", text: "text-gray-100" },
  "1": { label: "Informação", bg: "bg-blue-600", text: "text-blue-100" },
  "2": { label: "Aviso", bg: "bg-yellow-600", text: "text-yellow-100" },
  "3": { label: "Média", bg: "bg-orange-600", text: "text-orange-100" },
  "4": { label: "Alta", bg: "bg-red-600", text: "text-red-100" },
  "5": { label: "Desastre", bg: "bg-red-900", text: "text-red-100" },
};

function classifyProblem(problem: ZabbixProblem): Category {
  if (problem.category && (problem.category === "equipamentos" || problem.category === "links" || problem.category === "outros")) {
    return problem.category as Category;
  }
  const name = problem.triggerDescription || problem.name || "";
  if (/indisponibilidade.*equipamento/i.test(name)) return "equipamentos";
  if (/indisponibilidade.*link/i.test(name)) return "links";
  return "outros";
}

function extractPrefix(hostname: string): string | null {
  const match = hostname.match(/^(\d{3})/);
  return match ? match[1] : null;
}

// ── Host grouping ───────────────────────────────────────────────────────
interface HostGroup {
  hostKey: string;
  hostName: string;
  hostCode: string;
  problems: ZabbixProblem[];
  newestClock: number;
  oldestClock: number;
  highestSeverity: number;
  allAcks: any[];
}

function groupByHost(items: ZabbixProblem[]): HostGroup[] {
  const map = new Map<string, HostGroup>();
  for (const p of items) {
    const hostName = p.hosts?.[0]?.name || p.hosts?.[0]?.host || "—";
    const hostCode = p.hosts?.[0]?.host || p.hosts?.[0]?.name || "";
    const key = hostCode || hostName;
    if (!map.has(key)) {
      map.set(key, { hostKey: key, hostName, hostCode, problems: [], newestClock: 0, oldestClock: Infinity, highestSeverity: 0, allAcks: [] });
    }
    const g = map.get(key)!;
    g.problems.push(p);
    const clock = Number(p.clock);
    if (clock > g.newestClock) g.newestClock = clock;
    if (clock < g.oldestClock) g.oldestClock = clock;
    const sev = Number(p.severity);
    if (sev > g.highestSeverity) g.highestSeverity = sev;
    g.allAcks.push(...(p.acknowledges || []));
  }
  return Array.from(map.values());
}

// ── Change-detection signatures (used to avoid unnecessary re-renders) ──
function problemsSignature(items: ZabbixProblem[]): string {
  return [...items]
    .map(p => `${p.eventid}:${p.acknowledged}:${(p.acknowledges || []).length}`)
    .sort()
    .join("|");
}

function maintenanceSignature(items: ZabbixMaintenance[]): string {
  return [...items]
    .map(m => `${m.maintenanceid}:${m.active_till}`)
    .sort()
    .join("|");
}

// ── Sort logic ──────────────────────────────────────────────────────────
type SortField = "severity" | "host" | "problem" | "duration";
type SortDir = "asc" | "desc";

function sortGroups(groups: HostGroup[], field: SortField, dir: SortDir): HostGroup[] {
  const sorted = [...groups];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case "severity": cmp = a.highestSeverity - b.highestSeverity; break;
      case "host": cmp = a.hostName.localeCompare(b.hostName); break;
      case "problem": cmp = a.problems.length - b.problems.length; break;
      case "duration": cmp = a.newestClock - b.newestClock; break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

// ── Source filter options ────────────────────────────────────────────────
const SOURCE_OPTIONS = [
  { value: "todos", label: "Todos" },
  { value: "z2", label: "2LOCK" },
];

// ── Host CSV fields ─────────────────────────────────────────────────────
const HOST_CSV_FIELDS = [
  { key: "hostname", label: "Hostname" },
  { key: "name", label: "Nome Visível" },
  { key: "status", label: "Status" },
  { key: "ip", label: "IP" },
  { key: "proxy", label: "Proxy" },
  { key: "hostgroups", label: "Host Groups" },
  { key: "templates", label: "Templates" },
  { key: "tags", label: "Tags" },
  { key: "source", label: "Origem" },
] as const;

type HostFieldKey = typeof HOST_CSV_FIELDS[number]["key"];

// ── Component ───────────────────────────────────────────────────────────
export default function DashboardZabbix() {
  const [problems, setProblems] = useState<ZabbixProblem[]>([]);
  const [maintenances, setMaintenances] = useState<ZabbixMaintenance[]>([]);
  const [allHosts, setAllHosts] = useState<ZabbixHost[]>([]);
  const [contatos, setContatos] = useState<Record<string, ZabbixContato>>({});
  const [loading, setLoading] = useState(true);
  const [hostsLoading, setHostsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [sourceFilter, setSourceFilter] = useState("todos");
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("duration");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hostSearch, setHostSearch] = useState("");
  const [hostStatusFilter, setHostStatusFilter] = useState("todos");
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [csvFields, setCsvFields] = useState<Set<HostFieldKey>>(new Set(HOST_CSV_FIELDS.map(f => f.key)));
  const [activeTab, setActiveTab] = useState("problemas");
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [problemsRes, maintenanceRes, contatosRes] = await Promise.all([
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "problems" } }),
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "maintenance" } }),
        supabase.from("zabbix_contatos").select("prefixo, primeiro_contato_nome, primeiro_contato_telefone, responsavel_nome, responsavel_telefone"),
      ]);

      if (problemsRes.error) throw new Error(problemsRes.error.message);
      if (maintenanceRes.error) throw new Error(maintenanceRes.error.message);

      const newProblems = Array.isArray(problemsRes.data) ? problemsRes.data.filter(isHighOrDisaster) : [];
      const newMaintenances = Array.isArray(maintenanceRes.data) ? maintenanceRes.data : [];

      // Only update state when data actually changed (avoids re-render & scroll jump)
      setProblems(prev => problemsSignature(prev) === problemsSignature(newProblems) ? prev : newProblems);
      setMaintenances(prev => maintenanceSignature(prev) === maintenanceSignature(newMaintenances) ? prev : newMaintenances);

      const map: Record<string, ZabbixContato> = {};
      if (contatosRes.data) {
        for (const c of contatosRes.data as any[]) {
          map[c.prefixo] = c;
        }
      }
      setContatos(prev => {
        const sigA = Object.keys(prev).sort().map(k => `${k}|${prev[k].primeiro_contato_telefone || ""}|${prev[k].responsavel_telefone || ""}`).join(";");
        const sigB = Object.keys(map).sort().map(k => `${k}|${map[k].primeiro_contato_telefone || ""}|${map[k].responsavel_telefone || ""}`).join(";");
        return sigA === sigB ? prev : map;
      });
      setLastRefresh(new Date());
    } catch (err: any) {
      console.error("Zabbix fetch error:", err);
      if (!silent) toast({ title: "Erro ao buscar dados do Zabbix", description: err.message, variant: "destructive" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [toast]);

  const fetchHosts = useCallback(async () => {
    setHostsLoading(true);
    try {
      const res = await supabase.functions.invoke("zabbix-dashboard", { body: { action: "hosts_all" } });
      if (res.error) throw new Error(res.error.message);
      const hosts = Array.isArray(res.data) ? res.data.filter((host: ZabbixHost) => host.status === "0") : [];
      setAllHosts(hosts);
    } catch (err: any) {
      console.error("Hosts fetch error:", err);
      toast({ title: "Erro ao buscar hosts", description: err.message, variant: "destructive" });
    } finally {
      setHostsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
    // Silent polling: re-fetches every 30s but only swaps state when something
    // actually changed (new problem, new ack, host went offline, etc.).
    // This prevents the page from scrolling back to top on every poll.
    const interval = setInterval(() => fetchData(true), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fetch hosts when tab is selected
  useEffect(() => {
    if (activeTab === "hosts" && allHosts.length === 0 && !hostsLoading) {
      fetchHosts();
    }
  }, [activeTab, allHosts.length, hostsLoading, fetchHosts]);

  const filteredProblems = useMemo(() => {
    if (sourceFilter === "todos") return problems;
    return problems.filter(p => p.source === sourceFilter);
  }, [problems, sourceFilter]);

  const filteredMaintenances = useMemo(() => {
    if (sourceFilter === "todos") return maintenances;
    return maintenances.filter(m => m.source === sourceFilter);
  }, [maintenances, sourceFilter]);

  const filteredHosts = useMemo(() => {
    let list = allHosts;
    if (sourceFilter !== "todos") list = list.filter(h => h.source === sourceFilter);
    if (hostStatusFilter === "ativo") list = list.filter(h => h.status === "0");
    else if (hostStatusFilter === "inativo") list = list.filter(h => h.status !== "0");
    if (hostSearch.trim()) {
      const q = hostSearch.toLowerCase();
      list = list.filter(h =>
        h.hostname.toLowerCase().includes(q) ||
        h.name.toLowerCase().includes(q) ||
        h.ip.toLowerCase().includes(q) ||
        h.proxy.toLowerCase().includes(q) ||
        h.hostgroups.some(g => g.toLowerCase().includes(q)) ||
        h.templates.some(t => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allHosts, sourceFilter, hostStatusFilter, hostSearch]);

  const categorizedProblems = useMemo(() => {
    return filteredProblems.reduce<Record<Category, ZabbixProblem[]>>(
      (acc, p) => { acc[classifyProblem(p)].push(p); return acc; },
      { equipamentos: [], links: [], outros: [] }
    );
  }, [filteredProblems]);

  const totalProblems = filteredProblems.length;

  const toggleHost = (key: string) => {
    setExpandedHosts(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const toggleCsvField = (key: HostFieldKey) => {
    setCsvFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const exportCsv = () => {
    const fields = HOST_CSV_FIELDS.filter(f => csvFields.has(f.key));
    const header = fields.map(f => f.label).join(";");
    const rows = filteredHosts.map(h => {
      return fields.map(f => {
        switch (f.key) {
          case "status": return h.status === "0" ? "Ativo" : "Inativo";
          case "hostgroups": return h.hostgroups.join(", ");
          case "templates": return h.templates.join(", ");
          case "tags": return h.tags.map(t => `${t.tag}:${t.value}`).join(", ");
          case "source": return "2LOCK";
          default: return h[f.key] || "";
        }
      }).map(v => `"${String(v).replace(/"/g, '""')}"`).join(";");
    });

    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hosts_zabbix_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setShowCsvDialog(false);
  };

  const HOST_STATUS_OPTIONS = [
    { value: "todos", label: "Todos" },
    { value: "ativo", label: "Ativos" },
    { value: "inativo", label: "Inativos" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Monitoramento</h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento em tempo real
            {lastRefresh && <span className="ml-2">· Atualizado às {lastRefresh.toLocaleTimeString("pt-BR")}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ClearableSelect value={sourceFilter} onValueChange={setSourceFilter} options={SOURCE_OPTIONS} placeholder="Origem" defaultValue="todos" className="w-40" />
          <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/zabbix/tv")} className="gap-2">
            <Tv className="h-4 w-4" /> TV View
          </Button>
          <Button variant="outline" size="sm" onClick={() => { fetchData(); if (activeTab === "hosts") fetchHosts(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Problemas (High)" value={totalProblems} icon={AlertTriangle} color="text-red-500" loading={loading} />
        <KpiCard label="Manutenções Ativas" value={filteredMaintenances.length} icon={Wrench} color="text-yellow-500" loading={loading} />
        <KpiCard label="Em Manutenção (excluídos)" value={0} icon={ShieldCheck} color="text-green-500" loading={loading} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="problemas" className="gap-1">
            <AlertTriangle className="h-4 w-4" /> Problemas ({totalProblems})
          </TabsTrigger>
          <TabsTrigger value="manutencao" className="gap-1">
            <Wrench className="h-4 w-4" /> Manutenção ({filteredMaintenances.length})
          </TabsTrigger>
          <TabsTrigger value="hosts" className="gap-1">
            <Monitor className="h-4 w-4" /> Hosts
          </TabsTrigger>
        </TabsList>

        {/* PROBLEMS TAB */}
        <TabsContent value="problemas" className="space-y-4 mt-4">
          {loading ? (
            <LoadingSkeleton />
          ) : totalProblems === 0 ? (
            <EmptyState icon={CheckCircle2} message="Nenhum problema ativo no momento." />
          ) : (
            (["equipamentos", "links", "outros"] as Category[]).map((cat) => {
              const items = categorizedProblems[cat];
              if (items.length === 0) return null;
              const cfg = CATEGORY_CONFIG[cat];
              const Icon = cfg.icon;
              const groups = sortGroups(groupByHost(items), sortField, sortDir);

              return (
                <Card key={cat} className="border-l-4" style={{ borderLeftColor: `var(--${cat === "equipamentos" ? "blue" : cat === "links" ? "green" : "gray"}-500, #6b7280)` }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${cfg.color}`} />
                      {cfg.label}
                      <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground w-8"></th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("severity")}>
                              <span className="inline-flex items-center">Severidade <SortIcon field="severity" /></span>
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("host")}>
                              <span className="inline-flex items-center">Host <SortIcon field="host" /></span>
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("problem")}>
                              <span className="inline-flex items-center">Problema <SortIcon field="problem" /></span>
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleSort("duration")}>
                              <span className="inline-flex items-center">Duração <SortIcon field="duration" /></span>
                            </th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Updates</th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Contato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map((group) => {
                            const prefix = extractPrefix(group.hostCode);
                            const contato = prefix ? contatos[prefix] : null;
                            const sev = SEVERITY_CONFIG[String(group.highestSeverity)] || SEVERITY_CONFIG["0"];
                            const isMulti = group.problems.length > 1;
                            const isExpanded = expandedHosts.has(group.hostKey);
                            const uniqueTriggers = group.problems.map(p => p.triggerDescription || p.name).filter((v, i, a) => a.indexOf(v) === i);

                            return (
                              <GroupRows
                                key={group.hostKey}
                                group={group}
                                sev={sev}
                                isMulti={isMulti}
                                isExpanded={isExpanded}
                                uniqueTriggers={uniqueTriggers}
                                contato={contato}
                                onToggle={() => toggleHost(group.hostKey)}
                                onUpdated={() => fetchData(true)}
                              />
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* MAINTENANCE TAB */}
        <TabsContent value="manutencao" className="space-y-4 mt-4">
          {loading ? (
            <LoadingSkeleton />
          ) : filteredMaintenances.length === 0 ? (
            <EmptyState icon={CheckCircle2} message="Nenhuma manutenção ativa no momento." />
          ) : (
            filteredMaintenances.map((m) => (
              <Card key={m.maintenanceid}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-yellow-500" />
                    {m.name}
                    {m.source && (
                      <Badge variant="outline" className="text-[10px]">2LOCK</Badge>
                    )}
                    <Badge variant="outline" className="ml-auto text-xs">
                      {formatTimestamp(m.active_since)} → {formatTimestamp(m.active_till)}
                    </Badge>
                  </CardTitle>
                  {m.description && <p className="text-sm text-muted-foreground">{m.description}</p>}
                </CardHeader>
                <CardContent>
                  {m.hosts.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Hosts em manutenção</p>
                      <div className="flex flex-wrap gap-1">
                        {m.hosts.map((h) => (
                          <Badge key={h.hostid} variant="secondary" className="text-xs">{h.name || h.host}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {m.groups.length > 0 && (
                    <div className="space-y-1 mt-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Grupos</p>
                      <div className="flex flex-wrap gap-1">
                        {m.groups.map((g) => (
                          <Badge key={g.groupid} variant="outline" className="text-xs">{g.name}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* HOSTS TAB */}
        <TabsContent value="hosts" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Buscar host..."
              value={hostSearch}
              onChange={e => setHostSearch(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-64"
            />
            <ClearableSelect value={hostStatusFilter} onValueChange={setHostStatusFilter} options={HOST_STATUS_OPTIONS} placeholder="Status" defaultValue="todos" className="w-36" />
            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{filteredHosts.length} hosts</span>
              <Button variant="outline" size="sm" onClick={() => setShowCsvDialog(true)} disabled={filteredHosts.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          </div>

          {hostsLoading ? (
            <LoadingSkeleton />
          ) : filteredHosts.length === 0 ? (
            <EmptyState icon={Monitor} message="Nenhum host encontrado." />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Hostname</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">IP</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Proxy</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Host Groups</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Templates</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Tags</th>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">Origem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHosts.map((h) => (
                        <tr key={h.hostid} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2">
                            <Badge variant={h.status === "0" ? "default" : "secondary"} className={`text-[10px] ${h.status === "0" ? "bg-green-600 text-white" : "bg-gray-500 text-white"}`}>
                              {h.status === "0" ? "Ativo" : "Inativo"}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 font-medium whitespace-nowrap">{h.hostname}</td>
                          <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{h.ip || "—"}</td>
                          <td className="px-4 py-2 text-muted-foreground text-xs">{h.proxy || "—"}</td>
                          <td className="px-4 py-2 max-w-xs">
                            <div className="flex flex-wrap gap-1">
                              {h.hostgroups.slice(0, 3).map((g, i) => (
                                <Badge key={i} variant="outline" className="text-[10px]">{g}</Badge>
                              ))}
                              {h.hostgroups.length > 3 && <Badge variant="outline" className="text-[10px]">+{h.hostgroups.length - 3}</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-2 max-w-xs">
                            <div className="flex flex-wrap gap-1">
                              {h.templates.slice(0, 2).map((t, i) => (
                                <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t}</span>
                              ))}
                              {h.templates.length > 2 && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">+{h.templates.length - 2}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2 max-w-xs">
                            <div className="flex flex-wrap gap-1">
                              {h.tags.slice(0, 2).map((t, i) => (
                                <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{t.tag}{t.value ? `:${t.value}` : ""}</span>
                              ))}
                              {h.tags.length > 2 && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">+{h.tags.length - 2}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="text-[10px]">2LOCK</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* CSV Export Dialog */}
      <Dialog open={showCsvDialog} onOpenChange={setShowCsvDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar Hosts para CSV</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione os campos para incluir na exportação:</p>
          <div className="grid grid-cols-2 gap-3 py-2">
            {HOST_CSV_FIELDS.map(f => (
              <label key={f.key} className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={csvFields.has(f.key)}
                  onCheckedChange={() => toggleCsvField(f.key)}
                />
                <span className="text-sm">{f.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCsvDialog(false)}>Cancelar</Button>
            <Button onClick={exportCsv} disabled={csvFields.size === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar ({filteredHosts.length} hosts)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── GroupRows ────────────────────────────────────────────────────────────
function GroupRows({
  group, sev, isMulti, isExpanded, uniqueTriggers, contato, onToggle, onUpdated,
}: {
  group: HostGroup;
  sev: { label: string; bg: string; text: string };
  isMulti: boolean;
  isExpanded: boolean;
  uniqueTriggers: string[];
  contato: ZabbixContato | null;
  onToggle: () => void;
  onUpdated: () => void;
}) {
  const sortedProblems = [...group.problems].sort((a, b) => Number(b.clock) - Number(a.clock));
  const hasSecondUpdateAlert = group.problems.some(needsSecondUpdateAlert);

  return (
    <>
      <tr className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isMulti ? "cursor-pointer" : ""} ${hasSecondUpdateAlert ? "bg-destructive/10" : ""}`} onClick={isMulti ? onToggle : undefined}>
        <td className="px-2 py-2 text-center">
          {isMulti && (isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)}
        </td>
        <td className="px-4 py-2"><Badge className={`${sev.bg} ${sev.text} text-xs`}>{sev.label}</Badge></td>
        <td className="px-4 py-2 font-medium whitespace-nowrap">
          {group.hostName}
          {isMulti && <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0">{group.problems.length}</Badge>}
          {hasSecondUpdateAlert && (
            <Badge variant="destructive" className="ml-2 gap-1 text-[10px] px-1.5 py-0">
              <AlertTriangle className="h-3 w-3" /> 2º update pendente
            </Badge>
          )}
        </td>
        <td className="px-4 py-2 max-w-md">
          {isMulti ? (
            <div className="flex flex-wrap gap-1">
              {uniqueTriggers.map((name, i) => <span key={i} className="text-xs bg-muted px-1.5 py-0.5 rounded">{name}</span>)}
            </div>
          ) : (
            <span className="text-xs">{group.problems[0]?.triggerDescription || group.problems[0]?.name}</span>
          )}
        </td>
        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
          <Clock className="h-3 w-3 inline mr-1" />
          {isMulti ? formatDuration(group.newestClock) : formatDuration(Number(group.problems[0]?.clock))}
        </td>
        <td className="px-4 py-2"><AcksPopover acks={group.allAcks} /></td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-1">
            <ContactButton contato={contato} group={group} onUpdated={onUpdated} />
            <AbrirChamadoZabbixButton group={group} onUpdated={onUpdated} />
          </div>
        </td>
      </tr>
      {isMulti && isExpanded && sortedProblems.map((p) => {
        const pSev = SEVERITY_CONFIG[p.severity] || SEVERITY_CONFIG["0"];
        const pNeedsSecondUpdate = needsSecondUpdateAlert(p);
        return (
          <tr key={p.eventid} className={`border-b last:border-0 ${pNeedsSecondUpdate ? "bg-destructive/10" : "bg-muted/10"}`}>
            <td className="px-2 py-1.5"></td>
            <td className="px-4 py-1.5"><Badge className={`${pSev.bg} ${pSev.text} text-[10px]`}>{pSev.label}</Badge></td>
            <td className="px-4 py-1.5 text-xs text-muted-foreground pl-8">↳ {p.hosts?.[0]?.name || p.hosts?.[0]?.host}</td>
            <td className="px-4 py-1.5">
              <span className="text-xs">{p.triggerDescription || p.name}</span>
              {pNeedsSecondUpdate && <Badge variant="destructive" className="ml-2 text-[10px] px-1.5 py-0">2º update pendente</Badge>}
            </td>
            <td className="px-4 py-1.5 whitespace-nowrap text-muted-foreground text-xs"><Clock className="h-3 w-3 inline mr-1" />{formatDuration(Number(p.clock))}</td>
            <td className="px-4 py-1.5"><AcksPopover acks={p.acknowledges || []} /></td>
            <td className="px-4 py-1.5"></td>
          </tr>
        );
      })}
    </>
  );
}

// ── Acks Popover ────────────────────────────────────────────────────────
function AcksPopover({ acks }: { acks: any[] }) {
  if (acks.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const sorted = [...acks].sort((a, b) => Number(b.clock) - Number(a.clock));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 h-7 px-2">
          <MessageSquare className="h-4 w-4 text-blue-400" />
          <span className="text-xs">{acks.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="px-3 py-2 border-b bg-muted/40"><p className="text-sm font-medium">Updates ({acks.length})</p></div>
        <ScrollArea className="h-72">
          <div className="divide-y">
            {sorted.map((ack: any, idx: number) => (
              <div key={ack.acknowledgeid || idx} className="px-3 py-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-xs">{ack.user || "—"}</span>
                  <span className="text-xs text-muted-foreground">{formatTimestamp(ack.clock)}</span>
                </div>
                <p className="text-muted-foreground text-xs">{ack.message || "—"}</p>
              </div>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ── Contact Button ──────────────────────────────────────────────────────
function ContactButton({
  contato,
  group,
  onUpdated,
}: {
  contato: ZabbixContato | null;
  group: HostGroup;
  onUpdated: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "message" | "update">("menu");
  const [target, setTarget] = useState<"primeiro" | "responsavel">("primeiro");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const hasPrimeiro = !!contato?.primeiro_contato_nome;
  const hasResponsavel = !!contato?.responsavel_nome;
  const hasContato = hasPrimeiro || hasResponsavel;

  const reset = () => { setMode("menu"); setText(""); setTarget(hasPrimeiro ? "primeiro" : "responsavel"); };

  const close = () => { setOpen(false); setTimeout(reset, 200); };

  const sendMessage = async () => {
    if (!text.trim()) {
      toast({ title: "Digite a mensagem antes de enviar.", variant: "destructive" });
      return;
    }
    const nome = target === "primeiro" ? contato?.primeiro_contato_nome : contato?.responsavel_nome;
    const telefone = target === "primeiro" ? contato?.primeiro_contato_telefone : contato?.responsavel_telefone;
    if (!nome || !telefone) {
      toast({ title: "Contato selecionado não está disponível.", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const problemaResumo = group.problems
        .map(p => p.triggerDescription || p.name)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(" | ");
      const res = await supabase.functions.invoke("send-contato-webhook", {
        body: {
          tipo_contato: target,
          contato_nome: nome,
          contato_telefone: telefone,
          mensagem: text.trim(),
          host: group.hostName,
          problema: problemaResumo,
          prefixo: extractPrefix(group.hostCode) || null,
        },
      });
      if (res.error) throw new Error(res.error.message);
      toast({ title: "Mensagem enviada", description: `Para ${nome}` });
      close();
    } catch (err: any) {
      toast({ title: "Erro ao enviar mensagem", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const sendUpdate = async () => {
    if (!text.trim()) {
      toast({ title: "Digite o update antes de enviar.", variant: "destructive" });
      return;
    }
    const eventids = group.problems.map(p => p.eventid);
    const source = (group.problems[0] as any)?.source;
    setSending(true);
    try {
      await postZabbixUpdate(eventids, source, text.trim());
      toast({ title: "Update adicionado no Zabbix" });
      onUpdated();
      close();
    } catch (err: any) {
      toast({ title: "Erro ao adicionar update", description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTimeout(reset, 200); }}>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 h-7 px-2"
        onClick={(e) => { e.stopPropagation(); setTarget(hasPrimeiro ? "primeiro" : "responsavel"); setOpen(true); }}
      >
        <Phone className="h-4 w-4 text-green-500" />
        <span className="text-xs">Acionar</span>
      </Button>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Acionar — {group.hostName}</DialogTitle>
        </DialogHeader>

        {mode === "menu" && (
          <div className="space-y-4">
            {hasContato ? (
              <div className="rounded-lg border divide-y">
                {hasPrimeiro && (
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Primeiro Contato</p>
                    <p className="text-sm font-medium">{contato!.primeiro_contato_nome}</p>
                    <p className="text-xs text-muted-foreground">{contato!.primeiro_contato_telefone || "—"}</p>
                  </div>
                )}
                {hasResponsavel && (
                  <div className="px-3 py-2">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase">Responsável</p>
                    <p className="text-sm font-medium">{contato!.responsavel_nome}</p>
                    <p className="text-xs text-muted-foreground">{contato!.responsavel_telefone || "—"}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum contato cadastrado para este local.</p>
            )}

            <div className="grid grid-cols-1 gap-2">
              <Button onClick={() => setMode("message")} disabled={!hasContato} className="gap-2">
                <Send className="h-4 w-4" /> Enviar mensagem para um contato
              </Button>
              <Button variant="outline" onClick={() => setMode("update")} className="gap-2">
                <MessageSquarePlus className="h-4 w-4" /> Adicionar update no Zabbix
              </Button>
            </div>
          </div>
        )}

        {mode === "message" && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Destinatário</Label>
              <RadioGroup
                value={target}
                onValueChange={(v) => setTarget(v as any)}
                className="mt-2 space-y-1"
              >
                {hasPrimeiro && (
                  <label className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value="primeiro" className="mt-1" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Primeiro Contato</p>
                      <p className="text-sm font-medium">{contato!.primeiro_contato_nome}</p>
                      <p className="text-xs text-muted-foreground">{contato!.primeiro_contato_telefone || "—"}</p>
                    </div>
                  </label>
                )}
                {hasResponsavel && (
                  <label className="flex items-start gap-2 rounded-md border p-2 cursor-pointer hover:bg-muted/40">
                    <RadioGroupItem value="responsavel" className="mt-1" />
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-muted-foreground uppercase">Responsável</p>
                      <p className="text-sm font-medium">{contato!.responsavel_nome}</p>
                      <p className="text-xs text-muted-foreground">{contato!.responsavel_telefone || "—"}</p>
                    </div>
                  </label>
                )}
              </RadioGroup>
            </div>

            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Escreva a mensagem que será enviada ao contato..."
                rows={4}
                className="mt-1"
              />
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setMode("menu")} disabled={sending}>Voltar</Button>
              <Button onClick={sendMessage} disabled={sending} className="gap-2">
                <Send className="h-4 w-4" /> {sending ? "Enviando..." : "Enviar"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {mode === "update" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Adiciona uma mensagem (update) no(s) evento(s) ativo(s) deste host no Zabbix.
            </p>
            <div>
              <Label className="text-xs">Update</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Ex: Aberto chamado na operadora, aguardando retorno..."
                rows={4}
                className="mt-1"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setMode("menu")} disabled={sending}>Voltar</Button>
              <Button onClick={sendUpdate} disabled={sending} className="gap-2">
                <MessageSquarePlus className="h-4 w-4" /> {sending ? "Enviando..." : "Adicionar update"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
function formatDuration(epochSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  let diff = now - epochSeconds;
  if (diff < 0) diff = 0;
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimestamp(epoch: string): string {
  return new Date(Number(epoch) * 1000).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function KpiCard({ label, value, icon: Icon, color, loading }: { label: string; value: number; icon: React.ElementType; color: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`h-8 w-8 ${color} shrink-0`} />
        <div>
          {loading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-bold">{value}</p>}
          <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>)}
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <Card>
      <CardContent className="p-12 text-center">
        <Icon className="h-12 w-12 mx-auto text-green-500 mb-3" />
        <p className="text-lg font-medium">{message}</p>
      </CardContent>
    </Card>
  );
}
