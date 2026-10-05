import { useMemo, useState } from "react";
import { differenceInCalendarDays, eachDayOfInterval } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Atividade, diaEspecial, execLabel, fimDeSemana, iso, parse, periodo, progresso, statusDerivado, statusEfetivo } from "./cronogramaModel";

type Stage = { id: number; nome: string; ordem: number };
const tone = (status: string) => status === "ATRASADO" || status === "BLOQUEADO" ? "bg-destructive text-destructive-foreground" : status === "CONCLUIDO" ? "bg-primary text-primary-foreground" : status === "EM_ANDAMENTO" ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground";
const br = (date: string | null) => date ? parse(date).toLocaleDateString("pt-BR") : "Sem data";

export default function CronogramaGantt({ stages, atividades, unidadesDe }: { stages: Stage[]; atividades: Atividade[]; unidadesDe: (id: number) => string[] }) {
  const [selected, setSelected] = useState<Atividade | null>(null);
  const rows = useMemo(() => stages.map((stage) => ({ stage, activities: atividades.filter((a) => a.etapa_id === stage.id).sort((a, b) => a.ordem - b.ordem || a.id - b.id) })), [stages, atividades]);
  const dates = periodo(rows.flatMap((row) => row.activities));
  const days = useMemo(() => dates.inicio && dates.fim ? eachDayOfInterval({ start: parse(dates.inicio), end: parse(dates.fim) }) : [], [dates.inicio, dates.fim]);
  const timelineStyle = { gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, 28px)` };
  const bar = (start: string | null, end: string | null, status: string, label: string, onClick?: () => void) => {
    if (!start || !days.length) return <span className="col-span-full px-3 text-xs text-muted-foreground">Sem data</span>;
    const offset = differenceInCalendarDays(parse(start), days[0]);
    const length = Math.max(1, differenceInCalendarDays(parse(end || start), parse(start)) + 1);
    return <div className="z-10 min-w-0 px-0.5" style={{ gridColumn: `${offset + 1} / span ${length}`, gridRow: 1 }}>
      {onClick ? <Button variant="ghost" onClick={onClick} title={`${label} · ${br(start)} → ${br(end || start)} · ${execLabel(status)}`} aria-label={`${label} — ${execLabel(status)}`} className={`h-7 w-full justify-start overflow-hidden rounded px-2 text-xs hover:opacity-80 ${tone(status)}`}><span className="truncate">{execLabel(status)}</span></Button> : <div className={`h-3 rounded ${tone(status)}`} title={`${br(start)} → ${br(end || start)}`} />}
    </div>;
  };
  const cells = () => days.map((d) => <div key={iso(d)} className={`h-full border-r ${fimDeSemana(iso(d)) || diaEspecial(iso(d)) ? "bg-muted/60" : "bg-background"}`} />);
  const timelineRow = (content: React.ReactNode) => <div className="relative grid h-10 items-center" style={timelineStyle}><div aria-hidden="true" className="absolute inset-0 grid" style={timelineStyle}>{cells()}</div>{content}</div>;

  return <div className="space-y-3">
    {!days.length && <p className="text-sm text-muted-foreground">Nenhuma atividade com período definido.</p>}
    <div className="max-h-[680px] overflow-auto rounded-md border" role="region" aria-label="Gantt do cronograma" tabIndex={0}>
      <div className="grid w-max min-w-full" style={{ gridTemplateColumns: `260px ${Math.max(days.length * 28, 280)}px` }}>
        <div className="sticky left-0 top-0 z-30 flex h-16 items-center border-b border-r bg-background px-3 text-sm font-semibold">Etapas / Atividades</div>
        <div className="sticky top-0 z-20 grid h-16 border-b bg-background" style={timelineStyle}>{days.map((d, i) => <div key={iso(d)} title={diaEspecial(iso(d))?.nome || d.toLocaleDateString("pt-BR", { weekday: "long" })} className={`flex flex-col justify-end border-r pb-1 text-center text-[10px] ${fimDeSemana(iso(d)) || diaEspecial(iso(d)) ? "bg-muted text-muted-foreground" : ""}`}><span className="h-5 whitespace-nowrap text-left font-semibold">{i === 0 || d.getDate() === 1 ? d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : ""}</span><span>{d.toLocaleDateString("pt-BR", { weekday: "narrow" })}</span><strong>{d.getDate()}</strong></div>)}</div>
        {rows.map(({ stage, activities }) => { const period = periodo(activities); return <div key={stage.id} className="contents">
          <div className="sticky left-0 z-10 flex h-10 items-center gap-2 border-b border-r bg-muted px-3 text-xs font-semibold"><span className="min-w-0 flex-1 truncate" title={stage.nome}>{stage.ordem}. {stage.nome}</span><span>{progresso(activities)}%</span></div>
          {timelineRow(bar(period.inicio, period.fim, statusDerivado(activities), stage.nome))}
          {activities.map((activity) => <div key={activity.id} className="contents"><div className="sticky left-0 z-10 flex h-10 items-center border-b border-r bg-background pl-6 pr-2"><Button variant="ghost" className="h-8 w-full justify-start px-0 text-xs" onClick={() => setSelected(activity)} title={activity.nome}><span className="truncate">{activity.nome}</span></Button></div>{timelineRow(bar(activity.data_inicio, activity.data_fim, statusEfetivo(activity), activity.nome, () => setSelected(activity)))}</div>)}
        </div>; })}
      </div>
    </div>
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{["NAO_INICIADO", "EM_ANDAMENTO", "CONCLUIDO", "BLOQUEADO", "ATRASADO"].map((s) => <span key={s} className="flex items-center gap-1"><span className={`h-3 w-3 rounded ${tone(s)}`} />{execLabel(s)}</span>)}<span>Fim de semana / feriado / ponto facultativo</span></div>
    <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="max-w-lg">{selected && <><DialogHeader><DialogTitle>{selected.nome}</DialogTitle></DialogHeader><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Etapa</dt><dd>{stages.find((s) => s.id === selected.etapa_id)?.nome}</dd></div><div><dt className="text-xs text-muted-foreground">Status</dt><dd><Badge variant={statusEfetivo(selected) === "ATRASADO" ? "destructive" : "outline"}>{execLabel(statusEfetivo(selected))}</Badge></dd></div><div><dt className="text-xs text-muted-foreground">Data de início</dt><dd>{br(selected.data_inicio)}</dd></div><div><dt className="text-xs text-muted-foreground">Data de fim</dt><dd>{br(selected.data_fim)}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Responsável</dt><dd>{selected.responsavel || "—"}</dd></div>{selected.observacoes && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Observações</dt><dd>{selected.observacoes}</dd></div>}<div className="col-span-2"><dt className="text-xs text-muted-foreground">Unidades</dt><dd className="mt-1 flex max-h-48 flex-wrap gap-1 overflow-auto">{unidadesDe(selected.id).map((unit) => <Badge variant="secondary" key={unit}>{unit}</Badge>)}{!unidadesDe(selected.id).length && "Nenhuma unidade associada."}</dd></div></dl></>}</DialogContent></Dialog>
  </div>;
}