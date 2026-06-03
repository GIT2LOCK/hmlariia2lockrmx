import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Ticket, Activity, Clock, CheckCircle2, ShieldCheck, AlertTriangle, RefreshCw, ArrowRight, ArrowUp, ArrowDown,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Periodo = "hoje" | "7d" | "30d" | "mes_atual" | "mes_anterior";

function getRange(p: Periodo): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (p === "hoje") { from.setHours(0, 0, 0, 0); }
  else if (p === "7d") { from.setDate(now.getDate() - 7); }
  else if (p === "30d") { from.setDate(now.getDate() - 30); }
  else if (p === "mes_atual") { from.setDate(1); from.setHours(0, 0, 0, 0); }
  else if (p === "mes_anterior") {
    from.setMonth(now.getMonth() - 1, 1); from.setHours(0, 0, 0, 0);
    to.setDate(1); to.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

function fmtMin(min?: number | null) {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function Variation({ now, prev }: { now: number; prev: number }) {
  if (!prev) return <span className="text-xs text-muted-foreground">vs. anterior: —</span>;
  const diff = now - prev;
  const pct = Math.round((diff / prev) * 100);
  const Icon = diff >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className={`text-xs inline-flex items-center gap-1 ${diff >= 0 ? "text-orange-600" : "text-emerald-600"}`}>
      <Icon className="h-3 w-3" /> {Math.abs(pct)}% vs. anterior
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  NOVO: "hsl(215 85% 65%)",
  TRIAGEM: "hsl(280 65% 60%)",
  EM_ATENDIMENTO: "hsl(235 100% 45%)",
  AGUARDANDO_CLIENTE: "hsl(40 95% 55%)",
  AGUARDANDO_OPERADORA: "hsl(25 90% 55%)",
  AGUARDANDO_TERCEIRO: "hsl(15 85% 55%)",
  AGENDADO: "hsl(190 70% 50%)",
  RESOLVIDO: "hsl(160 65% 45%)",
  FECHADO: "hsl(220 15% 50%)",
  CANCELADO: "hsl(0 0% 55%)",
};

export default function DashboardAtendimento() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const { from, to } = useMemo(() => getRange(periodo), [periodo]);

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const kpisQ = useQuery({
    queryKey: ["dash-kpis", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_dashboard_kpis", { _from: fromIso, _to: toIso });
      if (error) throw error;
      return data as any;
    },
  });

  const statusQ = useQuery({
    queryKey: ["dash-status"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_dashboard_by_status");
      if (error) throw error;
      return (data ?? []) as { status: string; total: number }[];
    },
  });

  const filaQ = useQuery({
    queryKey: ["dash-fila"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_dashboard_by_fila");
      if (error) throw error;
      return (data ?? []) as { fila_id: number | null; fila_nome: string; total: number }[];
    },
  });

  const tecQ = useQuery({
    queryKey: ["dash-tec", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_dashboard_tecnicos", { _from: fromIso, _to: toIso });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const serieQ = useQuery({
    queryKey: ["dash-serie", fromIso, toIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_dashboard_serie_diaria", { _from: fromIso, _to: toIso });
      if (error) throw error;
      return (data ?? []) as { dia: string; abertos: number; fechados: number }[];
    },
  });

  const atencaoQ = useQuery({
    queryKey: ["dash-atencao"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_dashboard_pontos_atencao");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Realtime: invalidate on any ticket change (debounced)
  useEffect(() => {
    let t: any;
    const ch = supabase
      .channel("dash-tickets")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "tickets" }, () => {
        clearTimeout(t);
        t = setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["dash-kpis"] });
          qc.invalidateQueries({ queryKey: ["dash-status"] });
          qc.invalidateQueries({ queryKey: ["dash-fila"] });
          qc.invalidateQueries({ queryKey: ["dash-tec"] });
          qc.invalidateQueries({ queryKey: ["dash-serie"] });
          qc.invalidateQueries({ queryKey: ["dash-atencao"] });
        }, 1500);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); clearTimeout(t); };
  }, [qc]);

  const k = kpisQ.data || {};
  const totalPer = Number(k.total_periodo || 0);
  const slaPct = totalPer ? Math.round((Number(k.sla_res_met || 0) / totalPer) * 100) : 0;
  const violPct = totalPer ? Math.round((Number(k.sla_res_breached || 0) / totalPer) * 100) : 0;

  const goChamados = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    navigate(`/dashboard/chamados${qs ? "?" + qs : ""}`);
  };

  const refreshAll = () => qc.invalidateQueries();

  return (
    <div className="space-y-6">
      {/* Header + filtros */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard de Atendimento</h1>
          <p className="text-sm text-muted-foreground">Visão operacional dos chamados, SLA e desempenho da equipe.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hoje">Hoje</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="mes_atual">Este mês</SelectItem>
              <SelectItem value="mes_anterior">Mês anterior</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={refreshAll} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiCard
          title="Chamados abertos" value={k.abertos ?? 0} icon={Ticket} tone="neutral"
          footer={<Variation now={Number(k.abertos || 0)} prev={Number(k.abertos_anterior || 0)} />}
          onClick={() => goChamados({ status: "abertos" })}
        />
        <KpiCard
          title="Em atendimento" value={k.em_atendimento ?? 0} icon={Activity} tone="info"
          onClick={() => goChamados({ status: "EM_ATENDIMENTO" })}
        />
        <KpiCard
          title="Aguardando cliente" value={k.aguardando_cliente ?? 0} icon={Clock} tone="warning"
          onClick={() => goChamados({ status: "AGUARDANDO_CLIENTE" })}
        />
        <KpiCard
          title="Fechados hoje" value={k.fechados_hoje ?? 0} icon={CheckCircle2} tone="success"
          footer={<span className="text-xs text-muted-foreground">TMS: {fmtMin(k.tms_minutos_fechados_hoje)}</span>}
          onClick={() => goChamados({ fechado: "hoje" })}
        />
        <KpiCard
          title="SLA cumprido" value={`${slaPct}%`} icon={ShieldCheck} tone="success"
          footer={<span className="text-xs text-muted-foreground">{k.sla_res_met ?? 0} de {totalPer}</span>}
          onClick={() => goChamados({ sla: "met" })}
        />
        <KpiCard
          title="SLA violado" value={k.sla_res_breached ?? 0} icon={AlertTriangle} tone="danger"
          footer={<span className="text-xs text-muted-foreground">{violPct}% do período</span>}
          onClick={() => goChamados({ sla: "breached" })}
        />
      </div>

      {/* Tempos médios */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tempo médio de atendimento</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{fmtMin(k.tma_minutos)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tempo médio de solução</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{fmtMin(k.tms_minutos)}</div></CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Chamados por status</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusQ.data || []} dataKey="total" nameKey="status" outerRadius={90} label>
                  {(statusQ.data || []).map((s, i) => (
                    <Cell key={i} fill={STATUS_COLORS[s.status] || "hsl(235 100% 18%)"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Chamados por fila (abertos)</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filaQ.data || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fila_nome" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="hsl(215 85% 65%)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Abertos x Fechados por dia</CardTitle></CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={(serieQ.data || []).map(d => ({ ...d, dia: new Date(d.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }))}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="abertos" stroke="hsl(235 100% 45%)" strokeWidth={2} name="Abertos" />
                <Line type="monotone" dataKey="fechados" stroke="hsl(160 65% 45%)" strokeWidth={2} name="Fechados" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Desempenho dos técnicos */}
      <Card>
        <CardHeader><CardTitle className="text-base">Desempenho dos técnicos</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Técnico</TableHead>
                <TableHead className="text-right">Abertos</TableHead>
                <TableHead className="text-right">Em atendimento</TableHead>
                <TableHead className="text-right">Aguardando cliente</TableHead>
                <TableHead className="text-right">Fechados no período</TableHead>
                <TableHead className="text-right">SLA OK</TableHead>
                <TableHead className="text-right">SLA violado</TableHead>
                <TableHead className="text-right">TMA</TableHead>
                <TableHead className="text-right">TMS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tecQ.data || []).map((t: any) => (
                <TableRow key={t.tecnico_id} className="cursor-pointer hover:bg-muted/50" onClick={() => goChamados({ tecnico: String(t.tecnico_id) })}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={t.avatar_url || undefined} />
                        <AvatarFallback>{(t.tecnico_nome || "?").slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{t.tecnico_nome}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{t.abertos}</TableCell>
                  <TableCell className="text-right">{t.em_atendimento}</TableCell>
                  <TableCell className="text-right">{t.aguardando_cliente}</TableCell>
                  <TableCell className="text-right">{t.fechados_periodo}</TableCell>
                  <TableCell className="text-right text-emerald-600">{t.sla_cumprido}</TableCell>
                  <TableCell className="text-right text-destructive">{t.sla_violado}</TableCell>
                  <TableCell className="text-right">{fmtMin(t.tma_minutos)}</TableCell>
                  <TableCell className="text-right">{fmtMin(t.tms_minutos)}</TableCell>
                </TableRow>
              ))}
              {(!tecQ.data || tecQ.data.length === 0) && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhum chamado atribuído.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pontos de atenção */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" /> Pontos de atenção
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(atencaoQ.data || []).map((a: any) => (
            <div
              key={a.id}
              className="flex items-center justify-between border rounded-md p-3 hover:bg-muted/50 cursor-pointer"
              onClick={() => navigate(`/dashboard/chamados/${a.id}`)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">{a.codigo}</span>
                  <span className="font-medium truncate">{a.titulo}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">{a.status}</Badge>
                  <Badge variant="secondary" className="text-xs">{a.prioridade}</Badge>
                  {a.tecnico_nome ? (
                    <span className="text-xs text-muted-foreground">{a.tecnico_nome}</span>
                  ) : (
                    <span className="text-xs text-destructive">Sem responsável</span>
                  )}
                  {a.motivo && <span className="text-xs text-orange-600">• {a.motivo}</span>}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </div>
          ))}
          {(!atencaoQ.data || atencaoQ.data.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum ponto crítico no momento.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  title, value, icon: Icon, tone, footer, onClick,
}: {
  title: string; value: number | string;
  icon: React.ElementType;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
  footer?: React.ReactNode;
  onClick?: () => void;
}) {
  const toneClass = {
    neutral: "text-foreground",
    info: "text-primary",
    warning: "text-orange-600",
    success: "text-emerald-600",
    danger: "text-destructive",
  }[tone];
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${toneClass}`}>{value}</div>
        {footer && <div className="mt-1">{footer}</div>}
      </CardContent>
    </Card>
  );
}
