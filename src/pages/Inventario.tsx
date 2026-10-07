import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Plus, Search, Trash2 } from "lucide-react";

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
export function statusWan(g?: Geral): string | null {
  if (!g) return null;
  if (g.wan_problemas) return "PROBLEMAS";
  if (g.wan_qtd_links == null) return null;
  return g.wan_qtd_links >= 2 ? "OK" : "S/R";
}

const variant = (v: string | null): "default" | "secondary" | "destructive" | "outline" => {
  if (!v) return "outline";
  if (["TOTAL", "OK", "IP"].includes(v)) return "default";
  if (["PARCIAL", "S/R"].includes(v)) return "secondary";
  if (["PROBLEMAS", "N/E", "ANALOG"].includes(v)) return "destructive";
  return "outline";
};
const StatusBadge = ({ v }: { v: string | null }) => (
  <Badge variant={variant(v)} className={!v ? "text-muted-foreground" : ""}>{v ?? "Não informado"}</Badge>
);

export default function Inventario() {
  const { toast } = useToast();
  const { user } = useUser();
  const canEdit = ["SUPERADMIN", "ADMIN", "USER"].includes(user.role);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [empresas, setEmpresas] = useState<{ id: number; nome_fantasia: string }[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [gerais, setGerais] = useState<Geral[]>([]);
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
    const [u, i, g, e] = await Promise.all([
      supabase.from("unidades").select("id, nome_unidade, empresa_id, cidade, estado").order("nome_unidade"),
      db.from("inventario_itens").select("*"),
      db.from("inventario_unidade").select("*"),
      supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia"),
    ]);
    setUnidades((u.data as Unidade[]) || []);
    setEmpresas((e.data as any[]) || []);
    setItens(i.data || []);
    setGerais(g.data || []);
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
      return { u, sw: statusSwitch(it), an: statusAntenas(it), wan: statusWan(g), cam: g?.camera_tipo ?? null };
    })
    .filter((r) => match(fSw, r.sw) && match(fAn, r.an) && match(fWan, r.wan) && match(fCam, r.cam)),
    [unidades, itens, gerais, search, fEmp, fEst, fCid, fSw, fAn, fWan, fCam]);

  const anyFilter = search || [fEmp, fEst, fCid, fSw, fAn, fWan, fCam].some((f) => f !== "ALL");
  const clear = () => { setSearch(""); setFEmp("ALL"); setFEst("ALL"); setFCid("ALL"); setFSw("ALL"); setFAn("ALL"); setFWan("ALL"); setFCam("ALL"); };

  const F = ({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: [string, string][] }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos</SelectItem>
          {opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
  const stOpts = (vals: string[]): [string, string][] => [...vals.map((v) => [v, v] as [string, string]), ["NONE", "Não informado"]];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Inventário</h1>
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar unidade..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <span className="text-sm text-muted-foreground">{rows.length} unidade(s)</span>
            {anyFilter && <Button variant="ghost" size="sm" onClick={clear}>Limpar filtros</Button>}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <F label="Empresa" value={fEmp} onChange={(v) => { setFEmp(v); setFEst("ALL"); setFCid("ALL"); }} opts={empresas.map((e) => [String(e.id), e.nome_fantasia])} />
            <F label="Estado" value={fEst} onChange={(v) => { setFEst(v); setFCid("ALL"); }} opts={estados.map((e) => [e, e])} />
            <F label="Cidade" value={fCid} onChange={setFCid} opts={cidades.map((c) => [c, c])} />
            <F label="Switch" value={fSw} onChange={setFSw} opts={stOpts(["TOTAL", "PARCIAL", "N/E"])} />
            <F label="Antenas" value={fAn} onChange={setFAn} opts={stOpts(["TOTAL", "PARCIAL", "N/E"])} />
            <F label="WANs" value={fWan} onChange={setFWan} opts={stOpts(["OK", "S/R", "PROBLEMAS"])} />
            <F label="Câmeras" value={fCam} onChange={setFCam} opts={stOpts(["IP", "ANALOG"])} />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead><TableHead>Switch</TableHead><TableHead>Antenas</TableHead>
                <TableHead>WANs</TableHead><TableHead>Câmeras</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhuma unidade encontrada</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.u.id} className="cursor-pointer" onClick={() => setSel(r.u)}>
                  <TableCell className="font-medium uppercase">{r.u.nome_unidade}</TableCell>
                  <TableCell><StatusBadge v={r.sw} /></TableCell>
                  <TableCell><StatusBadge v={r.an} /></TableCell>
                  <TableCell><StatusBadge v={r.wan} /></TableCell>
                  <TableCell><StatusBadge v={r.cam} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {sel && (
        <InventarioModal
          unidade={sel}
          canEdit={canEdit}
          itens={itens.filter((x) => x.unidade_id === sel.id)}
          geral={gerais.find((x) => x.unidade_id === sel.id)}
          onClose={() => setSel(null)}
          onSaved={() => { toast({ title: "Inventário salvo" }); setSel(null); load(); }}
          onError={(m) => toast({ title: "Erro ao salvar", description: m, variant: "destructive" })}
        />
      )}
    </div>
  );
}

function InventarioModal({ unidade, canEdit, itens, geral, onClose, onSaved, onError }: {
  unidade: Unidade; canEdit: boolean; itens: Item[]; geral?: Geral;
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
      <div className="grid grid-cols-[1fr_120px_40px] gap-2 text-sm font-medium text-muted-foreground">
        <span>{label}</span><span>Quantidade</span><span />
      </div>
      {list.map((x, idx) => x.tipo !== tipo ? null : (
        <div key={idx} className="grid grid-cols-[1fr_120px_40px] gap-2">
          <Input value={x.modelo} placeholder={placeholder} disabled={!canEdit} onChange={(e) => upd(idx, { modelo: e.target.value })} />
          <Input type="number" min={0} value={x.quantidade} disabled={!canEdit} onChange={(e) => upd(idx, { quantidade: Number(e.target.value) })} />
          {canEdit && <Button variant="ghost" size="icon" onClick={() => del(idx)} aria-label="Remover"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ))}
      {!list.some((x) => x.tipo === tipo) && <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>}
      {canEdit && <Button variant="outline" size="sm" onClick={() => add(tipo)}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>}
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="uppercase">{unidade.nome_unidade}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Switch", statusSwitch(list)], ["Antenas", statusAntenas(list)], ["WANs", statusWan(g)], ["Câmeras", g.camera_tipo]].map(([l, v]) => (
            <div key={l as string} className="rounded-md border p-3">
              <div className="text-xs uppercase text-muted-foreground">{l}</div>
              <StatusBadge v={v as string | null} />
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
          <TabsContent value="switches">{section("SWITCH", "Fabricante/Modelo", "Ex.: Ubiquiti")}</TabsContent>
          <TabsContent value="antenas">{section("ANTENA", "Modelo", "Ex.: U6+, U6 Pro, UAP LR")}</TabsContent>
          <TabsContent value="wans" className="space-y-4">
            <div className="space-y-1">
              <Label>Quantidade de links</Label>
              <Input type="number" min={0} className="w-32" disabled={!canEdit} value={g.wan_qtd_links ?? ""}
                onChange={(e) => setG({ ...g, wan_qtd_links: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
              <p className="text-xs text-muted-foreground">0 ou 1 link = S/R · 2 ou mais = OK</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={g.wan_problemas} disabled={!canEdit} onCheckedChange={(v) => setG({ ...g, wan_problemas: v })} />
              <Label>Marcar como PROBLEMAS (instabilidade grave)</Label>
            </div>
          </TabsContent>
          <TabsContent value="cameras" className="space-y-1">
            <Label>Tipo de câmera</Label>
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
        <div className="space-y-1">
          <Label>Observações</Label>
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
