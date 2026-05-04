import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import {
  computeSlaSolucao,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  TicketPriority,
  TicketStatus,
  isClosed,
} from "@/lib/ticketSla";
import { TicketModal } from "@/components/TicketModal";
import { Plus, Search, RefreshCw, Filter, UserPlus2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface TicketRow {
  id: number;
  codigo: string;
  titulo: string;
  status: TicketStatus;
  prioridade: TicketPriority;
  data_abertura: string;
  data_solucao: string | null;
  data_primeiro_atendimento: string | null;
  sla_atendimento_minutos: number;
  sla_solucao_minutos: number;
  sla_pausa_inicio: string | null;
  sla_pausa_total_segundos: number;
  empresa_id: number | null;
  unidade_id: number | null;
  tecnico_id: number | null;
  empresas?: { nome_fantasia: string } | null;
  unidades?: { nome_unidade: string } | null;
  usuarios?: { nome: string } | null;
}

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  CRITICO: "bg-destructive text-destructive-foreground",
  ALTO: "bg-orange-500 text-white",
  MEDIO: "bg-amber-500 text-white",
  BAIXO: "bg-secondary text-secondary-foreground",
};

const STATUS_COLORS: Record<TicketStatus, string> = {
  NOVO: "bg-blue-500 text-white",
  TRIAGEM: "bg-cyan-500 text-white",
  EM_ATENDIMENTO: "bg-primary text-primary-foreground",
  AGUARDANDO_CLIENTE: "bg-amber-400 text-black",
  AGUARDANDO_OPERADORA: "bg-amber-500 text-white",
  AGUARDANDO_TERCEIRO: "bg-amber-600 text-white",
  AGENDADO: "bg-purple-500 text-white",
  RESOLVIDO: "bg-emerald-600 text-white",
  FECHADO: "bg-muted text-muted-foreground",
  CANCELADO: "bg-zinc-500 text-white",
};

const SLA_COLORS = {
  ok: "bg-emerald-600 text-white",
  warn: "bg-amber-500 text-white",
  overdue: "bg-destructive text-destructive-foreground animate-pulse",
  done: "bg-muted text-muted-foreground",
  paused: "bg-zinc-500 text-white",
};

export default function Chamados() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState<string>("ABERTOS");
  const [fPrio, setFPrio] = useState<string>("ALL");
  const [fTecnico, setFTecnico] = useState<string>("ALL");
  const [fEmpresa, setFEmpresa] = useState<string>("ALL");
  const [tecnicos, setTecnicos] = useState<{ id: number; nome: string }[]>([]);
  const [empresas, setEmpresas] = useState<{ id: number; nome_fantasia: string }[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [, setTick] = useState(0);

  // re-render every 30s para atualizar SLA
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(i);
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tickets")
      .select(`*,
        empresas:empresa_id(nome_fantasia),
        unidades:unidade_id(nome_unidade),
        usuarios:tecnico_id(nome)`)
      .order("data_abertura", { ascending: false })
      .limit(500);
    if (error) toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
    setTickets((data as any) || []);
    setLoading(false);
  };

  const loadFilters = async () => {
    const [t, e] = await Promise.all([
      supabase.from("usuarios").select("id,nome").eq("ativo", true).order("nome"),
      supabase.from("empresas").select("id,nome_fantasia").order("nome_fantasia"),
    ]);
    setTecnicos((t.data as any) || []);
    setEmpresas((e.data as any) || []);
  };

  useEffect(() => {
    load();
    loadFilters();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (fStatus === "ABERTOS" && isClosed(t.status)) return false;
      if (fStatus !== "ABERTOS" && fStatus !== "ALL" && t.status !== fStatus) return false;
      if (fPrio !== "ALL" && t.prioridade !== fPrio) return false;
      if (fTecnico !== "ALL" && String(t.tecnico_id || "") !== fTecnico) return false;
      if (fEmpresa !== "ALL" && String(t.empresa_id || "") !== fEmpresa) return false;
      if (q) {
        const blob = `${t.codigo} ${t.titulo} ${t.empresas?.nome_fantasia || ""} ${t.unidades?.nome_unidade || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, search, fStatus, fPrio, fTecnico, fEmpresa]);

  const stats = useMemo(() => {
    const open = tickets.filter((t) => !isClosed(t.status));
    const overdue = open.filter((t) => (computeSlaSolucao(t).remainingSeconds ?? 0) < 0).length;
    const critical = open.filter((t) => t.prioridade === "CRITICO").length;
    return { total: tickets.length, abertos: open.length, vencidos: overdue, criticos: critical };
  }, [tickets]);

  const changeStatus = async (id: number, status: TicketStatus) => {
    const t = tickets.find((x) => x.id === id);
    if (!t) return;
    const now = new Date().toISOString();
    const update: any = { status };

    const wasPaused = ["AGUARDANDO_CLIENTE","AGUARDANDO_OPERADORA","AGUARDANDO_TERCEIRO","AGENDADO","TRIAGEM"].includes(t.status);
    const willPause = ["AGUARDANDO_CLIENTE","AGUARDANDO_OPERADORA","AGUARDANDO_TERCEIRO","AGENDADO","TRIAGEM"].includes(status);

    if (!wasPaused && willPause) {
      update.sla_pausa_inicio = now;
    } else if (wasPaused && !willPause && t.sla_pausa_inicio) {
      const acc = (t.sla_pausa_total_segundos || 0) + Math.round((Date.now() - new Date(t.sla_pausa_inicio).getTime()) / 1000);
      update.sla_pausa_inicio = null;
      update.sla_pausa_total_segundos = acc;
    }

    if (status === "EM_ATENDIMENTO" && !t.data_primeiro_atendimento) {
      update.data_primeiro_atendimento = now;
    }
    if (status === "RESOLVIDO" && !t.data_solucao) update.data_solucao = now;
    if (status === "FECHADO") update.data_fechamento = now;

    const { error } = await supabase.from("tickets").update(update).eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("ticket_history").insert({
      ticket_id: id, campo: "status",
      valor_anterior: t.status, valor_novo: status,
    });
    toast({ title: "Status atualizado" });
    load();
  };

  const assignTo = async (id: number, tecnico_id: number | null) => {
    const t = tickets.find((x) => x.id === id);
    if (!t) return;
    const { error } = await supabase.from("tickets").update({ tecnico_id }).eq("id", id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await supabase.from("ticket_history").insert({
      ticket_id: id, campo: "tecnico_id",
      valor_anterior: t.tecnico_id?.toString() || null,
      valor_novo: tecnico_id?.toString() || null,
    });
    toast({ title: "Técnico atribuído" });
    load();
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Chamados</h1>
          <p className="text-sm text-muted-foreground">Service Desk / NOC</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={load} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => { setEditId(null); setModalOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Novo chamado
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total" value={stats.total} />
        <StatCard title="Abertos" value={stats.abertos} accent="text-primary" />
        <StatCard title="Críticos abertos" value={stats.criticos} accent="text-destructive" />
        <StatCard title="SLA vencido" value={stats.vencidos} accent="text-destructive" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" /> Filtros
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <div className="md:col-span-2 relative">
            <Search className="h-4 w-4 absolute left-2 top-3 text-muted-foreground" />
            <Input
              placeholder="Buscar por código, título, cliente, unidade..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ABERTOS">Abertos</SelectItem>
              <SelectItem value="ALL">Todos</SelectItem>
              {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPrio} onValueChange={setFPrio}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todas prioridades</SelectItem>
              {PRIORITY_ORDER.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fTecnico} onValueChange={setFTecnico}>
            <SelectTrigger><SelectValue placeholder="Técnico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos técnicos</SelectItem>
              {tecnicos.map((t) => <SelectItem key={t.id} value={t.id.toString()}>{t.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fEmpresa} onValueChange={setFEmpresa}>
            <SelectTrigger><SelectValue placeholder="Cliente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos clientes</SelectItem>
              {empresas.map((e) => <SelectItem key={e.id} value={e.id.toString()}>{e.nome_fantasia}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Código</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Cliente / Unidade</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>SLA Solução</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum chamado encontrado</TableCell></TableRow>
              )}
              {!loading && filtered.map((t) => {
                const sla = computeSlaSolucao(t);
                return (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/dashboard/chamados/${t.id}`)}
                  >
                    <TableCell className="font-mono text-xs">{t.codigo}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{t.titulo}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{t.empresas?.nome_fantasia || "—"}</div>
                      <div className="text-muted-foreground">{t.unidades?.nome_unidade || "—"}</div>
                    </TableCell>
                    <TableCell className="text-xs">{t.usuarios?.nome || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      <Badge className={PRIORITY_COLORS[t.prioridade]}>{PRIORITY_LABELS[t.prioridade]}</Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Badge className={`${STATUS_COLORS[t.status]} cursor-pointer`}>{STATUS_LABELS[t.status]}</Badge>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel>Alterar status</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {STATUS_ORDER.map((s) => (
                            <DropdownMenuItem key={s} onClick={() => changeStatus(t.id, s)}>
                              {STATUS_LABELS[s]}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell>
                      <Badge className={SLA_COLORS[sla.level]}>{sla.label}</Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" title="Atribuir técnico">
                            <UserPlus2 className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuLabel>Atribuir a</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => assignTo(t.id, null)}>— Sem atribuição</DropdownMenuItem>
                          {tecnicos.map((u) => (
                            <DropdownMenuItem key={u.id} onClick={() => assignTo(t.id, u.id)}>{u.nome}</DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TicketModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        ticketId={editId}
        onSaved={load}
      />
    </div>
  );
}

function StatCard({ title, value, accent }: { title: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent || ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
