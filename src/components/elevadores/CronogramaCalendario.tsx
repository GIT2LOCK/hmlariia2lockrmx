import { useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Atividade, Bloqueio, EXEC_STATUSES, diaEspecial, execLabel, fimDeSemana, iso, noDia, parse, statusEfetivo } from "./cronogramaModel";

type Stage = { id: number; nome: string; ordem: number; cor?: string | null };
import { stageColor } from "./cronogramaColors";
const DIAS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
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

  const evento = (a: Atividade, d: string) => { const s = statusEfetivo(a), alerta = s === "ATRASADO" || s === "BLOQUEADO" || fimDeSemana(d) || diaEspecial(d)?.tipo.startsWith("FERIADO"); return <Button variant="ghost" data-stage-color={stageColor(stages.find((stage) => stage.id === a.etapa_id))} key={a.id} onClick={() => setSel(a)} className="stage-event flex h-auto w-full min-w-0 flex-col items-start gap-1 whitespace-normal rounded-md border px-2 py-1.5 text-left text-xs leading-snug shadow-sm hover:ring-2 hover:ring-primary" title={`${stageName(a.etapa_id)} · ${a.nome} · ${execLabel(s)}`}>
    <span className="w-full break-words font-semibold">{a.nome}</span><span className={`flex items-center gap-1 rounded-sm px-1 py-px text-[10px] font-bold uppercase tracking-wide ${alerta ? "bg-destructive text-destructive-foreground" : "bg-background/20"}`}>{alerta && <AlertTriangle className="h-3 w-3 shrink-0" />}{execLabel(s)}</span>
  </Button>; };
  const marcadores = (d: string) => { const esp = diaEspecial(d), b = bloqueio(d); return <>{esp && <Badge variant={esp.tipo === "PONTO_FACULTATIVO" ? "outline" : "destructive"} className="w-full justify-center truncate px-1 text-[10px]">{esp.tipo === "PONTO_FACULTATIVO" ? "Ponto facultativo" : esp.tipo === "FERIADO_ESTADUAL" ? "Feriado SP" : "Feriado"}: {esp.nome}</Badge>}{b && <Badge variant="secondary" className="w-full justify-center truncate px-1 text-[10px]">{b.descricao || (b.tipo === "FERIADO" ? "Feriado" : "Pausa")}</Badge>}</>; };

  const diasLista = useMemo(() => [...new Set(atvs.flatMap((a) => { const out: string[] = []; if (!a.data_inicio) return out; const d = parse(a.data_inicio), end = parse(a.data_fim || a.data_inicio); while (d <= end) { out.push(iso(d)); d.setDate(d.getDate() + 1); } return out; }))].filter((d) => d.startsWith(iso(mes).slice(0, 7))).sort(), [atvs, mes]);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon" variant="outline" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
      <strong className="min-w-[150px] text-center">{MESES[mes.getMonth()]} {mes.getFullYear()}</strong>
      <Button size="icon" variant="outline" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
      <Button size="sm" variant="outline" onClick={() => { const t = new Date(); setMes(new Date(t.getFullYear(), t.getMonth(), 1)); }}>Hoje</Button>
      <Select value={fEtapa} onValueChange={setFEtapa}><SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as etapas</SelectItem>{stages.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.ordem}. {s.nome}</SelectItem>)}</SelectContent></Select>
      <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{EXEC_STATUSES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}<SelectItem value="ATRASADO">Atraso</SelectItem></SelectContent></Select>
      <div className="ml-auto flex rounded-md border p-1"><Button size="sm" variant={modo === "semana" ? "default" : "ghost"} onClick={() => setModo("semana")}>Agenda semanal</Button><Button size="sm" variant={modo === "lista" ? "default" : "ghost"} onClick={() => setModo("lista")}>Lista diária</Button></div>
    </div>
    {modo === "semana" ? <div className="overflow-x-auto rounded-lg border bg-card"><div className="min-w-[820px]">
      <div className="sticky top-0 z-10 grid grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,0.45fr))] border-b bg-primary text-xs font-semibold text-primary-foreground">{["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sáb", "Dom"].map((d) => <span key={d} className="px-2 py-2 text-center uppercase tracking-wide">{d}</span>)}</div>
      {semanas.map((w) => <div key={w[0]} className="grid grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,0.45fr))] border-b last:border-b-0">
        {w.map((d, i) => { const out = parse(d).getMonth() !== mes.getMonth(), esp = diaEspecial(d), hoje = d === iso(new Date()), list = atvs.filter((a) => noDia(a, d)); return <div key={d} className={`flex min-h-[150px] flex-col border-r last:border-r-0 ${out ? "opacity-40" : ""} ${i > 4 || esp?.tipo.startsWith("FERIADO") ? "bg-muted/60" : ""}`}>
          <div className="flex items-center justify-between px-2 pt-1.5"><span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-bold ${hoje ? "bg-primary text-primary-foreground" : "text-foreground"}`}>{parse(d).getDate()}</span>{list.length > 0 && <span className="text-[11px] font-medium text-muted-foreground">{list.length} ativ.</span>}</div>
          <div className="max-h-[260px] flex-1 space-y-1 overflow-y-auto p-1.5">{marcadores(d)}{list.map((a) => evento(a, d))}</div>
        </div>; })}
      </div>)}
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
