import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Atividade, Bloqueio, EXEC_STATUSES, diaEspecial, execLabel, fimDeSemana, iso, noDia, parse, statusEfetivo } from "./cronogramaModel";

type Stage = { id: number; nome: string; ordem: number };
const DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const tone = (s: string) => s === "ATRASADO" ? "border-destructive bg-destructive/15" : s === "CONCLUIDO" ? "border-primary/40 bg-primary/10" : s === "BLOQUEADO" ? "border-destructive/40 bg-destructive/10" : s === "EM_ANDAMENTO" ? "border-secondary bg-secondary/40" : "border-border bg-card";
const br = (v?: string | null) => v ? parse(v).toLocaleDateString("pt-BR") : "—";

export default function CronogramaCalendario({ stages, atividades, unidadesDe, bloqueios }: { stages: Stage[]; atividades: Atividade[]; unidadesDe: (atividadeId: number) => string[]; bloqueios: Bloqueio[] }) {
  const stageIds = new Set(stages.map((s) => s.id));
  const first = useMemo(() => { const d = atividades.map((a) => a.data_inicio).filter(Boolean).sort()[0]; const today = iso(new Date()); return parse(d && d > today ? d : today); }, [atividades]);
  const [mes, setMes] = useState(() => new Date(first.getFullYear(), first.getMonth(), 1));
  const [fEtapa, setFEtapa] = useState("all"), [fStatus, setFStatus] = useState("all"), [modo, setModo] = useState<"semana" | "lista">("semana");
  const [sel, setSel] = useState<Atividade | null>(null);
  const stageName = (id: number) => stages.find((s) => s.id === id)?.nome || "";
  const atvs = atividades.filter((a) => stageIds.has(a.etapa_id) && (fEtapa === "all" || String(a.etapa_id) === fEtapa) && (fStatus === "all" || statusEfetivo(a) === fStatus));

  const semanas = useMemo(() => { const d = new Date(mes); d.setDate(1 - ((d.getDay() + 6) % 7)); const out: string[][] = []; const last = new Date(mes.getFullYear(), mes.getMonth() + 1, 0); while (d <= last) { const w: string[] = []; for (let i = 0; i < 7; i++) { w.push(iso(d)); d.setDate(d.getDate() + 1); } out.push(w); } return out; }, [mes]);
  const bloqueio = (dia: string) => bloqueios.find((b) => b.data_inicio <= dia && b.data_fim >= dia);

  const evento = (a: Atividade, d: string) => { const s = statusEfetivo(a), alerta = fimDeSemana(d) || diaEspecial(d)?.tipo.startsWith("FERIADO"); return <button key={a.id} onClick={() => setSel(a)} className={`w-full rounded border px-2 py-1 text-left text-xs hover:ring-1 hover:ring-primary ${tone(s)}`} title={`${stageName(a.etapa_id)} · ${a.nome}`}>
    <span className="block truncate text-[10px] text-muted-foreground">{stageName(a.etapa_id)}</span>
    <span className="flex items-center gap-1 font-medium leading-tight">{alerta && <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />}<span className="truncate">{a.nome}</span></span>
    <span className={`block text-[10px] font-semibold uppercase ${s === "ATRASADO" ? "text-destructive" : "text-muted-foreground"}`}>{execLabel(s)}</span>
  </button>; };

  const marcadores = (d: string) => { const esp = diaEspecial(d), b = bloqueio(d); return <>{esp && <Badge variant={esp.tipo === "PONTO_FACULTATIVO" ? "outline" : "destructive"} className="w-full justify-center truncate px-1 text-[10px]">{esp.tipo === "PONTO_FACULTATIVO" ? "Ponto facultativo" : esp.tipo === "FERIADO_ESTADUAL" ? "Feriado SP" : "Feriado"}: {esp.nome}</Badge>}{b && <Badge variant="secondary" className="w-full justify-center truncate px-1 text-[10px]">{b.descricao || (b.tipo === "FERIADO" ? "Feriado" : "Pausa")}</Badge>}</>; };

  const diasLista = useMemo(() => [...new Set(atvs.flatMap((a) => { const out: string[] = []; if (!a.data_inicio) return out; const d = parse(a.data_inicio), end = parse(a.data_fim || a.data_inicio); while (d <= end) { out.push(iso(d)); d.setDate(d.getDate() + 1); } return out; }))].filter((d) => d.startsWith(iso(mes).slice(0, 7))).sort(), [atvs, mes]);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon" variant="outline" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
      <strong className="min-w-[150px] text-center">{MESES[mes.getMonth()]} {mes.getFullYear()}</strong>
      <Button size="icon" variant="outline" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
      <Select value={fEtapa} onValueChange={setFEtapa}><SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as etapas</SelectItem>{stages.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.ordem}. {s.nome}</SelectItem>)}</SelectContent></Select>
      <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{EXEC_STATUSES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}<SelectItem value="ATRASADO">Atraso</SelectItem></SelectContent></Select>
      <div className="ml-auto flex rounded-md border p-1"><Button size="sm" variant={modo === "semana" ? "default" : "ghost"} onClick={() => setModo("semana")}>Agenda semanal</Button><Button size="sm" variant={modo === "lista" ? "default" : "ghost"} onClick={() => setModo("lista")}>Lista diária</Button></div>
    </div>
    {modo === "semana" ? <div className="overflow-x-auto"><div className="min-w-[1100px] space-y-2">
      <div className="grid grid-cols-[70px_repeat(5,1fr)_repeat(2,0.6fr)] gap-2 text-xs font-semibold text-muted-foreground"><span />{["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].map((d) => <span key={d} className="text-center uppercase">{d}</span>)}</div>
      {semanas.map((w) => <div key={w[0]} className="grid grid-cols-[70px_repeat(5,1fr)_repeat(2,0.6fr)] gap-2">
        <div className="rounded bg-primary p-2 text-center text-[11px] font-semibold leading-tight text-primary-foreground">{parse(w[0]).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}<br />a<br />{parse(w[6]).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
        {w.map((d, i) => { const out = parse(d).getMonth() !== mes.getMonth(), esp = diaEspecial(d), list = atvs.filter((a) => noDia(a, d)); return <Card key={d} className={`min-h-[96px] ${out ? "opacity-50" : ""} ${i > 4 || esp?.tipo.startsWith("FERIADO") ? "bg-muted" : ""}`}><CardContent className="space-y-1 p-2"><p className="text-[11px] font-semibold text-muted-foreground">{DIAS[i]} {parse(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>{marcadores(d)}{list.map((a) => evento(a, d))}</CardContent></Card>; })}
      </div>)}
      <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><span className="h-3 w-3 rounded border bg-card" />Não iniciada</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded border bg-secondary/40" />Em andamento</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded border bg-primary/10" />Concluída</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-destructive bg-destructive/15" />Atraso / bloqueada</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted" />Fim de semana / feriado</span><span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" />Atividade em feriado ou fim de semana</span></div>
    </div></div>
    : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{!diasLista.length && <p className="text-sm text-muted-foreground">Nenhuma programação neste mês.</p>}{diasLista.map((d) => <Card key={d}><CardContent className="space-y-2 p-3"><strong className="text-sm capitalize">{parse(d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}</strong>{marcadores(d)}{atvs.filter((a) => noDia(a, d)).map((a) => evento(a, d))}</CardContent></Card>)}</div>}

    <Dialog open={!!sel} onOpenChange={(v) => !v && setSel(null)}><DialogContent className="max-w-lg">{sel && <>
      <DialogHeader><DialogTitle>{sel.nome}</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><p className="text-xs text-muted-foreground">Etapa</p><p className="font-medium">{stageName(sel.etapa_id)}</p></div>
        <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={statusEfetivo(sel) === "ATRASADO" ? "destructive" : "outline"}>{execLabel(statusEfetivo(sel))}</Badge></div>
        <div><p className="text-xs text-muted-foreground">Período</p><p className="font-medium">{br(sel.data_inicio)} → {br(sel.data_fim)}</p></div>
        <div><p className="text-xs text-muted-foreground">Responsável</p><p className="font-medium">{sel.responsavel || "—"}</p></div>
        {sel.observacoes && <div className="col-span-2"><p className="text-xs text-muted-foreground">Observações</p><p>{sel.observacoes}</p></div>}
        <div className="col-span-2"><p className="mb-1 text-xs text-muted-foreground">Unidades ({unidadesDe(sel.id).length})</p><div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto">{unidadesDe(sel.id).map((n) => <Badge key={n} variant="secondary">{n}</Badge>)}{!unidadesDe(sel.id).length && <span className="text-muted-foreground">Nenhuma unidade associada.</span>}</div></div>
      </div></>}</DialogContent></Dialog>
  </div>;
}
