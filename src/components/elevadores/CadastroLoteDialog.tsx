import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Elevador, traduzErro } from "./elevModel";

const db = supabase as any;
const GOODSTORAGE_EMPRESA_ID = 1;
export type ModoCadastro = "unidade" | "elevador" | "facial";
type ElevDraft = { key: string; tipo: string; marca: string; numero_serie: string };
type FacDraft = { key: string; codigo: string; marca: string; modelo: string; numero_serie: string; elevador: string };
let seq = 0; const k = () => `n${++seq}`;
const novoElev = (): ElevDraft => ({ key: k(), tipo: "", marca: "", numero_serie: "" });
const novaFac = (elevador = ""): FacDraft => ({ key: k(), codigo: "", marca: "", modelo: "", numero_serie: "", elevador });

interface Props { modo: ModoCadastro | null; onClose: () => void; lojas: { unidade_id: number; unidades?: { nome_unidade: string } }[]; elevadores: Elevador[]; onSaved: () => void; unidadeInicial?: number }

export default function CadastroLoteDialog({ modo, onClose, lojas, elevadores, onSaved, unidadeInicial }: Props) {
  const { toast } = useToast();
  const [un, setUn] = useState({ nome: "", codigo: "", cidade: "", estado: "SP", lote: "", data_prevista: "" });
  const [unidadeId, setUnidadeId] = useState(""), [elevs, setElevs] = useState<ElevDraft[]>([]), [facs, setFacs] = useState<FacDraft[]>([]), [saving, setSaving] = useState(false);
  useEffect(() => { if (!modo) return; setUn({ nome: "", codigo: "", cidade: "", estado: "SP", lote: "", data_prevista: "" }); setUnidadeId(unidadeInicial ? String(unidadeInicial) : ""); setElevs(modo === "elevador" ? [novoElev()] : []); setFacs(modo === "facial" ? [novaFac()] : []); }, [modo, unidadeInicial]);

  const existentes = elevadores.filter((e) => String(e.unidade_id) === unidadeId);
  const opcoesElev = [...elevs.filter((e) => e.tipo.trim()).map((e, i) => ({ v: `new:${e.key}`, l: `Novo: ${e.tipo || `Elevador ${i + 1}`}` })), ...(modo === "unidade" ? [] : existentes.map((e) => ({ v: String(e.id), l: `${e.tipo} #${e.id}${e.numero_serie ? ` · ${e.numero_serie}` : ""}` })))];
  const setE = (key: string, p: Partial<ElevDraft>) => setElevs((xs) => xs.map((x) => x.key === key ? { ...x, ...p } : x));
  const setF = (key: string, p: Partial<FacDraft>) => setFacs((xs) => xs.map((x) => x.key === key ? { ...x, ...p } : x));

  const salvar = async () => {
    if (modo === "unidade" && !un.nome.trim()) return toast({ title: "Informe o nome da unidade", variant: "destructive" });
    if (modo !== "unidade" && !unidadeId) return toast({ title: "Selecione a unidade", variant: "destructive" });
    const es = elevs.filter((e) => e.tipo.trim()), fs = facs.filter((f) => f.codigo.trim());
    if (modo === "facial" && fs.some((f) => !f.elevador)) return toast({ title: "Escolha o elevador de cada facial", variant: "destructive" });
    if (!es.length && !fs.length && modo !== "unidade") return toast({ title: "Adicione ao menos um item", variant: "destructive" });
    setSaving(true);
    try {
      let uid = Number(unidadeId);
      if (modo === "unidade") {
        const { data, error } = await db.from("unidades").insert({ empresa_id: GOODSTORAGE_EMPRESA_ID, nome_unidade: un.nome.trim().toUpperCase(), codigo_unidade: un.codigo.trim() || null, cidade: un.cidade.trim() || null, estado: un.estado.trim().toUpperCase() || null }).select("id").single();
        if (error) throw error; uid = data.id;
        const r = await db.from("elev_lojas").insert({ unidade_id: uid, lote: un.lote || null, data_prevista: un.data_prevista || null, estoque_leitoras: 0 }); if (r.error) throw r.error;
      }
      const ids = new Map<string, number>();
      if (es.length) { const { data, error } = await db.from("elev_elevadores").insert(es.map((e) => ({ unidade_id: uid, tipo: e.tipo.trim(), marca: e.marca.trim() || null, numero_serie: e.numero_serie.trim() || null, status: "PENDENTE" }))).select("id"); if (error) throw error; es.forEach((e, i) => ids.set(`new:${e.key}`, data[i].id)); }
      if (fs.length) { const { error } = await db.from("elev_faciais").insert(fs.map((f) => ({ unidade_id: uid, codigo: f.codigo.trim(), marca: f.marca.trim() || null, modelo: f.modelo.trim() || null, numero_serie: f.numero_serie.trim() || null, elevador_id: f.elevador ? (ids.get(f.elevador) ?? Number(f.elevador)) : null }))); if (error) throw error; }
      toast({ title: "Cadastro salvo", description: `${modo === "unidade" ? "1 unidade, " : ""}${es.length} elevador(es), ${fs.length} facial(is)` });
      onSaved(); onClose();
    } catch (e: any) { toast({ title: "Não foi possível salvar", description: traduzErro(e?.message || ""), variant: "destructive" }); } finally { setSaving(false); }
  };

  const titulo = modo === "unidade" ? "Nova unidade" : modo === "elevador" ? "Novos elevadores" : "Novas faciais";
  return <Dialog open={!!modo} onOpenChange={(v) => !v && onClose()}><DialogContent className="max-w-3xl"><DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
    <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
      {modo === "unidade" ? <section className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><Label>Nome da unidade *</Label><Input value={un.nome} onChange={(e) => setUn({ ...un, nome: e.target.value.toUpperCase() })} /></div>
        <div><Label>UDM Código</Label><Input value={un.codigo} onChange={(e) => setUn({ ...un, codigo: e.target.value })} /></div>
        <div><Label>Cidade</Label><Input value={un.cidade} onChange={(e) => setUn({ ...un, cidade: e.target.value })} /></div>
        <div><Label>Estado</Label><Input maxLength={2} value={un.estado} onChange={(e) => setUn({ ...un, estado: e.target.value })} /></div>
        <div><Label>Lote</Label><Select value={un.lote || "none"} onValueChange={(v) => setUn({ ...un, lote: v === "none" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem lote</SelectItem><SelectItem value="2026">Lote 2026</SelectItem><SelectItem value="2027">Lote 2027</SelectItem></SelectContent></Select></div>
        <div><Label>Data prevista</Label><Input type="date" value={un.data_prevista} onChange={(e) => setUn({ ...un, data_prevista: e.target.value })} /></div>
      </section> : <div><Label>Unidade *</Label><Select value={unidadeId} onValueChange={(v) => { setUnidadeId(v); setFacs((xs) => xs.map((f) => f.elevador.startsWith("new:") ? f : { ...f, elevador: "" })); }}><SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger><SelectContent className="max-h-72">{[...lojas].sort((a, b) => (a.unidades?.nome_unidade || "").localeCompare(b.unidades?.nome_unidade || "")).map((l) => <SelectItem key={l.unidade_id} value={String(l.unidade_id)}>{l.unidades?.nome_unidade}</SelectItem>)}</SelectContent></Select></div>}

      {modo !== "facial" && <section className="space-y-2"><div className="flex items-center justify-between"><strong className="text-sm">Elevadores ({elevs.length})</strong><Button size="sm" variant="outline" onClick={() => setElevs((x) => [...x, novoElev()])}><Plus className="mr-1 h-4 w-4" />Adicionar elevador</Button></div>
        {elevs.map((e, i) => <div key={e.key} className="grid items-end gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"><div><Label className="text-xs">Elevador {i + 1} — Tipo *</Label><Input placeholder="Ex.: Carga, Social" value={e.tipo} onChange={(ev) => setE(e.key, { tipo: ev.target.value })} /></div><div><Label className="text-xs">Marca</Label><Input value={e.marca} onChange={(ev) => setE(e.key, { marca: ev.target.value })} /></div><div><Label className="text-xs">Nº de série</Label><Input value={e.numero_serie} onChange={(ev) => setE(e.key, { numero_serie: ev.target.value })} /></div><div className="flex gap-1"><Button size="sm" variant="ghost" title="Adicionar facial a este elevador" disabled={!e.tipo.trim()} onClick={() => setFacs((x) => [...x, novaFac(`new:${e.key}`)])}><Plus className="h-4 w-4" />Facial</Button><Button size="icon" variant="ghost" className="text-destructive" onClick={() => { setElevs((x) => x.filter((y) => y.key !== e.key)); setFacs((x) => x.map((f) => f.elevador === `new:${e.key}` ? { ...f, elevador: "" } : f)); }}><Trash2 className="h-4 w-4" /></Button></div></div>)}
        {!elevs.length && <p className="text-xs text-muted-foreground">Opcional — você pode cadastrar os elevadores depois.</p>}
      </section>}

      <section className="space-y-2"><div className="flex items-center justify-between"><strong className="text-sm">Faciais ({facs.length})</strong><Button size="sm" variant="outline" onClick={() => setFacs((x) => [...x, novaFac()])}><Plus className="mr-1 h-4 w-4" />Adicionar facial</Button></div>
        {facs.map((f, i) => <div key={f.key} className="grid items-end gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_1fr_1.3fr_auto]"><div><Label className="text-xs">Facial {i + 1} — Código *</Label><Input placeholder="Ex.: UNIDADE - F01" value={f.codigo} onChange={(ev) => setF(f.key, { codigo: ev.target.value })} /></div><div><Label className="text-xs">Marca</Label><Input value={f.marca} onChange={(ev) => setF(f.key, { marca: ev.target.value })} /></div><div><Label className="text-xs">Modelo / série</Label><Input value={f.modelo} onChange={(ev) => setF(f.key, { modelo: ev.target.value })} /></div><div><Label className="text-xs">Elevador{modo === "facial" ? " *" : ""}</Label><Select value={f.elevador || "none"} onValueChange={(v) => setF(f.key, { elevador: v === "none" ? "" : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{modo !== "facial" && <SelectItem value="none">Sem elevador</SelectItem>}{opcoesElev.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent></Select></div><Button size="icon" variant="ghost" className="text-destructive" onClick={() => setFacs((x) => x.filter((y) => y.key !== f.key))}><Trash2 className="h-4 w-4" /></Button></div>)}
        {!facs.length && <p className="text-xs text-muted-foreground">Opcional. Cada facial pertence a um único elevador; um elevador pode ter várias faciais.</p>}
      </section>
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button disabled={saving} onClick={salvar}>{saving ? "Salvando..." : "Salvar tudo"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}
