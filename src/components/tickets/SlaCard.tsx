import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clock, AlertTriangle, PauseCircle, CheckCircle2, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  computeSla,
  formatMinutes,
  slaLevelClass,
  slaLevelLabel,
  type SlaSnapshot,
} from "@/lib/sla";

interface SlaCardProps {
  ticket: any;
}

interface PauseRow {
  id: number;
  sla_type: string;
  motivo: string | null;
  status_pausa: string | null;
  paused_at: string;
  resumed_at: string | null;
  duration_minutes: number | null;
}

const fmt = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

function SlaBlock({ title, snap, completedLabel }: { title: string; snap: SlaSnapshot; completedLabel?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (snap.status === "met" || snap.status === "breached" || snap.status === "paused") return;
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [snap.status]);

  const view = computeSla(snap);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" /> {title}
          <Badge variant="outline" className={slaLevelClass[view.level]}>
            {slaLevelLabel[view.level]}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(view.percentConsumed)}% consumido</span>
            <span>{view.remainingLabel}</span>
          </div>
          <Progress value={Math.min(100, view.percentConsumed)} className="h-2" />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div className="text-muted-foreground">Meta</div>
          <div className="text-right">{snap.targetMinutes ? formatMinutes(snap.targetMinutes) : "—"}</div>
          <div className="text-muted-foreground">Prazo limite</div>
          <div className="text-right">{fmt(snap.dueAt)}</div>
          <div className="text-muted-foreground">Tempo decorrido</div>
          <div className="text-right">{formatMinutes(view.elapsedMinutes)}</div>
          {snap.pausedMinutes > 0 && (
            <>
              <div className="text-muted-foreground">Tempo pausado</div>
              <div className="text-right">{formatMinutes(snap.pausedMinutes)}</div>
            </>
          )}
          {snap.completedAt && (
            <>
              <div className="text-muted-foreground">{completedLabel || "Concluído em"}</div>
              <div className="text-right">{fmt(snap.completedAt)}</div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SlaCard({ ticket }: SlaCardProps) {
  const [pauses, setPauses] = useState<PauseRow[]>([]);

  useEffect(() => {
    if (!ticket?.id) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("ticket_sla_pauses")
        .select("*")
        .eq("ticket_id", ticket.id)
        .order("paused_at", { ascending: false });
      if (!cancel) setPauses((data || []) as PauseRow[]);
    })();

    const ch = supabase
      .channel(`sla-pauses-${ticket.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_sla_pauses", filter: `ticket_id=eq.${ticket.id}` },
        async () => {
          const { data } = await supabase
            .from("ticket_sla_pauses")
            .select("*")
            .eq("ticket_id", ticket.id)
            .order("paused_at", { ascending: false });
          setPauses((data || []) as PauseRow[]);
        }
      )
      .subscribe();
    return () => {
      cancel = true;
      supabase.removeChannel(ch);
    };
  }, [ticket?.id]);

  const firstResponseSnap: SlaSnapshot = {
    status: (ticket.first_response_sla_status as any) || (ticket.data_primeiro_atendimento ? "met" : "in_progress"),
    dueAt: ticket.first_response_due_at ? new Date(ticket.first_response_due_at) : null,
    targetMinutes: ticket.sla_atendimento_minutos ?? null,
    startedAt: ticket.data_abertura ? new Date(ticket.data_abertura) : null,
    completedAt: ticket.data_primeiro_atendimento ? new Date(ticket.data_primeiro_atendimento) : null,
    pausedMinutes: 0,
  };

  const resolutionSnap: SlaSnapshot = {
    status:
      (ticket.resolution_sla_status as any) ||
      (ticket.data_solucao ? "met" : ticket.sla_pausa_inicio ? "paused" : "in_progress"),
    dueAt: ticket.resolution_due_at ? new Date(ticket.resolution_due_at) : null,
    targetMinutes: ticket.sla_solucao_minutos ?? null,
    startedAt: ticket.data_abertura ? new Date(ticket.data_abertura) : null,
    completedAt: ticket.data_solucao ? new Date(ticket.data_solucao) : null,
    pausedMinutes: Math.round((ticket.sla_pausa_total_segundos || 0) / 60),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SlaBlock title="SLA Primeiro Atendimento" snap={firstResponseSnap} completedLabel="Atendido em" />
        <SlaBlock title="SLA Solução" snap={resolutionSnap} completedLabel="Resolvido em" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <PauseCircle className="h-4 w-4" /> Histórico de pausas ({pauses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pauses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma pausa registrada.</p>
          ) : (
            <div className="space-y-2">
              {pauses.map((p) => (
                <div key={p.id} className="flex items-start gap-3 text-sm border-l-2 border-border pl-3 py-1">
                  {p.resumed_at ? (
                    <CheckCircle2 className="h-4 w-4 text-secondary mt-0.5" />
                  ) : (
                    <Timer className="h-4 w-4 text-amber-500 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{p.status_pausa || "Pausa"}</div>
                    {p.motivo && <div className="text-xs text-muted-foreground">{p.motivo}</div>}
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fmt(p.paused_at)}
                      {p.resumed_at ? ` → ${fmt(p.resumed_at)}` : " · em curso"}
                      {p.duration_minutes != null && ` · ${formatMinutes(p.duration_minutes)}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
