import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Atividade, Bloqueio, EXEC_STATUSES, Execucao, execLabel, iso, noDia, parse, progresso } from "./cronogramaModel";

type Stage = { id: number; nome: string; ordem: number };
type Part = { id: number; etapa_id: number; unidade_id: number; observacoes: string | null };
const DIAS = ["SEG", "TER", "QUA", "QUI", "SEX"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const tone = (s: string) => s === "CONCLUIDO" ? "border-primary/40 bg-primary/10" : s === "BLOQUEADO" ? "border-destructive/40 bg-destructive/10" : s === "EM_ANDAMENTO" ? "border-secondary bg-secondary/40" : "border-border bg-card";
const lote = (obs: string | null) => obs?.match(/lote\s*[\w\d]+/i)?.[0];

export default function CronogramaCalendario({ stages, atividades, execucoes, parts, bloqueios, shop }: { stages: Stage[]; atividades: Atividade[]; execucoes: Execucao[]; parts: Part[]; bloqueios: Bloqueio[]; shop: (id: number) => string }) {
  const first = useMemo(() => { const d = execucoes.map((e) => e.data_inicio).filter(Boolean).sort()[0]; const today = iso(new Date()); return parse(d && d > today ? d : today); }, [execucoes]);
  const [mes, setMes] = useState(() => new Date(first.getFullYear(), first.getMonth(), 1));
  const [fEtapa, setFEtapa] = useState("all"), [fStatus, setFStatus] = useState("all"), [modo, setModo] = useState<"semana" | "lista">("semana");
  const stageIds = new Set(stages.map((s) => s.id));
  const atv = (id: number) => atividades.find((a) => a.id === id), part = (id: number) => parts.find((p) => p.id === id);
  const exes = execucoes.filter((e) => { const a = atv(e.atividade_id); return a && stageIds.has(a.etapa_id) && (fEtapa === "all" || String(a.etapa_id) === fEtapa) && (fStatus === "all" || e.status === fStatus); });

  const semanas = useMemo(() => { const d = new Date(mes); d.setDate(1 - ((d.getDay() + 6) % 7)); const out: string[][] = []; while (d <= new Date(mes.getFullYear(), mes.getMonth() + 1, 0)) { const w: string[] = []; for (let i = 0; i < 7; i++) { if (i < 5) w.push(iso(d)); d.setDate(d.getDate() + 1); } out.push(w); } return out; }, [mes]);
  const bloqueio = (dia: string) => bloqueios.find((b) => b.data_inicio <= dia && b.data_fim >= dia);

  const dia = (d: string, compact: boolean) => {
    const list = exes.filter((e) => noDia(e, d)), b = bloqueio(d);
    const byStage = new Map<number, Map<number, Execucao[]>>();
    list.forEach((e) => { const a = atv(e.atividade_id)!; if (!byStage.has(a.etapa_id)) byStage.set(a.etapa_id, new Map()); const m = byStage.get(a.etapa_id)!; m.set(a.id, [...(m.get(a.id) || []), e]); });
    if (!list.length && b) return <p className="text-xs font-medium text-muted-foreground">{b.descricao || (b.tipo === "FERIADO" ? "Feriado" : "Pausa")}</p>;
    if (!list.length) return compact ? null : <p className="text-xs text-muted-foreground">Sem programação</p>;
    return <div className="space-y-2">{b && <Badge variant="outline">{b.descricao}</Badge>}{[...byStage.entries()].map(([sid, m]) => <div key={sid} className="space-y-1"><p className="text-xs font-semibold leading-tight">{stages.find((s) => s.id === sid)?.nome}</p>{[...m.entries()].map(([aid, es]) => { const a = atv(aid)!; return <div key={aid} className="space-y-1 border-l-2 border-primary/40 pl-2">{a.nome !== stages.find((s) => s.id === sid)?.nome && <p className="text-[11px] text-muted-foreground">{a.nome}</p>}{es.map((e) => { const p = part(e.etapa_unidade_id), l = lote(p?.observacoes || null); return <div key={e.id} className={`rounded border px-2 py-1 text-xs ${tone(e.status)}`}><div className="flex items-center justify-between gap-1"><span className="truncate font-medium">{p ? shop(p.unidade_id) : "—"}</span>{e.status === "CONCLUIDO" && <span className="text-[10px] font-semibold text-primary">✓</span>}</div>{!compact && <p className="text-[11px] text-muted-foreground">{execLabel(e.status)}{l ? ` · ${l}` : ""}{e.responsavel || a.responsavel ? ` · ${e.responsavel || a.responsavel}` : ""}</p>}</div>; })}<p className="text-[10px] text-muted-foreground">Atividade: {progresso(execucoes.filter((x) => x.atividade_id === aid))}%</p></div>; })}</div>)}</div>;
  };

  const diasLista = useMemo(() => [...new Set(exes.flatMap((e) => { const out: string[] = []; if (!e.data_inicio) return out; const d = parse(e.data_inicio), end = parse(e.data_fim || e.data_inicio); while (d <= end) { out.push(iso(d)); d.setDate(d.getDate() + 1); } return out; }))].filter((d) => d.startsWith(iso(mes).slice(0, 7))).sort(), [exes, mes]);

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon" variant="outline" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
      <strong className="min-w-[150px] text-center">{MESES[mes.getMonth()]} {mes.getFullYear()}</strong>
      <Button size="icon" variant="outline" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
      <Select value={fEtapa} onValueChange={setFEtapa}><SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas as etapas</SelectItem>{stages.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.ordem}. {s.nome}</SelectItem>)}</SelectContent></Select>
      <Select value={fStatus} onValueChange={setFStatus}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os status</SelectItem>{EXEC_STATUSES.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
      <div className="ml-auto flex rounded-md border p-1"><Button size="sm" variant={modo === "semana" ? "default" : "ghost"} onClick={() => setModo("semana")}>Agenda semanal</Button><Button size="sm" variant={modo === "lista" ? "default" : "ghost"} onClick={() => setModo("lista")}>Lista diária</Button></div>
    </div>
    {modo === "semana" ? <div className="overflow-x-auto"><div className="min-w-[900px] space-y-2"><div className="grid grid-cols-[70px_repeat(5,1fr)] gap-2 text-xs font-semibold text-muted-foreground"><span />{["Segunda", "Terça", "Quarta", "Quinta", "Sexta"].map((d) => <span key={d} className="text-center uppercase">{d}</span>)}</div>
      {semanas.map((w) => { const pausaSemana = w.every((d) => bloqueio(d)?.tipo === "PAUSA"); return <div key={w[0]} className="grid grid-cols-[70px_repeat(5,1fr)] gap-2"><div className="rounded bg-primary p-2 text-center text-[11px] font-semibold leading-tight text-primary-foreground">{parse(w[0]).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}<br />a<br />{parse(w[4]).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</div>
        {w.map((d) => { const out = parse(d).getMonth() !== mes.getMonth(), b = bloqueio(d); return <Card key={d} className={`min-h-[96px] ${out ? "opacity-50" : ""} ${b && !exes.some((e) => noDia(e, d)) ? "bg-muted" : ""}`}><CardContent className="space-y-1 p-2"><p className="text-[11px] font-semibold text-muted-foreground">{DIAS[(parse(d).getDay() + 6) % 7]} {parse(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</p>{pausaSemana && !exes.some((e) => noDia(e, d)) ? <p className="text-xs text-muted-foreground">Pausa</p> : dia(d, true)}</CardContent></Card>; })}</div>; })}
      <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><span className="h-3 w-3 rounded border bg-card" />Não iniciada</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded border bg-secondary/40" />Em andamento</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded border bg-primary/10" />Concluída</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded border bg-destructive/10" />Bloqueada</span><span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted" />Pausa / feriado</span></div>
    </div></div>
    : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{!diasLista.length && <p className="text-sm text-muted-foreground">Nenhuma programação neste mês.</p>}{diasLista.map((d, i) => <Card key={d}><CardContent className="space-y-2 p-3"><div className="flex items-baseline justify-between"><strong className="text-sm">DIA {String(i + 1).padStart(2, "0")} · {parse(d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</strong></div>{dia(d, false)}</CardContent></Card>)}</div>}
  </div>;
}
