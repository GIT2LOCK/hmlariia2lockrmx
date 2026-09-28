import { type DragEvent, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, GripVertical, History, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const db = supabase as any;
const STATUSES: Record<string, string> = { NAO_INICIADO: "Não iniciado", EM_ANDAMENTO: "Em andamento", AGUARDANDO: "Aguardando", BLOQUEADO: "Bloqueado", PENDENTE: "Pendente", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" };
const variant = (v: string): "default" | "secondary" | "outline" | "destructive" => v === "CONCLUIDO" ? "default" : v === "BLOQUEADO" || v === "CANCELADO" ? "destructive" : v === "EM_ANDAMENTO" ? "secondary" : "outline";
const br = (v?: string | null) => (v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "—");
const icon = (s: string) => (s === "CONCLUIDO" ? "☑" : s === "EM_ANDAMENTO" ? "🔄" : s === "BLOQUEADO" || s === "PENDENTE" ? "⚠" : "○");

type Project = { id: number; nome: string };
type Stage = { id: number; projeto_id: number; nome: string; data_inicio: string | null; data_fim: string | null; ordem: number };
type Part = { id: number; etapa_id: number; unidade_id: number; status: string; progresso_manual: number | null; observacoes: string | null; data_inicio: string | null; data_fim: string | null };
type Facial = { id: number; etapa_unidade_id: number; nome: string; descricao: string | null; status: string; observacoes: string | null; pendencias: string | null; ordem: number; concluido_em: string | null; atualizado_em: string; usuarios?: { nome: string } | null };
type Mov = { id: number; projeto_id: number; unidade_id: number; de_etapa_nome: string | null; para_etapa_id: number | null; para_etapa_nome: string | null; usuario_nome: string | null; criado_em: string };
type Shop = { unidade_id: number; unidades?: { nome_unidade: string } };
type CardData = { unidade_id: number; nome: string; stage: Stage; part: Part | null; faciais: Facial[]; progress: number; status: string; pend: number; late: boolean; resp: string[] };

export default function CronogramaKanban({ lojas, admin }: { lojas: Shop[]; admin: boolean }) {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [facials, setFacials] = useState<Facial[]>([]);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [fEtapa, setFEtapa] = useState("todas");
  const [fStatus, setFStatus] = useState("todos");
  const [fResp, setFResp] = useState("todos");
  const [fPend, setFPend] = useState("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [compact, setCompact] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [detail, setDetail] = useState<CardData | null>(null);
  const [facialOpen, setFacialOpen] = useState<Facial | null>(null);

  const load = async () => {
    const [p, e, u, f, m] = await Promise.all([
      db.from("elev_cronograma_projetos").select("id,nome").eq("ativo", true).order("id"),
      db.from("elev_cronograma_etapas").select("id,projeto_id,nome,data_inicio,data_fim,ordem").order("ordem"),
      db.from("elev_cronograma_etapa_unidades").select("*"),
      db.from("elev_cronograma_faciais").select("*, usuarios(nome)").order("ordem"),
      db.from("elev_cronograma_movimentacoes").select("*").order("criado_em", { ascending: false }),
    ]);
    const err = p.error || e.error || u.error || f.error || m.error;
    if (err) toast({ title: "Erro ao carregar Kanban", description: err.message, variant: "destructive" });
    const ps = p.data || [];
    setProjects(ps); setStages(e.data || []); setParts(u.data || []); setFacials(f.data || []); setMovs(m.data || []);
    setProjectId((v) => (v && ps.some((x: Project) => x.id === v) ? v : ps[0]?.id ?? null));
    setLoading(false);
  };
  useEffect(() => {
    load();
    const ch = db.channel("elev-kanban-rt");
    ["elev_cronograma_projetos", "elev_cronograma_etapas", "elev_cronograma_etapa_unidades", "elev_cronograma_faciais", "elev_cronograma_movimentacoes"].forEach((t) =>
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => load()));
    ch.subscribe();
    return () => { db.removeChannel(ch); };
  }, []);

  const cols = useMemo(() => stages.filter((s) => s.projeto_id === projectId).sort((a, b) => a.ordem - b.ordem || a.id - b.id), [stages, projectId]);
  const shopName = (id: number) => lojas.find((l) => l.unidade_id === id)?.unidades?.nome_unidade || `LOJA ${id}`;
  const today = new Date().toISOString().slice(0, 10);

  const cards = useMemo<CardData[]>(() => {
    const ids = new Set(cols.map((c) => c.id));
    const pp = parts.filter((p) => ids.has(p.etapa_id));
    const units = Array.from(new Set(pp.map((p) => p.unidade_id)));
    return units.map((uid) => {
      const mine = pp.filter((p) => p.unidade_id === uid);
      const lastMov = movs.find((m) => m.projeto_id === projectId && m.unidade_id === uid && m.para_etapa_id && ids.has(m.para_etapa_id));
      let stage = lastMov ? cols.find((c) => c.id === lastMov.para_etapa_id) : undefined;
      if (!stage) {
        const ordered = cols.filter((c) => mine.some((p) => p.etapa_id === c.id));
        stage = ordered.find((c) => mine.find((p) => p.etapa_id === c.id)?.status !== "CONCLUIDO") || ordered[ordered.length - 1];
      }
      const part = mine.find((p) => p.etapa_id === stage!.id) || null;
      const fs = part ? facials.filter((f) => f.etapa_unidade_id === part.id) : [];
      const done = fs.filter((f) => f.status === "CONCLUIDO").length;
      const progress = fs.length ? Math.round((done / fs.length) * 100) : part?.progresso_manual ?? (part?.status === "CONCLUIDO" ? 100 : 0);
      const status = part?.status || "NAO_INICIADO";
      const pend = fs.filter((f) => f.pendencias?.trim()).length + (part?.status === "PENDENTE" || part?.status === "BLOQUEADO" ? 1 : 0);
      const fim = part?.data_fim || stage!.data_fim;
      const late = !!fim && fim < today && status !== "CONCLUIDO" && status !== "CANCELADO";
      const resp = Array.from(new Set(fs.map((f) => f.usuarios?.nome).filter(Boolean) as string[]));
      return { unidade_id: uid, nome: shopName(uid), stage: stage!, part, faciais: fs, progress, status, pend, late, resp };
    });
  }, [cols, parts, facials, movs, projectId, lojas]);

  const responsaveis = useMemo(() => Array.from(new Set(cards.flatMap((c) => c.resp))).sort(), [cards]);
  const filtered = cards.filter((c) => {
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (fEtapa !== "todas" && String(c.stage.id) !== fEtapa) return false;
    if (fStatus === "ATRASADA" ? !c.late : fStatus !== "todos" && c.status !== fStatus) return false;
    if (fResp !== "todos" && !c.resp.includes(fResp)) return false;
    if (fPend === "com" && !c.pend) return false;
    if (fPend === "sem" && c.pend) return false;
    const ini = c.part?.data_inicio || c.stage.data_inicio, fim = c.part?.data_fim || c.stage.data_fim;
    if (de && fim && fim < de) return false;
    if (ate && ini && ini > ate) return false;
    return true;
  });

  const moveTo = async (uid: number, target: Stage) => {
    const card = cards.find((c) => c.unidade_id === uid);
    if (!card || card.stage.id === target.id || !projectId) return;
    const exists = parts.some((p) => p.etapa_id === target.id && p.unidade_id === uid);
    if (!exists) {
      const { error } = await db.from("elev_cronograma_etapa_unidades").insert({ etapa_id: target.id, unidade_id: uid, status: "EM_ANDAMENTO" });
      if (error) return toast({ title: "Não foi possível mover", description: error.message, variant: "destructive" });
    }
    const { error } = await db.from("elev_cronograma_movimentacoes").insert({ projeto_id: projectId, unidade_id: uid, de_etapa_id: card.stage.id, para_etapa_id: target.id });
    if (error) return toast({ title: "Não foi possível registrar a movimentação", description: error.message, variant: "destructive" });
    toast({ title: "Loja movida", description: `${card.nome}: ${card.stage.nome} → ${target.nome}` });
    load();
  };

  const onDrop = (e: DragEvent, s: Stage) => {
    e.preventDefault(); setOver(null);
    const uid = Number(e.dataTransfer.getData("text/plain") || dragging);
    setDragging(null);
    if (uid) moveTo(uid, s);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando Kanban...</p>;
  if (!projects.length) return <p className="text-sm text-muted-foreground">Nenhum projeto no cronograma. Crie um na aba Cronograma.</p>;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2 p-3">
          <Select value={String(projectId ?? "")} onValueChange={(v) => { setProjectId(Number(v)); setFEtapa("todas"); }}>
            <SelectTrigger className="col-span-2"><SelectValue placeholder="Projeto" /></SelectTrigger>
            <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nome}</SelectItem>)}</SelectContent>
          </Select>
          <div className="relative col-span-2">
            <Search className="pointer-events-none absolute left-2 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar loja..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Select value={fEtapa} onValueChange={setFEtapa}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todas">Todas as etapas</SelectItem>{cols.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="ATRASADA">Atrasadas</SelectItem>
              {Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fResp} onValueChange={setFResp}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Todos responsáveis</SelectItem>{responsaveis.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fPend} onValueChange={setFPend}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="todos">Pendências: todas</SelectItem><SelectItem value="com">Com pendências</SelectItem><SelectItem value="sem">Sem pendências</SelectItem></SelectContent>
          </Select>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} title="Período de" />
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} title="Período até" />
          <Button variant="outline" onClick={() => setCompact((v) => !v)} className="col-span-2">
            {compact ? <ChevronRight className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}{compact ? "Expandir cartões" : "Recolher cartões"}
          </Button>
        </CardContent>
      </Card>

      {!cols.length ? <p className="text-sm text-muted-foreground">Este projeto ainda não tem etapas.</p> : (
        <div className="overflow-x-auto pb-3">
          <div className="flex gap-3 items-start" style={{ minWidth: `${cols.length * 280}px` }}>
            {cols.map((s, i) => {
              const items = filtered.filter((c) => c.stage.id === s.id).sort((a, b) => Number(b.late) - Number(a.late) || b.pend - a.pend || a.nome.localeCompare(b.nome));
              const count = (st: string) => items.filter((c) => c.status === st).length;
              return (
                <section key={s.id}
                  className={cn("w-[280px] shrink-0 rounded-lg border border-border bg-muted/40 p-2 space-y-2 transition-colors", over === s.id && "ring-2 ring-primary/50 bg-primary/5")}
                  onDragOver={(e) => { if (admin && dragging) { e.preventDefault(); setOver(s.id); } }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(e) => admin && onDrop(e, s)}>
                  <header className="sticky top-0 px-1 pt-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-foreground line-clamp-2">{i + 1}. {s.nome}</h2>
                      <Badge variant="outline">{items.length}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{br(s.data_inicio)} → {br(s.data_fim)}</p>
                    <p className="text-[11px] text-muted-foreground">{items.length} lojas · {count("EM_ANDAMENTO")} em andamento · {items.filter((c) => !["EM_ANDAMENTO", "CONCLUIDO"].includes(c.status)).length} pendentes · {count("CONCLUIDO")} concluídas</p>
                  </header>
                  <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-0.5 min-h-[80px]">
                    {items.map((c) => {
                      const done = c.faciais.filter((f) => f.status === "CONCLUIDO").length;
                      const and = c.faciais.filter((f) => f.status === "EM_ANDAMENTO").length;
                      return (
                        <Card key={c.unidade_id} draggable={admin}
                          onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(c.unidade_id)); setDragging(c.unidade_id); }}
                          onDragEnd={() => { setDragging(null); setOver(null); }}
                          onClick={() => setDetail(c)}
                          className={cn("cursor-pointer transition hover:shadow-md", admin && "cursor-grab", c.late && "border-destructive/70", dragging === c.unidade_id && "opacity-50")}>
                          <CardContent className="p-2.5 space-y-1.5">
                            <div className="flex items-start gap-1">
                              {admin && <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />}
                              <p className="text-sm font-semibold leading-tight flex-1">{c.nome}</p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant={variant(c.status)} className="text-[10px]">{STATUSES[c.status] || c.status}</Badge>
                              {c.late && <Badge variant="destructive" className="text-[10px]"><Clock className="h-3 w-3 mr-0.5" />Atrasada</Badge>}
                              {c.pend > 0 && <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-0.5" />{c.pend} pendência{c.pend > 1 ? "s" : ""}</Badge>}
                            </div>
                            {!compact && (
                              <>
                                <p className="text-xs text-muted-foreground">{c.faciais.length} faciais · {done} concluídas · {and} em andamento · {c.faciais.length - done - and} pendentes</p>
                                <p className="text-[11px] text-muted-foreground">Prazo: {br(c.part?.data_fim || c.stage.data_fim)}{c.resp.length ? ` · ${c.resp.join(", ")}` : ""}</p>
                              </>
                            )}
                            <div className="flex items-center gap-2"><Progress value={c.progress} className="h-1.5 flex-1" /><span className="text-[11px] font-semibold">{c.progress}%</span></div>
                          </CardContent>
                        </Card>
                      );
                    })}
                    {!items.length && <p className="text-xs text-muted-foreground px-1 py-4 text-center border border-dashed rounded-md">Nenhuma loja</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
      {admin && <p className="text-xs text-muted-foreground">Arraste uma loja para outra etapa para mover. A movimentação fica registrada no histórico.</p>}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader><DialogTitle>{detail.nome}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">Etapa: {detail.stage.nome}</Badge>
                  <Badge variant={variant(detail.status)}>{STATUSES[detail.status] || detail.status}</Badge>
                  {detail.late && <Badge variant="destructive">Atrasada</Badge>}
                  <Badge variant="secondary">{detail.progress}%</Badge>
                </div>
                <p className="text-xs text-muted-foreground">Período: {br(detail.part?.data_inicio || detail.stage.data_inicio)} → {br(detail.part?.data_fim || detail.stage.data_fim)}</p>
                {detail.part?.observacoes && <p className="text-xs">{detail.part.observacoes}</p>}
                <div>
                  <p className="font-semibold mb-1">Faciais nesta etapa</p>
                  {!detail.faciais.length && <p className="text-xs text-muted-foreground">Nenhuma facial cadastrada nesta etapa.</p>}
                  <ul className="space-y-1">
                    {detail.faciais.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => setFacialOpen(f)} className="w-full text-left rounded-md border border-border p-2 hover:bg-muted">
                          <div className="flex items-center justify-between gap-2"><span>{icon(f.status)} {f.nome}</span><Badge variant={variant(f.status)} className="text-[10px]">{STATUSES[f.status] || f.status}</Badge></div>
                          {f.pendencias && <p className="text-xs text-destructive mt-1">⚠ {f.pendencias}</p>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold mb-1 flex items-center gap-1"><History className="h-4 w-4" />Movimentações</p>
                  {(() => {
                    const hs = movs.filter((m) => m.projeto_id === projectId && m.unidade_id === detail.unidade_id);
                    return hs.length ? (
                      <ul className="space-y-1 text-xs">
                        {hs.map((m) => <li key={m.id} className="border-l-2 border-primary pl-2">{m.de_etapa_nome || "—"} → {m.para_etapa_nome || "—"}<br /><span className="text-muted-foreground">{new Date(m.criado_em).toLocaleString("pt-BR")} · {m.usuario_nome || "Usuário"}</span></li>)}
                      </ul>
                    ) : <p className="text-xs text-muted-foreground">Sem movimentações registradas.</p>;
                  })()}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!facialOpen} onOpenChange={(o) => !o && setFacialOpen(null)}>
        <DialogContent className="max-w-md">
          {facialOpen && (
            <>
              <DialogHeader><DialogTitle>{facialOpen.nome}</DialogTitle></DialogHeader>
              <div className="space-y-2 text-sm">
                <Badge variant={variant(facialOpen.status)}>{STATUSES[facialOpen.status] || facialOpen.status}</Badge>
                {facialOpen.descricao && <p>{facialOpen.descricao}</p>}
                <p><span className="text-muted-foreground">Pendência:</span> {facialOpen.pendencias || "Nenhuma"}</p>
                <p><span className="text-muted-foreground">Observações:</span> {facialOpen.observacoes || "—"}</p>
                <p><span className="text-muted-foreground">Responsável:</span> {facialOpen.usuarios?.nome || "—"}</p>
                <p><span className="text-muted-foreground">Prazo da etapa:</span> {br(detail?.part?.data_fim || detail?.stage.data_fim)}</p>
                {facialOpen.concluido_em && <p><span className="text-muted-foreground">Concluída em:</span> {new Date(facialOpen.concluido_em).toLocaleString("pt-BR")}</p>}
                <p className="text-xs text-muted-foreground">Para editar, use a aba Cronograma.</p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
