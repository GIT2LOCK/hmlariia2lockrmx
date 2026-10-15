import { useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ClearableSelect } from "@/components/ClearableSelect";
import { useToast } from "@/hooks/use-toast";
import { Atividade, EXEC_STATUSES, iso, statusEfetivo } from "./cronogramaModel";
import { gerarPdfCronograma, inicioSemana, PdfStage } from "./cronogramaPdf";

const db = supabase as any;
const T = "todos";
const br = (d: Date) => d.toLocaleDateString("pt-BR");

export default function RelatorioCronogramaDialog({ open, onOpenChange, lojaNome, onExcel }: { open: boolean; onOpenChange: (v: boolean) => void; lojaNome: (id: number) => string; onExcel: (atividadeIds: Set<number>) => Promise<void> }) {
  const { toast } = useToast();
  const [stages, setStages] = useState<PdfStage[]>([]);
  const [atvs, setAtvs] = useState<Atividade[]>([]);
  const [links, setLinks] = useState<Map<number, number[]>>(new Map());
  const [fEtapa, setFEtapa] = useState(T), [fStatus, setFStatus] = useState(T), [fUnid, setFUnid] = useState(T), [fResp, setFResp] = useState(T);
  const [de, setDe] = useState(""), [ate, setAte] = useState("");
  const [gantt, setGantt] = useState(true), [semanal, setSemanal] = useState(true), [excel, setExcel] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [e, a, x, u] = await Promise.all([
        db.from("elev_cronograma_etapas").select("id,nome,ordem,cor").order("ordem"),
        db.from("elev_cronograma_atividades").select("*").order("ordem"),
        db.from("elev_cronograma_execucoes").select("atividade_id,etapa_unidade_id").limit(10000),
        db.from("elev_cronograma_etapa_unidades").select("id,unidade_id").limit(10000),
      ]);
      const err = e.error || a.error || x.error || u.error;
      if (err) toast({ title: "Erro ao carregar o cronograma", description: err.message, variant: "destructive" });
      const eu = new Map<number, number>((u.data || []).map((r: any) => [r.id, r.unidade_id]));
      const m = new Map<number, number[]>();
      (x.data || []).forEach((r: any) => { const uid = eu.get(r.etapa_unidade_id); if (uid) m.set(r.atividade_id, [...(m.get(r.atividade_id) || []), uid]); });
      setStages(e.data || []); setAtvs(a.data || []); setLinks(m);
    })();
  }, [open]);

  const unidadesDe = (id: number) => [...new Set((links.get(id) || []).map((u) => lojaNome(u).toUpperCase()))].sort();
  const unidadeOpts = useMemo(() => [...new Set([...links.values()].flat())].map((id) => ({ value: String(id), label: lojaNome(id).toUpperCase() })).sort((a, b) => a.label.localeCompare(b.label)), [links, lojaNome]);
  const respOpts = useMemo(() => [...new Set(atvs.map((a) => a.responsavel).filter(Boolean) as string[])].sort().map((r) => ({ value: r, label: r })), [atvs]);

  const filtradas = useMemo(() => atvs.filter((a) => {
    if (fEtapa !== T && a.etapa_id !== Number(fEtapa)) return false;
    if (fStatus !== T && statusEfetivo(a) !== fStatus) return false;
    if (fUnid !== T && !(links.get(a.id) || []).includes(Number(fUnid))) return false;
    if (fResp !== T && a.responsavel !== fResp) return false;
    const fim = a.data_fim || a.data_inicio;
    if (de && (!fim || fim < de)) return false;
    if (ate && (!a.data_inicio || a.data_inicio > ate)) return false;
    return true;
  }), [atvs, fEtapa, fStatus, fUnid, fResp, de, ate, links]);

  const filtros: [string, string][] = [
    ...(fEtapa !== T ? [["Etapa", stages.find((s) => s.id === Number(fEtapa))?.nome || ""] as [string, string]] : []),
    ...(fStatus !== T ? [["Status", fStatus === "ATRASADO" ? "Atraso" : EXEC_STATUSES.find(([k]) => k === fStatus)?.[1] || fStatus] as [string, string]] : []),
    ...(fUnid !== T ? [["Unidade", lojaNome(Number(fUnid)).toUpperCase()] as [string, string]] : []),
    ...(fResp !== T ? [["Responsável", fResp] as [string, string]] : []),
    ...(de ? [["De", de.split("-").reverse().join("/")] as [string, string]] : []),
    ...(ate ? [["Até", ate.split("-").reverse().join("/")] as [string, string]] : []),
  ];
  const seg = inicioSemana(), fimProx = new Date(seg); fimProx.setDate(seg.getDate() + 11);

  const gerar = async () => {
    if (!gantt && !semanal && !excel) { toast({ title: "Escolha pelo menos um formato", variant: "destructive" }); return; }
    setBusy(true);
    try {
      if (gantt || semanal) gerarPdfCronograma({ titulo: "Cronograma — Controle de Acesso nos Elevadores", filtros, stages, atividades: filtradas, unidadesDe, gantt, semanal });
      if (excel) await onExcel(new Set(filtradas.map((a) => a.id)));
      onOpenChange(false);
    } catch (e: any) { toast({ title: "Não foi possível gerar o relatório", description: e?.message, variant: "destructive" }); }
    setBusy(false);
  };
  const limpar = () => { setFEtapa(T); setFStatus(T); setFUnid(T); setFResp(T); setDe(""); setAte(""); };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Relatório do cronograma</DialogTitle><DialogDescription>Escolha os filtros e os formatos. Tudo que for gerado respeita os filtros.</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Etapa</Label><ClearableSelect value={fEtapa} onValueChange={setFEtapa} options={[{ value: T, label: "Todas" }, ...stages.map((s) => ({ value: String(s.id), label: `${s.ordem}. ${s.nome}` }))]} /></div>
        <div className="space-y-1"><Label>Status</Label><ClearableSelect value={fStatus} onValueChange={setFStatus} options={[{ value: T, label: "Todos" }, ...EXEC_STATUSES.map(([v, l]) => ({ value: v, label: l })), { value: "ATRASADO", label: "Atraso" }]} /></div>
        <div className="space-y-1"><Label>Unidade</Label><ClearableSelect value={fUnid} onValueChange={setFUnid} options={[{ value: T, label: "Todas" }, ...unidadeOpts]} /></div>
        <div className="space-y-1"><Label>Responsável</Label><ClearableSelect value={fResp} onValueChange={setFResp} options={[{ value: T, label: "Todos" }, ...respOpts]} /></div>
        <div className="space-y-1"><Label>Período — de</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
        <div className="space-y-1"><Label>Período — até</Label><Input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} /></div>
      </div>
      <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground"><strong className="text-foreground">{filtradas.length}</strong> de {atvs.length} atividades</span><Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros</Button></div>
      <div className="space-y-2 rounded-md border p-3">
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={gantt} onCheckedChange={(v) => setGantt(!!v)} /><span><strong>PDF — Gantt</strong><br /><span className="text-muted-foreground">Todas as etapas e atividades em página grande (A3 deitada).</span></span></label>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={semanal} onCheckedChange={(v) => setSemanal(!!v)} /><span><strong>PDF — Calendário semanal</strong><br /><span className="text-muted-foreground">Dias úteis (segunda a sexta) da semana atual e da próxima: {br(seg)} a {br(fimProx)}. Muda sozinho conforme a data em que o relatório é gerado.</span></span></label>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={excel} onCheckedChange={(v) => setExcel(!!v)} /><span><strong>Planilha Excel</strong><br /><span className="text-muted-foreground">Planilha completa; a aba Atividades segue os filtros.</span></span></label>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={gerar} disabled={busy}><FileDown className="mr-1 h-4 w-4" />{busy ? "Gerando..." : "Gerar relatório"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
// iso re-export kept for tree-shaking parity
void iso;
