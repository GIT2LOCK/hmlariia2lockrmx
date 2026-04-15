import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Server, Wifi, HardDrive, Wrench, RefreshCw, CheckCircle2, Clock, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────
interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
  status: string;
  maintenance_status: string;
  groups: { groupid: string; name: string }[];
  interfaces?: { ip: string; dns: string; type: string }[];
}

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
  acknowledges?: { alias: string; message: string; clock: string }[];
  tags?: { tag: string; value: string }[];
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

// ── Category mapping ────────────────────────────────────────────────────
type Category = "equipamentos" | "links" | "infraestrutura" | "outros";

const CATEGORY_CONFIG: Record<Category, { label: string; icon: React.ElementType; color: string }> = {
  equipamentos: { label: "EQUIPAMENTOS", icon: Server, color: "text-blue-400" },
  links: { label: "LINKS DE INTERNET", icon: Wifi, color: "text-green-400" },
  infraestrutura: { label: "INFRAESTRUTURA", icon: HardDrive, color: "text-purple-400" },
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

// Classify groups into categories - user should customize these keywords
function classifyGroup(groupNames: string[]): Category {
  const joined = groupNames.join(" ").toLowerCase();
  // Equipamentos: switches, roteadores, firewalls, controllers, nobreaks, modems, call managers
  if (/switch|roteador|firewall|controller.?wifi|nobreak|modem|call.?manager|vsat/i.test(joined)) return "equipamentos";
  // Links: Internet group
  if (/internet/i.test(joined)) return "links";
  // Infraestrutura: servers, hypervisors, VMs, databases, storage, datacenter, zabbix, grafana, PI
  if (/infra|servidor|server|linux|hypervisor|vmware|virtual.?machine|database|zabbix|grafana|data.?center|^pi$/i.test(joined)) return "infraestrutura";
  // SUB_ groups and Polo groups → equipamentos (field sites)
  if (/^sub_|^polo /i.test(joined)) return "equipamentos";
  // PRX groups → infraestrutura
  if (/^prx/i.test(joined)) return "infraestrutura";
  return "outros";
}

// ── Component ───────────────────────────────────────────────────────────
export default function DashboardZabbix() {
  const [problems, setProblems] = useState<ZabbixProblem[]>([]);
  const [maintenances, setMaintenances] = useState<ZabbixMaintenance[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [problemsRes, maintenanceRes] = await Promise.all([
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "problems" } }),
        supabase.functions.invoke("zabbix-dashboard", { body: { action: "maintenance" } }),
      ]);

      if (problemsRes.error) throw new Error(problemsRes.error.message);
      if (maintenanceRes.error) throw new Error(maintenanceRes.error.message);

      setProblems(Array.isArray(problemsRes.data) ? problemsRes.data : []);
      setMaintenances(Array.isArray(maintenanceRes.data) ? maintenanceRes.data : []);
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
    const interval = setInterval(fetchData, 60000); // auto-refresh 60s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Classify problems
  const categorizedProblems = problems.reduce<Record<Category, ZabbixProblem[]>>(
    (acc, p) => {
      const cat = classifyGroup(p.groups.map((g) => g.name));
      acc[cat].push(p);
      return acc;
    },
    { equipamentos: [], links: [], infraestrutura: [], outros: [] }
  );

  const totalProblems = problems.length;
  const severityCounts = problems.reduce<Record<string, number>>((acc, p) => {
    acc[p.severity] = (acc[p.severity] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Zabbix</h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento em tempo real
            {lastRefresh && (
              <span className="ml-2">
                · Atualizado às {lastRefresh.toLocaleTimeString("pt-BR")}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Problemas (Alta+)" value={totalProblems} icon={AlertTriangle} color="text-red-500" loading={loading} />
        <KpiCard label="Manutenções Ativas" value={maintenances.length} icon={Wrench} color="text-yellow-500" loading={loading} />
        <KpiCard label="Alta" value={severityCounts["4"] || 0} icon={ShieldAlert} color="text-red-500" loading={loading} />
        <KpiCard label="Desastre" value={severityCounts["5"] || 0} icon={ShieldAlert} color="text-red-900" loading={loading} />
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
            (["equipamentos", "links", "infraestrutura", "outros"] as Category[]).map((cat) => {
              const items = categorizedProblems[cat];
              if (items.length === 0) return null;
              const cfg = CATEGORY_CONFIG[cat];
              const Icon = cfg.icon;
              return (
                <Card key={cat} className="border-l-4" style={{ borderLeftColor: `var(--${cat === "equipamentos" ? "blue" : cat === "links" ? "green" : cat === "infraestrutura" ? "purple" : "gray"}-500, #6b7280)` }}>
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
                            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Ack</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p) => {
                            const sev = SEVERITY_CONFIG[p.severity] || SEVERITY_CONFIG["0"];
                            const hostName = p.hosts?.[0]?.name || p.hosts?.[0]?.host || "—";
                            const duration = formatDuration(Number(p.clock));
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
                                  {p.acknowledged === "1" ? (
                                    <ShieldCheck className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-red-400" />
                                  )}
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
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
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
