import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { cn } from "@/lib/utils";
import {
  AlertOctagon, AlertTriangle, Boxes, Check, ChevronRight, Circle, Minus,
  Plus, Search, Trash2, X,
} from "lucide-react";

const db = supabase as any;

type Tipo = "SWITCH" | "ANTENA";
interface Item { id?: number; unidade_id: number; tipo: Tipo; modelo: string; quantidade: number; observacao?: string | null }
interface Geral { unidade_id: number; wan_qtd_links: number | null; wan_problemas: boolean; camera_tipo: "IP" | "ANALOG" | null; observacoes: string | null }
interface Unidade { id: number; nome_unidade: string; empresa_id?: number | null; cidade?: string | null; estado?: string | null }

const NOVAS_ANTENAS = ["U6+", "U6 PRO"];
const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

export function statusSwitch(items: Item[]): string | null {
  const s = items.filter((i) => i.tipo === "SWITCH" && i.quantidade > 0);
  if (!s.length) return null;
  const ubi = s.filter((i) => norm(i.modelo).includes("UBIQUITI"));
  if (!ubi.length) return "N/E";
  return ubi.length === s.length ? "TOTAL" : "PARCIAL";
}
export function statusAntenas(items: Item[]): string | null {
  const a = items.filter((i) => i.tipo === "ANTENA" && i.quantidade > 0);
  if (!a.length) return null;
  const novas = a.filter((i) => NOVAS_ANTENAS.includes(norm(i.modelo)));
  if (!novas.length) return "N/E";
  return novas.length === a.length ? "TOTAL" : "PARCIAL";
}
export function statusWan(g: Geral | undefined, links: number): string | null {
  if (g?.wan_problemas) return "PROBLEMAS";
  return links >= 2 ? "OK" : "S/R";
}

/* ---------- Situação: cada cor tem um único significado ----------
   ok (azul) = situação boa · warn (âmbar) = precisa de atenção
   critical (vermelho) = problema declarado · info (cinza-azulado) = só informação
   missing (tracejado) = ainda não foi informado                        */
type ChipKind = "ok" | "warn" | "critical" | "info" | "missing";

const CHIP: Record<ChipKind, { cls: string; Icon: typeof Check }> = {
  ok: { cls: "border-status-ok-border bg-status-ok-bg text-status-ok", Icon: Check },
  warn: { cls: "border-status-warn-border bg-status-warn-bg text-status-warn", Icon: AlertTriangle },
  critical: { cls: "border-status-critical-border bg-status-critical-bg text-status-critical", Icon: AlertOctagon },
  info: { cls: "border-status-info-border bg-status-info-bg text-status-info", Icon: Circle },
  missing: { cls: "border-dashed border-status-neutral-border bg-status-neutral-bg text-status-neutral", Icon: Minus },
};

const chipKind = (v: string | null): ChipKind => {
  if (!v) return "missing";
  if (v === "PROBLEMAS") return "critical";
  if (v === "PARCIAL" || v === "S/R" || v === "N/E") return "warn";
  if (v === "TOTAL" || v === "OK") return "ok";
  return "info";
};

const StatusChip = ({ v, className }: { v: string | null; className?: string }) => {
  const { cls, Icon } = CHIP[chipKind(v)];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap",
      cls, className,
    )}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      {v ?? "Não informado"}
    </span>
  );
};

const local = (u: Unidade) => [u.cidade, u.estado].filter(Boolean).join(" · ");

export default function Inventario() {
  const { toast } = useToast();
  const { user } = useUser();
  const canEdit = ["SUPERADMIN", "ADMIN", "USER"].includes(user.role);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [empresas, setEmpresas] = useState<{ id: number; nome_fantasia: string }[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [gerais, setGerais] = useState<Geral[]>([]);
  const [linkCount, setLinkCount] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fEmp, setFEmp] = useState("ALL");
  const [fEst, setFEst] = useState("ALL");
  const [fCid, setFCid] = useState("ALL");
  const [fSw, setFSw] = useState("ALL");
  const [fAn, setFAn] = useState("ALL");
  const [fWan, setFWan] = useState("ALL");
  const [fCam, setFCam] = useState("ALL");
  const [sel, setSel] = useState<Unidade | null>(null);

  const load = async () => {
    setLoading(true);
    const [u, i, g, e, l] = await Promise.all([
      supabase.from("unidades").select("id, nome_unidade, empresa_id, cidade, estado").order("nome_unidade"),
      db.from("inventario_itens").select("*"),
      db.from("inventario_unidade").select("*"),
      supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia"),
      supabase.from("links_internet").select("unidade_id").limit(10000),
    ]);
    setUnidades((u.data as Unidade[]) || []);
    setEmpresas((e.data as any[]) || []);
    setItens(i.data || []);
    setGerais(g.data || []);
    const lc: Record<number, number> = {};
    ((l.data as any[]) || []).forEach((x) => { if (x.unidade_id) lc[x.unidade_id] = (lc[x.unidade_id] || 0) + 1; });
    setLinkCount(lc);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter(Boolean).map((x) => x!.trim().toUpperCase()))].sort();
  const base = unidades.filter((u) => fEmp === "ALL" || String(u.empresa_id) === fEmp);
  const estados = uniq(base.map((u) => u.estado));
  const cidades = uniq(base.filter((u) => fEst === "ALL" || u.estado?.trim().toUpperCase() === fEst).map((u) => u.cidade));
  const match = (f: string, v: string | null) => f === "ALL" || (f === "NONE" ? v == null : v === f);

  const rows = useMemo(() => unidades
    .filter((u) => u.nome_unidade.toLowerCase().includes(search.toLowerCase()))
    .filter((u) => fEmp === "ALL" || String(u.empresa_id) === fEmp)
    .filter((u) => fEst === "ALL" || u.estado?.trim().toUpperCase() === fEst)
    .filter((u) => fCid === "ALL" || u.cidade?.trim().toUpperCase() === fCid)
    .map((u) => {
      const it = itens.filter((x) => x.unidade_id === u.id);
      const g = gerais.find((x) => x.unidade_id === u.id);
      return { u, sw: statusSwitch(it), an: statusAntenas(it), wan: statusWan(g, linkCount[u.id] || 0), cam: g?.camera_tipo ?? null };
    })
    .filter((r) => match(fSw, r.sw) && match(fAn, r.an) && match(fWan, r.wan) && match(fCam, r.cam)),
    [unidades, itens, gerais, linkCount, search, fEmp, fEst, fCid, fSw, fAn, fWan, fCam]);

  const anyFilter = search || [fEmp, fEst, fCid, fSw, fAn, fWan, fCam].some((f) => f !== "ALL");
  const clear = () => { setSearch(""); setFEmp("ALL"); setFEst("ALL"); setFCid("ALL"); setFSw("ALL"); setFAn("ALL"); setFWan("ALL"); setFCam("ALL"); };

  const F = ({ label, value, onChange, opts, className }: {
    label: string; value: string; onChange: (v: string) => void; opts: [string, string][]; className?: string;
  }) => {
    const active = value !== "ALL";
    return (
      <div className={cn("space-y-1.5", className)}>
        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className={cn("h-9 text-sm", active && "border-status-info-border bg-status-info-bg font-semibold text-status-info")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos</SelectItem>
            {opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  };
  const stOpts = (vals: string[]): [string, string][] => [...vals.map((v) => [v, v] as [string, string]), ["NONE", "Não informado"]];

  const accent = (r: { sw: string | null; an: string | null; wan: string | null }) =>
    r.wan === "PROBLEMAS" ? "border-l-status-critical"
      : [r.sw, r.an].some((x) => x === "PARCIAL" || x === "N/E") || r.wan === "S/R" ? "border-l-status-warn"
        : "border-l-transparent";

  const TH = "px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground";

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventário</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Situação de switch, antenas, links e câmeras de cada unidade.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-status-ok-border bg-status-ok-bg px-3 py-1 text-sm font-semibold text-status-ok">
            <Boxes className="h-4 w-4" aria-hidden />
            {rows.length} {rows.length === 1 ? "unidade" : "unidades"}
          </span>
          {anyFilter && (
            <Button variant="ghost" size="sm" onClick={clear} className="text-muted-foreground hover:text-foreground">
              <X className="mr-1 h-3.5 w-3.5" /> Limpar filtros
            </Button>
          )}
        </div>
      </header>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/40 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              placeholder="Buscar unidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 bg-background pl-10"
            />
          </div>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          <F label="Empresa" value={fEmp} onChange={(v) => { setFEmp(v); setFEst("ALL"); setFCid("ALL"); }} opts={empresas.map((e) => [String(e.id), e.nome_fantasia])} />
          <F label="Estado" value={fEst} onChange={(v) => { setFEst(v); setFCid("ALL"); }} opts={estados.map((e) => [e, e])} />
          <F label="Cidade" value={fCid} onChange={setFCid} opts={cidades.map((c) => [c, c])} />
          <F label="Switch" value={fSw} onChange={setFSw} opts={stOpts(["TOTAL", "PARCIAL", "N/E"])} className="lg:border-l lg:border-border lg:pl-3" />
          <F label="Antenas" value={fAn} onChange={setFAn} opts={stOpts(["TOTAL", "PARCIAL", "N/E"])} />
          <F label="WANs" value={fWan} onChange={setFWan} opts={[["OK", "OK"], ["S/R", "S/R"], ["PROBLEMAS", "PROBLEMAS"]]} />
          <F label="Câmeras" value={fCam} onChange={setFCam} opts={stOpts(["IP", "ANALOG"])} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b bg-muted/20 hover:bg-muted/20">
                  <TableHead className={cn(TH, "w-[34%] pl-6")}>Unidade</TableHead>
                  <TableHead className={cn(TH, "text-center")}>Switch</TableHead>
                  <TableHead className={cn(TH, "text-center")}>Antenas</TableHead>
                  <TableHead className={cn(TH, "text-center")}>WANs</TableHead>
                  <TableHead className={cn(TH, "text-center")}>Câmeras</TableHead>
                  <TableHead className={cn(TH, "w-10 pr-4")} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i} className="border-l-4 border-l-transparent">
                      <TableCell className="px-6 py-4">
                        <div className="h-4 w-44 animate-pulse rounded bg-muted" />
                        <div className="mt-2 h-3 w-24 animate-pulse rounded bg-muted" />
                      </TableCell>
                      {[0, 1, 2, 3].map((k) => (
                        <TableCell key={k} className="text-center">
                          <div className="mx-auto h-5 w-20 animate-pulse rounded-md bg-muted" />
                        </TableCell>
                      ))}
                      <TableCell />
                    </TableRow>
                  ))
                ) : rows.length === 0 ? (
                  <TableRow className="border-l-4 border-l-transparent">
                    <TableCell colSpan={6} className="px-6 py-16 text-center">
                      <Boxes className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
                      <p className="mt-3 text-sm font-semibold">Nenhuma unidade encontrada</p>
                      <p className="mt-1 text-xs text-muted-foreground">Ajuste a busca ou os filtros para ver mais resultados.</p>
                      {anyFilter && (
                        <Button variant="outline" size="sm" className="mt-4" onClick={clear}>
                          <X className="mr-1 h-3.5 w-3.5" /> Limpar filtros
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ) : rows.map((r) => (
                  <TableRow
                    key={r.u.id}
                    onClick={() => setSel(r.u)}
                    className={cn("group cursor-pointer border-l-4 transition-colors hover:bg-muted/60", accent(r))}
                  >
                    <TableCell className="px-6 py-3.5">
                      <div className="text-sm font-semibold uppercase tracking-tight">{r.u.nome_unidade}</div>
                      {local(r.u) && <div className="mt-0.5 text-xs text-muted-foreground">{local(r.u)}</div>}
                    </TableCell>
                    <TableCell className="px-4 py-3.5 text-center"><StatusChip v={r.sw} /></TableCell>
                    <TableCell className="px-4 py-3.5 text-center"><StatusChip v={r.an} /></TableCell>
                    <TableCell className="px-4 py-3.5 text-center"><StatusChip v={r.wan} /></TableCell>
                    <TableCell className="px-4 py-3.5 text-center"><StatusChip v={r.cam} /></TableCell>
                    <TableCell className="pr-4 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/25 px-6 py-3 text-xs text-muted-foreground">
            <span className="font-medium">Mostrando {rows.length} de {unidades.length} unidades</span>
            <span className="inline-flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              Clique em uma unidade para ver e editar o inventário
            </span>
          </div>
        </CardContent>
      </Card>

      {sel && (
        <InventarioModal
          unidade={sel}
          canEdit={canEdit}
          itens={itens.filter((x) => x.unidade_id === sel.id)}
          geral={gerais.find((x) => x.unidade_id === sel.id)}
          links={linkCount[sel.id] || 0}
          onClose={() => setSel(null)}
          onSaved={() => { toast({ title: "Inventário salvo" }); setSel(null); load(); }}
          onError={(m) => toast({ title: "Erro ao salvar", description: m, variant: "destructive" })}
        />
      )}
    </div>
  );
}

function InventarioModal({ unidade, canEdit, itens, geral, links, onClose, onSaved, onError }: {
  unidade: Unidade; canEdit: boolean; itens: Item[]; geral?: Geral; links: number;
  onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [list, setList] = useState<Item[]>(itens.map((i) => ({ ...i })));
  const [g, setG] = useState<Geral>(geral ?? { unidade_id: unidade.id, wan_qtd_links: null, wan_problemas: false, camera_tipo: null, observacoes: null });
  const [saving, setSaving] = useState(false);

  const add = (tipo: Tipo) => setList([...list, { unidade_id: unidade.id, tipo, modelo: "", quantidade: 0 }]);
  const upd = (idx: number, p: Partial<Item>) => setList(list.map((x, i) => (i === idx ? { ...x, ...p } : x)));
  const del = (idx: number) => setList(list.filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    try {
      const valid = list.filter((x) => x.modelo.trim());
      const keep = valid.filter((x) => x.id).map((x) => x.id);
      const removed = itens.filter((x) => !keep.includes(x.id)).map((x) => x.id);
      if (removed.length) { const r = await db.from("inventario_itens").delete().in("id", removed); if (r.error) throw r.error; }
      for (const x of valid) {
        const row = { unidade_id: unidade.id, tipo: x.tipo, modelo: norm(x.modelo), quantidade: Math.max(0, Number(x.quantidade) || 0), observacao: x.observacao ?? null };
        const r = x.id ? await db.from("inventario_itens").update(row).eq("id", x.id) : await db.from("inventario_itens").insert(row);
        if (r.error) throw r.error;
      }
      const r = await db.from("inventario_unidade").upsert({ ...g, unidade_id: unidade.id });
      if (r.error) throw r.error;
      onSaved();
    } catch (e: any) { onError(e.message); } finally { setSaving(false); }
  };

  const section = (tipo: Tipo, label: string, placeholder: string) => (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_120px_40px] gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{label}</span><span>Quantidade</span><span />
      </div>
      {list.map((x, idx) => x.tipo !== tipo ? null : (
        <div key={idx} className="grid grid-cols-[1fr_120px_40px] gap-2">
          <Input value={x.modelo} placeholder={placeholder} disabled={!canEdit} onChange={(e) => upd(idx, { modelo: e.target.value })} />
          <Input type="number" min={0} value={x.quantidade} disabled={!canEdit} onChange={(e) => upd(idx, { quantidade: Number(e.target.value) })} />
          {canEdit && <Button variant="ghost" size="icon" onClick={() => del(idx)} aria-label="Remover"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ))}
      {!list.some((x) => x.tipo === tipo) && (
        <p className="rounded-md border border-dashed border-status-neutral-border bg-status-neutral-bg px-3 py-4 text-center text-xs text-status-neutral">
          Nenhum {label.toLowerCase()} cadastrado.
        </p>
      )}
      {canEdit && <Button variant="outline" size="sm" onClick={() => add(tipo)}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>}
    </div>
  );

  const resumo: [string, string | null][] = [
    ["Switch", statusSwitch(list)],
    ["Antenas", statusAntenas(list)],
    ["WANs", statusWan(g, links)],
    ["Câmeras", g.camera_tipo],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-tight">{unidade.nome_unidade}</DialogTitle>
          {local(unidade) && <p className="text-sm text-muted-foreground">{local(unidade)}</p>}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {resumo.map(([l, v]) => (
            <div key={l} className="rounded-lg border bg-muted/20 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{l}</div>
              <div className="mt-2"><StatusChip v={v} /></div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="switches">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="switches">Switches</TabsTrigger>
            <TabsTrigger value="antenas">Antenas</TabsTrigger>
            <TabsTrigger value="wans">WANs</TabsTrigger>
            <TabsTrigger value="cameras">Câmeras</TabsTrigger>
          </TabsList>
          <TabsContent value="switches" className="mt-4">{section("SWITCH", "Fabricante/Modelo", "Ex.: Ubiquiti")}</TabsContent>
          <TabsContent value="antenas" className="mt-4">{section("ANTENA", "Modelo", "Ex.: U6+, U6 Pro, UAP LR")}</TabsContent>
          <TabsContent value="wans" className="mt-4 space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Links de internet cadastrados</div>
              <div className="mt-1 text-3xl font-bold tabular-nums">{links}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Vem do cadastro de links da unidade · 0 ou 1 link = S/R · 2 ou mais = OK
              </p>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-status-critical-border bg-status-critical-bg p-4">
              <Switch checked={g.wan_problemas} disabled={!canEdit} onCheckedChange={(v) => setG({ ...g, wan_problemas: v })} />
              <Label className="cursor-pointer text-sm font-semibold text-status-critical">
                Marcar como PROBLEMAS (instabilidade grave)
              </Label>
            </div>
          </TabsContent>
          <TabsContent value="cameras" className="mt-4 space-y-2">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tipo de câmera</Label>
            <Select value={g.camera_tipo ?? "none"} disabled={!canEdit} onValueChange={(v) => setG({ ...g, camera_tipo: v === "none" ? null : (v as any) })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Não informado</SelectItem>
                <SelectItem value="IP">IP</SelectItem>
                <SelectItem value="ANALOG">ANALOG</SelectItem>
              </SelectContent>
            </Select>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Observações</Label>
          <Textarea value={g.observacoes ?? ""} disabled={!canEdit} onChange={(e) => setG({ ...g, observacoes: e.target.value || null })} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          {canEdit && <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
