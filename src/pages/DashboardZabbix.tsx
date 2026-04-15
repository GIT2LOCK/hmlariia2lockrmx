import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Server, Wifi, Wrench, RefreshCw, CheckCircle2, Clock, ShieldCheck, MessageSquare, Phone, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

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
}

interface ZabbixContato {
  prefixo: string;
  primeiro_contato_nome: string | null;
  primeiro_contato_telefone: string | null;
  responsavel_nome: string | null;
  responsavel_telefone: string | null;
}

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
  // If the backend already classified it (Zabbix 2), use that
  if (problem.category && (problem.category === "equipamentos" || problem.category === "links" || problem.category === "outros")) {
    return problem.category as Category;
  }
  // Zabbix 1 classification
  const name = problem.triggerDescription || problem.name || "";
  if (/indisponibilidade.*equipamento/i.test(name)) return "equipamentos";
  if (/indisponibilidade.*link/i.test(name)) return "links";
  return "outros";
}

/** Extract numeric prefix from Zabbix hostname, e.g. "003BRV_VIVW1" → "003" */
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
  oldestClock: number;
  allAcks: any[];
}

function groupByHost(items: ZabbixProblem[]): HostGroup[] {
  const map = new Map<string, HostGroup>();
  for (const p of items) {
    const hostName = p.hosts?.[0]?.name || p.hosts?.[0]?.host || "—";
    const hostCode = p.hosts?.[0]?.host || p.hosts?.[0]?.name || "";
    const key = hostCode || hostName;
    if (!map.has(key)) {
      map.set(key, { hostKey: key, hostName, hostCode, problems: [], oldestClock: Infinity, allAcks: [] });
    }
    const g = map.get(key)!;
    g.problems.push(p);
    const clock = Number(p.clock);
    if (clock < g.oldestClock) g.oldestClock = clock;
    g.allAcks.push(...(p.acknowledges || []));
  }
  // Sort groups by oldest clock (longest down first)
  return Array.from(map.values()).sort((a, b) => a.oldestClock - b.oldestClock);
}

// ── Component ───────────────────────────────────────────────────────────
export default function DashboardZabbix() {
  const [problems, setProblems] = useState<ZabbixProblem[]>([]);
  const [maintenances, setMaintenances] = useState<ZabbixMaintenance[]>([]);
  const [contatos, setContatos] = useState<Record<string, ZabbixContato>>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [problemsRes, maintenanceRes, contatosRes] = await Promise.all([
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "problems" } }),
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "maintenance" } }),
        supabase.from("zabbix_contatos").select("prefixo, primeiro_contato_nome, primeiro_contato_telefone, responsavel_nome, responsavel_telefone"),
      ]);

      if (problemsRes.error) throw new Error(problemsRes.error.message);
      if (maintenanceRes.error) throw new Error(maintenanceRes.error.message);

      setProblems(Array.isArray(problemsRes.data) ? problemsRes.data : []);
      setMaintenances(Array.isArray(maintenanceRes.data) ? maintenanceRes.data : []);

      // Build contatos map by prefix
      const map: Record<string, ZabbixContato> = {};
      if (contatosRes.data) {
        for (const c of contatosRes.data as any[]) {
          map[c.prefixo] = c;
        }
      }
      setContatos(map);
      setLastRefresh(new Date());
    } catch (err: any) {
      console.error("Zabbix fetch error:", err);
      toast({ title: "Erro ao buscar dados do Zabbix", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const categorizedProblems = problems.reduce<Record<Category, ZabbixProblem[]>>(
    (acc, p) => {
      const cat = classifyProblem(p);
      acc[cat].push(p);
      return acc;
    },
    { equipamentos: [], links: [], outros: [] }
  );

  const totalProblems = problems.length;

  const toggleHost = (key: string) => {
    setExpandedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitoramento</h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento em tempo real
            {lastRefresh && (
              <span className="ml-2">· Atualizado às {lastRefresh.toLocaleTimeString("pt-BR")}</span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard label="Problemas (High)" value={totalProblems} icon={AlertTriangle} color="text-red-500" loading={loading} />
        <KpiCard label="Manutenções Ativas" value={maintenances.length} icon={Wrench} color="text-yellow-500" loading={loading} />
        <KpiCard label="Em Manutenção (excluídos)" value={0} icon={ShieldCheck} color="text-green-500" loading={loading} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="problemas" className="w-full">
        <TabsList>
          <TabsTrigger value="problemas" className="gap-1">
            <AlertTriangle className="h-4 w-4" /> Problemas ({totalProblems})
          </TabsTrigger>
          <TabsTrigger value="manutencao" className="gap-1">
            <Wrench className="h-4 w-4" /> Manutenção ({maintenances.length})
          </TabsTrigger>
        </TabsList>

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
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Severidade</th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Host</th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Problema</th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Duração</th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Updates</th>
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Contato</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p) => {
                            const sev = SEVERITY_CONFIG[p.severity] || SEVERITY_CONFIG["0"];
                            const hostName = p.hosts?.[0]?.name || p.hosts?.[0]?.host || "—";
                            const hostCode = p.hosts?.[0]?.host || p.hosts?.[0]?.name || "";
                            const prefix = extractPrefix(hostCode);
                            const contato = prefix ? contatos[prefix] : null;
                            const duration = formatDuration(Number(p.clock));
                            const acks = p.acknowledges || [];
                            return (
                              <tr key={p.eventid} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-2">
                                  <Badge className={`${sev.bg} ${sev.text} text-xs`}>{sev.label}</Badge>
                                </td>
                                <td className="px-4 py-2 font-medium whitespace-nowrap">{hostName}</td>
                                <td className="px-4 py-2 max-w-md truncate">{p.triggerDescription || p.name}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                                  <Clock className="h-3 w-3 inline mr-1" />{duration}
                                </td>
                                <td className="px-4 py-2">
                                  {acks.length > 0 ? (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button variant="ghost" size="sm" className="gap-1 h-7 px-2">
                                          <MessageSquare className="h-4 w-4 text-blue-400" />
                                          <span className="text-xs">{acks.length}</span>
                                        </Button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-96 p-0" align="end">
                                        <div className="px-3 py-2 border-b bg-muted/40">
                                          <p className="text-sm font-medium">Updates ({acks.length})</p>
                                        </div>
                                        <ScrollArea className="max-h-64">
                                          <div className="divide-y">
                                            {acks.map((ack: any, idx: number) => (
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
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  <ContactButton contato={contato} />
                                </td>
                              </tr>
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

        <TabsContent value="manutencao" className="space-y-4 mt-4">
          {loading ? (
            <LoadingSkeleton />
          ) : maintenances.length === 0 ? (
            <EmptyState icon={CheckCircle2} message="Nenhuma manutenção ativa no momento." />
          ) : (
            maintenances.map((m) => (
              <Card key={m.maintenanceid}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-yellow-500" />
                    {m.name}
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
      </Tabs>
    </div>
  );
}

// ── Contact Button ──────────────────────────────────────────────────────
function ContactButton({ contato }: { contato: ZabbixContato | null }) {
  if (!contato) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const hasPrimeiro = !!contato.primeiro_contato_nome;
  const hasResponsavel = !!contato.responsavel_nome;

  if (!hasPrimeiro && !hasResponsavel) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 h-7 px-2">
          <Phone className="h-4 w-4 text-green-500" />
          <span className="text-xs">Acionar</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="px-3 py-2 border-b bg-muted/40">
          <p className="text-sm font-medium">Contatos do Local</p>
        </div>
        <div className="divide-y">
          {hasPrimeiro && (
            <div className="px-3 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Primeiro Contato</p>
              <p className="text-sm font-medium">{contato.primeiro_contato_nome}</p>
              <p className="text-sm text-muted-foreground">{contato.primeiro_contato_telefone}</p>
            </div>
          )}
          {hasResponsavel && (
            <div className="px-3 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Responsável</p>
              <p className="text-sm font-medium">{contato.responsavel_nome}</p>
              <p className="text-sm text-muted-foreground">{contato.responsavel_telefone}</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
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
      {[1, 2, 3].map((i) => (
        <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
      ))}
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
