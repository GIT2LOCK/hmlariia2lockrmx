import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Search, Play, Pause, CheckCircle2, RotateCcw, LayoutGrid, Columns3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";

type Status = "PENDENTE" | "EM_ANDAMENTO" | "PAUSADO" | "INSTALADO";
interface Elevador {
  id: number; unidade_id: number; tipo: string; marca: string | null; numero_serie: string | null;
  status: Status; instalado_em: string | null; iniciado_em: string | null;
  ini?: { nome: string } | null; fim?: { nome: string } | null;
}
interface Loja { unidade_id: number; ano_migracao: string | null; lote: string | null; data_prevista: string | null; estoque_leitoras: number; observacoes: string | null; unidades?: { nome_unidade: string } }

const STATUS_LABEL: Record<Status, string> = { PENDENTE: "Pendente", EM_ANDAMENTO: "Em andamento", PAUSADO: "Pausado", INSTALADO: "Instalado" };
const STATUS_VARIANT: Record<Status, "outline" | "secondary" | "default" | "destructive"> = { PENDENTE: "outline", EM_ANDAMENTO: "secondary", PAUSADO: "destructive", INSTALADO: "default" };
const db = supabase as any;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

type Acao = { id: number; to: Status; label: string };

export default function Elevadores() {
  const { toast } = useToast();
  const { isAdmin, user } = useUser();
  const admin = isAdmin || user?.role === "SUPERADMIN" || user?.role === "ADMIN";
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [elev, setElev] = useState<Elevador[]>([]);
  const [busca, setBusca] = useState("");
  const [lote, setLote] = useState("todos");
  const [fStatus, setFStatus] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Acao | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [visao, setVisao] = useState<"lojas" | "kanban">("lojas");

  const load = async () => {
    const [l, e] = await Promise.all([
      db.from("elev_lojas").select("*, unidades(nome_unidade)"),
      db.from("elev_elevadores").select("*, ini:usuarios!elev_elevadores_iniciado_por_fkey(nome), fim:usuarios!elev_elevadores_instalado_por_fkey(nome)").order("id"),
    ]);
    if (l.error || e.error) toast({ title: "Erro ao carregar", description: (l.error || e.error).message, variant: "destructive" });
    setLojas(l.data || []); setElev(e.data || []); setLoading(false);
  };
  useEffect(() => {
    load();
    const ch = db.channel("elev-rt").on("postgres_changes", { event: "*", schema: "public", table: "elev_elevadores" }, () => load()).subscribe();
    return () => { db.removeChannel(ch); };
  }, []);

  const executar = async (a: Acao) => {
    setBusy(a.id);
    const { error } = await db.from("elev_elevadores").update({ status: a.to }).eq("id", a.id);
    setBusy(null); setConfirm(null);
    if (error) {
      const msg = error.message.includes("transicao_nao_permitida") ? "Essa ação não é permitida no estado atual (talvez alguém já tenha iniciado)." : error.message;
      toast({ title: "Não foi possível atualizar", description: msg, variant: "destructive" });
    } else toast({ title: `${a.label} registrado` });
    load();
  };

  const acoes = (e: Elevador): Acao[] => {
    const r: Acao[] = [];
    if (e.status === "PENDENTE") r.push({ id: e.id, to: "EM_ANDAMENTO", label: "Iniciar" });
    if (e.status === "EM_ANDAMENTO") r.push({ id: e.id, to: "PAUSADO", label: "Pausar" });
    if (e.status === "PAUSADO") r.push({ id: e.id, to: "EM_ANDAMENTO", label: "Retomar" });
    if (e.status === "EM_ANDAMENTO" || e.status === "PAUSADO" || (admin && e.status === "PENDENTE")) r.push({ id: e.id, to: "INSTALADO", label: "Encerrar" });
    if (admin && e.status !== "PENDENTE") r.push({ id: e.id, to: "PENDENTE", label: "Reiniciar" });
    return r;
  };
  const icon = (l: string) => l === "Iniciar" || l === "Retomar" ? Play : l === "Pausar" ? Pause : l === "Encerrar" ? CheckCircle2 : RotateCcw;

  const lotes = useMemo(() => Array.from(new Set(lojas.map((l) => l.lote || "Concluído"))).sort(), [lojas]);
  const count = (s: Status) => elev.filter((e) => e.status === s).length;
  const total = elev.length, inst = count("INSTALADO");

  const lista = lojas
    .filter((l) => lote === "todos" || (l.lote || "Concluído") === lote)
    .filter((l) => !busca || (l.unidades?.nome_unidade || "").toLowerCase().includes(busca.toLowerCase()))
    .map((l) => ({ l, es: elev.filter((e) => e.unidade_id === l.unidade_id && (fStatus === "todos" || e.status === fStatus)) }))
    .filter((x) => fStatus === "todos" || x.es.length)
    .sort((a, b) => (a.l.data_prevista || "9999").localeCompare(b.l.data_prevista || "9999") || (a.l.unidades?.nome_unidade || "").localeCompare(b.l.unidades?.nome_unidade || ""));

  const kpis = [
    { label: "Elevadores", value: total },
    { label: "Instalados", value: inst },
    { label: "Em andamento", value: count("EM_ANDAMENTO") },
    { label: "Pausados", value: count("PAUSADO") },
    { label: "Pendentes", value: count("PENDENTE") },
  ];

  const lojaPorId = useMemo(() => new Map(lojas.map((l) => [l.unidade_id, l])), [lojas]);
  const lojaNome = (id: number) => lojaPorId.get(id)?.unidades?.nome_unidade || `Loja ${id}`;
  const lojasVisiveis = useMemo(() => new Set(lista.map((x) => x.l.unidade_id)), [lista]);
  const elevKanban = elev.filter((e) => lojasVisiveis.has(e.unidade_id) && (fStatus === "todos" || e.status === fStatus));

  const renderElevador = (e: Elevador, showLoja = false) => (
    <div key={e.id} className="rounded-lg border border-border bg-card p-3 space-y-2 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showLoja && <p className="text-xs font-semibold text-primary truncate">{lojaNome(e.unidade_id)}</p>}
          <p className="font-medium text-sm text-foreground">{e.tipo}</p>
          <p className="text-xs text-muted-foreground">{e.marca || "Marca —"} · Série {e.numero_serie || "—"}</p>
        </div>
        <Badge variant={STATUS_VARIANT[e.status]}>{STATUS_LABEL[e.status]}</Badge>
      </div>
      {(e.iniciado_em || e.instalado_em) && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {e.iniciado_em && <p>Iniciado {fmt(e.iniciado_em)}{e.ini?.nome ? ` por ${e.ini.nome}` : ""}</p>}
          {e.instalado_em && <p>Encerrado {fmt(e.instalado_em)}{e.fim?.nome ? ` por ${e.fim.nome}` : ""}</p>}
        </div>
      )}
      {acoes(e).length > 0 && (
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          {acoes(e).map((a) => {
            const I = icon(a.label);
            return (
              <Button key={a.label} size="sm" className="h-10 sm:h-9"
                variant={a.label === "Iniciar" || a.label === "Retomar" || a.label === "Encerrar" ? "default" : "outline"}
                disabled={busy === e.id} onClick={() => setConfirm(a)}>
                <I className="h-4 w-4 mr-1" />{a.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <main className="space-y-4 sm:space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><ArrowUpDown className="h-6 w-6" /></div>
        <div>
          <h1 className="text-lg sm:text-2xl font-semibold text-foreground">Implantação — Elevadores</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">GoodStorage · controle de acesso por loja</p>
        </div>
      </header>

      <section className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
        {kpis.map((k) => (
          <Card key={k.label}><CardContent className="p-3 sm:p-4">
            <p className="text-[11px] sm:text-xs text-muted-foreground">{k.label}</p>
            <p className="text-xl sm:text-2xl font-semibold text-foreground">{k.value}</p>
          </CardContent></Card>
        ))}
      </section>
      <Card><CardContent className="p-3 sm:p-4 space-y-2">
        <div className="flex justify-between text-sm"><span>Progresso geral</span><span>{total ? Math.round((inst / total) * 100) : 0}%</span></div>
        <Progress value={total ? (inst / total) * 100 : 0} />
      </CardContent></Card>

      <div className="sticky top-0 z-10 -mx-1 flex flex-col sm:flex-row gap-2 bg-background/95 px-1 py-2 backdrop-blur">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar loja..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={lote} onValueChange={setLote}>
            <SelectTrigger className="sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os lotes</SelectItem>
              {lotes.map((l) => <SelectItem key={l} value={l}>{/^\d$/.test(l) ? `Lote ${l}` : l === "2027" ? "Migração 2027" : l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="sm:w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
        <div className="space-y-3 sm:space-y-4">
          {lista.map(({ l, es }) => {
            const all = elev.filter((e) => e.unidade_id === l.unidade_id);
            const ok = all.filter((e) => e.status === "INSTALADO").length;
            return (
              <Card key={l.unidade_id}>
                <CardHeader className="p-3 sm:p-6 pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{l.unidades?.nome_unidade}</CardTitle>
                    <Badge variant={ok === all.length && all.length ? "default" : "secondary"}>{ok}/{all.length} instalados</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="outline">{l.lote ? (/^\d$/.test(l.lote) ? `Lote ${l.lote}` : `Migração ${l.lote}`) : "Concluído"}</Badge>
                    {l.data_prevista && <Badge variant="outline">Previsto {new Date(l.data_prevista + "T12:00").toLocaleDateString("pt-BR")}</Badge>}
                    <Badge variant="outline">Leitoras: {l.estoque_leitoras}</Badge>
                  </div>
                  {l.observacoes && <p className="text-xs text-muted-foreground">{l.observacoes}</p>}
                </CardHeader>
                <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0 space-y-2">
                  {es.map((e) => (
                    <div key={e.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground">{e.tipo}</p>
                          <p className="text-xs text-muted-foreground">{e.marca || "Marca —"} · Série {e.numero_serie || "—"}</p>
                        </div>
                        <Badge variant={STATUS_VARIANT[e.status]}>{STATUS_LABEL[e.status]}</Badge>
                      </div>
                      {(e.iniciado_em || e.instalado_em) && (
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {e.iniciado_em && <p>Iniciado {fmt(e.iniciado_em)}{e.ini?.nome ? ` por ${e.ini.nome}` : ""}</p>}
                          {e.instalado_em && <p>Encerrado {fmt(e.instalado_em)}{e.fim?.nome ? ` por ${e.fim.nome}` : ""}</p>}
                        </div>
                      )}
                      {acoes(e).length > 0 && (
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                          {acoes(e).map((a) => {
                            const I = icon(a.label);
                            return (
                              <Button key={a.label} size="sm" className="h-10 sm:h-9"
                                variant={a.label === "Iniciar" || a.label === "Retomar" || a.label === "Encerrar" ? "default" : "outline"}
                                disabled={busy === e.id} onClick={() => setConfirm(a)}>
                                <I className="h-4 w-4 mr-1" />{a.label}
                              </Button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
          {!lista.length && <p className="text-sm text-muted-foreground">Nenhuma loja encontrada.</p>}
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.label} instalação?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.label === "Iniciar" && "Depois de iniciado, ninguém poderá iniciar novamente — apenas pausar ou encerrar."}
              {confirm?.label === "Reiniciar" && "O elevador voltará para Pendente e as datas de início/encerramento serão apagadas."}
              {confirm?.label === "Encerrar" && "O elevador será marcado como instalado."}
              {(confirm?.label === "Pausar" || confirm?.label === "Retomar") && "A mudança ficará registrada no histórico."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && executar(confirm)}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
