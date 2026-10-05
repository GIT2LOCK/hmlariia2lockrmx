import { useMemo, useRef, useState } from "react";
import { differenceInCalendarDays, eachDayOfInterval } from "date-fns";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, LocateFixed } from "lucide-react";
import { stageColor } from "./cronogramaColors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Atividade, diaEspecial, execLabel, fimDeSemana, iso, parse, periodo, progresso, statusDerivado, statusEfetivo } from "./cronogramaModel";

type Stage = { id: number; nome: string; ordem: number; cor?: string | null };
const br = (date: string | null) => date ? parse(date).toLocaleDateString("pt-BR") : "Sem data";

export default function CronogramaGantt({ stages, atividades, unidadesDe }: { stages: Stage[]; atividades: Atividade[]; unidadesDe: (id: number) => string[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<"dia" | "semana" | "mes">("semana");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Atividade | null>(null);
  const rows = useMemo(() => stages.map((stage) => ({ stage, activities: atividades.filter((a) => a.etapa_id === stage.id).sort((a, b) => a.ordem - b.ordem || a.id - b.id) })), [stages, atividades]);
  const dates = periodo(rows.flatMap((row) => row.activities));
  const days = useMemo(() => dates.inicio && dates.fim ? eachDayOfInterval({ start: parse(dates.inicio), end: parse(dates.fim) }) : [], [dates.inicio, dates.fim]);
  const dayWidth = Math.max(scale === "dia" ? 48 : scale === "semana" ? 18 : 7, Math.ceil(280 / Math.max(days.length, 1)));
  const months = days.reduce<{ label: string; start: number; length: number }[]>((out, day, index) => { const label = day.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); const last = out[out.length - 1]; if (last?.label === label) last.length++; else out.push({ label, start: index + 1, length: 1 }); return out; }, []);
  const timelineStyle = { gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, ${dayWidth}px)` };
  const bar = (start: string | null, end: string | null, status: string, label: string, color: string | undefined, onClick?: () => void) => {
    if (!start || !days.length) return <span className="col-span-full px-3 text-xs text-muted-foreground">Sem data</span>;
    const offset = differenceInCalendarDays(parse(start), days[0]);
    const length = Math.max(1, differenceInCalendarDays(parse(end || start), parse(start)) + 1);
    return <div data-stage-color={color} className="z-10 min-w-0 px-0.5" style={{ gridColumn: `${offset + 1} / span ${length}`, gridRow: 1 }}>
      {onClick ? <Button variant="ghost" onClick={onClick} title={`${label} · ${br(start)} → ${br(end || start)} · ${execLabel(status)}`} aria-label={`${label} — ${execLabel(status)}`} className={`stage-bar h-7 w-full justify-start overflow-hidden rounded px-2 text-xs hover:opacity-80`}><span className="truncate">{label}</span></Button> : <div className={`stage-swatch h-2 rounded`} title={`${br(start)} → ${br(end || start)}`} />}
    </div>;
  };
  const cells = () => days.map((d) => <div key={iso(d)} className={`h-full border-r ${fimDeSemana(iso(d)) || diaEspecial(iso(d)) ? "bg-muted/60" : "bg-background"}`} />);
  const timelineRow = (content: React.ReactNode) => <div className="relative grid h-14 items-center border-b" style={timelineStyle}><div aria-hidden="true" className="absolute inset-0 grid" style={timelineStyle}>{cells()}</div>{content}</div>;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-base font-semibold">Linha do tempo</h3><p className="text-xs text-muted-foreground">{br(dates.inicio)} → {br(dates.fim)} · {atividades.length} atividades</p></div>
      <div className="flex flex-wrap items-center gap-2"><div className="flex rounded-md border p-1" aria-label="Escala do Gantt">{([['dia', 'Dias'], ['semana', 'Semanas'], ['mes', 'Meses']] as const).map(([value, label]) => <Button size="sm" variant={scale === value ? "default" : "ghost"} key={value} aria-pressed={scale === value} onClick={() => setScale(value)}>{label}</Button>)}</div><Button size="icon" variant="outline" title="Expandir todas as etapas" aria-label="Expandir todas as etapas" onClick={() => setCollapsed(new Set())}><ChevronsUpDown className="h-4 w-4" /></Button><Button size="icon" variant="outline" title="Recolher todas as etapas" aria-label="Recolher todas as etapas" onClick={() => setCollapsed(new Set(stages.map((s) => s.id)))}><ChevronsDownUp className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => { const index = days.findIndex((d) => iso(d) === iso(new Date())); scrollRef.current?.scrollTo({ left: Math.max(0, index * dayWidth - 200), behavior: "smooth" }); }}><LocateFixed className="mr-1 h-4 w-4" />Hoje</Button></div>
    </div>
    {!days.length && <p className="text-sm text-muted-foreground">Nenhuma atividade com período definido.</p>}
    <div ref={scrollRef} className="max-h-[660px] overflow-auto rounded-md border" role="region" aria-label="Gantt do cronograma" tabIndex={0}>
      <div className="grid w-max min-w-full" style={{ gridTemplateColumns: `380px ${Math.max(days.length * dayWidth, 280)}px` }}>
        <div className="sticky left-0 top-0 z-30 flex h-20 items-center justify-between border-b border-r bg-background px-4 text-sm font-semibold"><span>Etapas / Atividades</span><span className="text-xs font-normal text-muted-foreground">Período · Status</span></div>
        <div className="sticky top-0 z-20 h-20 border-b bg-background"><div className="grid h-8 border-b" style={timelineStyle}>{months.map((month) => <div key={month.label} style={{ gridColumn: `${month.start} / span ${month.length}` }} className="overflow-hidden border-r px-2 py-1 text-xs font-semibold capitalize">{month.label}</div>)}</div><div className="grid h-12" style={timelineStyle}>{days.map((d, i) => <div key={iso(d)} title={diaEspecial(iso(d))?.nome || d.toLocaleDateString('pt-BR')} className={`flex flex-col justify-center border-r text-center text-[10px] ${fimDeSemana(iso(d)) || diaEspecial(iso(d)) ? 'bg-muted text-muted-foreground' : ''} ${iso(d) === iso(new Date()) ? 'border-x-2 border-primary text-primary' : ''}`}>{scale === 'dia' ? <><span>{d.toLocaleDateString('pt-BR', { weekday: 'short' })}</span><strong>{d.getDate()}</strong></> : (i === 0 || d.getDay() === 1) && scale === 'semana' ? <strong>{d.getDate()}</strong> : null}</div>)}</div></div>
        {rows.map(({ stage, activities }) => { const period = periodo(activities), color = stageColor(stage), isCollapsed = collapsed.has(stage.id); return <div key={stage.id} className="contents">
          <div data-stage-color={color} className="sticky left-0 z-10 flex h-14 items-center gap-2 border-b border-r bg-background px-3"><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`${isCollapsed ? 'Expandir' : 'Recolher'} ${stage.nome}`} onClick={() => setCollapsed((old) => { const next = new Set(old); next.has(stage.id) ? next.delete(stage.id) : next.add(stage.id); return next; })}>{isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</Button><span className="stage-swatch h-3 w-3 shrink-0 rounded-full" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={stage.nome}>{stage.ordem}. {stage.nome}</p><p className="text-[11px] text-muted-foreground">{activities.length} atividades · {br(period.inicio)} → {br(period.fim)}</p></div><strong className="text-xs">{progresso(activities)}%</strong></div>
          {timelineRow(bar(period.inicio, period.fim, statusDerivado(activities), stage.nome, color))}
          {!isCollapsed && activities.map((activity) => <div key={activity.id} className="contents"><div className="sticky left-0 z-10 flex h-14 items-center gap-2 border-b border-r bg-background pl-12 pr-3"><div className="min-w-0 flex-1"><Button variant="ghost" className="h-auto w-full justify-start whitespace-normal px-0 py-0 text-left text-xs" onClick={() => setSelected(activity)} title={activity.nome}><span className="line-clamp-2">{activity.nome}</span></Button><p className="text-[10px] text-muted-foreground">{br(activity.data_inicio)} → {br(activity.data_fim || activity.data_inicio)}</p></div><Badge variant={statusEfetivo(activity) === 'ATRASADO' || statusEfetivo(activity) === 'BLOQUEADO' ? 'destructive' : 'outline'} className="shrink-0 text-[10px]">{execLabel(statusEfetivo(activity))}</Badge></div>{timelineRow(bar(activity.data_inicio, activity.data_fim, statusEfetivo(activity), activity.nome, color, () => setSelected(activity)))}</div>)}
        </div>; })}
      </div>
    </div>
    <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-w-lg">{selected && <><DialogHeader><DialogTitle>{selected.nome}</DialogTitle></DialogHeader><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Etapa</dt><dd>{stages.find((s) => s.id === selected.etapa_id)?.nome}</dd></div><div><dt className="text-xs text-muted-foreground">Status</dt><dd><Badge variant={statusEfetivo(selected) === "ATRASADO" ? "destructive" : "outline"}>{execLabel(statusEfetivo(selected))}</Badge></dd></div><div><dt className="text-xs text-muted-foreground">Data de início</dt><dd>{br(selected.data_inicio)}</dd></div><div><dt className="text-xs text-muted-foreground">Data de fim</dt><dd>{br(selected.data_fim)}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Responsável</dt><dd>{selected.responsavel || "—"}</dd></div>{selected.observacoes && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Observações</dt><dd>{selected.observacoes}</dd></div>}<div className="col-span-2"><dt className="text-xs text-muted-foreground">Unidades</dt><dd className="mt-1 flex max-h-48 flex-wrap gap-1 overflow-auto">{unidadesDe(selected.id).map((unit) => <Badge variant="secondary" key={unit}>{unit}</Badge>)}{!unidadesDe(selected.id).length && "Nenhuma unidade associada."}</dd></div></dl></>}</DialogContent></Dialog>
  </div>;
}