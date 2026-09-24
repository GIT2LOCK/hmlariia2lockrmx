import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type Status = "PENDENTE" | "EM_ANDAMENTO" | "INSTALADO";
interface Elevador { id: number; unidade_id: number; tipo: string; marca: string | null; numero_serie: string | null; status: Status; instalado_em: string | null; }
interface Loja { unidade_id: number; ano_migracao: string | null; lote: string | null; data_prevista: string | null; estoque_leitoras: number; observacoes: string | null; unidades?: { nome_unidade: string } }

const STATUS_LABEL: Record<Status, string> = { PENDENTE: "Pendente", EM_ANDAMENTO: "Em andamento", INSTALADO: "Instalado" };
const db = supabase as any;

export default function Elevadores() {
  const { toast } = useToast();
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [elev, setElev] = useState<Elevador[]>([]);
  const [busca, setBusca] = useState("");
  const [lote, setLote] = useState("todos");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [l, e] = await Promise.all([
      db.from("elev_lojas").select("*, unidades(nome_unidade)"),
      db.from("elev_elevadores").select("*").order("id"),
    ]);
    if (l.error || e.error) toast({ title: "Erro ao carregar", description: (l.error || e.error).message, variant: "destructive" });
    setLojas(l.data || []); setElev(e.data || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id: number, status: Status) => {
    const { error } = await db.from("elev_elevadores").update({ status }).eq("id", id);
    if (error) return toast({ title: "Não foi possível atualizar", description: error.message, variant: "destructive" });
    setElev((p) => p.map((x) => (x.id === id ? { ...x, status } : x)));
    toast({ title: "Status atualizado" });
  };

  const lotes = useMemo(() => Array.from(new Set(lojas.map((l) => l.lote || "Concluído"))).sort(), [lojas]);
  const total = elev.length, inst = elev.filter((e) => e.status === "INSTALADO").length;
  const andamento = elev.filter((e) => e.status === "EM_ANDAMENTO").length;
  const lojasOk = lojas.filter((l) => { const es = elev.filter((e) => e.unidade_id === l.unidade_id); return es.length > 0 && es.every((e) => e.status === "INSTALADO"); }).length;

  const lista = lojas
    .filter((l) => lote === "todos" || (l.lote || "Concluído") === lote)
    .filter((l) => !busca || (l.unidades?.nome_unidade || "").toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => (a.data_prevista || "9999").localeCompare(b.data_prevista || "9999") || (a.unidades?.nome_unidade || "").localeCompare(b.unidades?.nome_unidade || ""));

  const kpis = [
    { label: "Elevadores", value: total },
    { label: "Instalados", value: inst },
    { label: "Em andamento", value: andamento },
    { label: "Faltam instalar", value: total - inst },
    { label: "Lojas concluídas", value: `${lojasOk}/${lojas.length}` },
  ];

  return (
    <main className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><ArrowUpDown className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Implantação — Controle de Acesso em Elevadores</h1>
          <p className="text-sm text-muted-foreground">GoodStorage · andamento por loja e elevador</p>
        </div>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="text-2xl font-semibold text-foreground">{k.value}</p>
          </CardContent></Card>
        ))}
      </section>
      <Card><CardContent className="p-4 space-y-2">
        <div className="flex justify-between text-sm"><span>Progresso geral</span><span>{total ? Math.round((inst / total) * 100) : 0}%</span></div>
        <Progress value={total ? (inst / total) * 100 : 0} />
      </CardContent></Card>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar loja..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={lote} onValueChange={setLote}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os lotes</SelectItem>
            {lotes.map((l) => <SelectItem key={l} value={l}>{/^\d$/.test(l) ? `Lote ${l}` : l === "2027" ? "Migração 2027" : l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
        <div className="space-y-4">
          {lista.map((l) => {
            const es = elev.filter((e) => e.unidade_id === l.unidade_id);
            const ok = es.filter((e) => e.status === "INSTALADO").length;
            return (
              <Card key={l.unidade_id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{l.unidades?.nome_unidade}</CardTitle>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="outline">{l.lote ? (/^\d$/.test(l.lote) ? `Lote ${l.lote}` : `Migração ${l.lote}`) : "Concluído"}</Badge>
                      {l.data_prevista && <Badge variant="outline">Previsto {new Date(l.data_prevista + "T12:00").toLocaleDateString("pt-BR")}</Badge>}
                      <Badge variant="outline">Leitoras em estoque: {l.estoque_leitoras}</Badge>
                      <Badge variant={ok === es.length && es.length ? "default" : "secondary"}>{ok}/{es.length} instalados</Badge>
                    </div>
                  </div>
                  {l.observacoes && <p className="text-xs text-muted-foreground">{l.observacoes}</p>}
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Marca</TableHead><TableHead>Nº de série</TableHead><TableHead>Instalado em</TableHead><TableHead className="w-[180px]">Status</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {es.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>{e.tipo}</TableCell>
                          <TableCell>{e.marca || "—"}</TableCell>
                          <TableCell>{e.numero_serie || "—"}</TableCell>
                          <TableCell>{e.instalado_em ? new Date(e.instalado_em).toLocaleDateString("pt-BR") : "—"}</TableCell>
                          <TableCell>
                            <Select value={e.status} onValueChange={(v) => updateStatus(e.id, v as Status)}>
                              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>{(Object.keys(STATUS_LABEL) as Status[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
          {!lista.length && <p className="text-sm text-muted-foreground">Nenhuma loja encontrada.</p>}
        </div>
      )}
    </main>
  );
}
