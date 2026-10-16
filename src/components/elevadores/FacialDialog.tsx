import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Elevador, Facial, INST_LABEL, PRES_LABEL, Presenca, Instalacao, elevNome, traduzErro } from "./elevModel";

const db = supabase as any;
interface Props {
  open: boolean; onOpenChange: (o: boolean) => void; facial?: Facial | null;
  unidadeId?: number; elevadorId?: number | null;
  lojas: { unidade_id: number; unidades?: { nome_unidade: string } }[];
  elevadores: Elevador[]; faciais: Facial[]; onSaved?: () => void;
}

export default function FacialDialog({ open, onOpenChange, facial, unidadeId, elevadorId, lojas, elevadores, faciais, onSaved }: Props) {
  const { toast } = useToast();
  const [f, setF] = useState({ unidade_id: "", elevador_id: "none", codigo: "", marca: "", modelo: "", numero_serie: "", presenca: "PRESENTE" as Presenca, instalacao: "NAO_INICIADA" as Instalacao, observacao: "", origem_tipo: "NOVA", origem_texto: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setF({
      unidade_id: String(facial?.unidade_id ?? unidadeId ?? ""), elevador_id: String(facial?.elevador_id ?? elevadorId ?? "none"),
      codigo: facial?.codigo || "", marca: facial?.marca || "", modelo: facial?.modelo || "", numero_serie: facial?.numero_serie || "",
      presenca: facial?.presenca || "PRESENTE", instalacao: facial?.instalacao || "NAO_INICIADA", observacao: facial?.observacao || "",
      origem_tipo: facial?.origem_tipo || "NOVA",
      origem_texto: facial?.origem_descricao || lojas.find((l) => l.unidade_id === facial?.origem_unidade_id)?.unidades?.nome_unidade || "",
    });
  }, [open, facial, unidadeId, elevadorId]);

  const elevsUnidade = elevadores.filter((e) => String(e.unidade_id) === f.unidade_id);
  const ocupado = (eid: number) => faciais.find((x) => x.elevador_id === eid && x.id !== facial?.id);

  const salvar = async () => {
    if (!f.unidade_id || !f.codigo.trim()) { toast({ title: "Informe a unidade e o código do facial", variant: "destructive" }); return; }
    const eid = f.elevador_id === "none" ? null : Number(f.elevador_id);
    if (eid && ocupado(eid)) { toast({ title: "Este elevador já possui outro facial associado.", variant: "destructive" }); return; }
    const row = { unidade_id: Number(f.unidade_id), elevador_id: eid, codigo: f.codigo.trim(), marca: f.marca.trim() || null, modelo: f.modelo.trim() || null,
      numero_serie: f.numero_serie.trim() || null, presenca: f.presenca, instalacao: f.instalacao, observacao: f.observacao.trim() || null,
      origem_tipo: f.origem_tipo,
      origem_unidade_id: f.origem_tipo === "NOVA" ? null : (lojas.find((l) => (l.unidades?.nome_unidade || "").toUpperCase() === f.origem_texto.trim().toUpperCase())?.unidade_id ?? null),
      origem_descricao: f.origem_tipo === "NOVA" ? null : (f.origem_texto.trim() || null) };
    if (f.origem_tipo !== "NOVA" && !f.origem_texto.trim()) { toast({ title: "Informe a origem ou selecione uma unidade", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = facial ? await db.from("elev_faciais").update(row).eq("id", facial.id) : await db.from("elev_faciais").insert(row);
    setSaving(false);
    if (error) { toast({ title: "Não foi possível salvar", description: traduzErro(error.message), variant: "destructive" }); return; }
    toast({ title: facial ? "Facial atualizado" : "Facial cadastrado" });
    onOpenChange(false); onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{facial ? "Editar facial" : "Novo facial"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Unidade *</Label>
            <Select value={f.unidade_id} onValueChange={(v) => setF({ ...f, unidade_id: v, elevador_id: "none" })}>
              <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {[...lojas].sort((a, b) => (a.unidades?.nome_unidade || "").localeCompare(b.unidades?.nome_unidade || "")).map((l) => (
                  <SelectItem key={l.unidade_id} value={String(l.unidade_id)}>{l.unidades?.nome_unidade}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Elevador</Label>
            <Select value={f.elevador_id} onValueChange={(v) => setF({ ...f, elevador_id: v })} disabled={!f.unidade_id}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">Sem elevador (disponível na unidade)</SelectItem>
                {elevsUnidade.map((e) => { const o = ocupado(e.id); return (
                  <SelectItem key={e.id} value={String(e.id)} disabled={!!o}>{elevNome(e)}{o ? ` — já tem facial ${o.codigo}` : ""}</SelectItem>); })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Código *</Label><Input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Ex.: F-01" /></div>
            <div className="space-y-1"><Label>Nº de série</Label><Input value={f.numero_serie} onChange={(e) => setF({ ...f, numero_serie: e.target.value })} /></div>
            <div className="space-y-1"><Label>Marca</Label><Input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} /></div>
            <div className="space-y-1"><Label>Modelo</Label><Input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>Presença</Label>
              <Select value={f.presenca} onValueChange={(v) => setF({ ...f, presenca: v as Presenca })} disabled={f.elevador_id !== "none"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(PRES_LABEL) as Presenca[]).map((k) => <SelectItem key={k} value={k}>{PRES_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Instalação</Label>
              <Select value={f.instalacao} onValueChange={(v) => setF({ ...f, instalacao: v as Instalacao })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(INST_LABEL) as Instalacao[]).map((k) => <SelectItem key={k} value={k} disabled={k !== "NAO_INICIADA" && f.elevador_id === "none"}>{INST_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Procedência</Label>
              <Select value={f.origem_tipo} onValueChange={(v) => setF({ ...f, origem_tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORIGEM">Origem</SelectItem>
                  <SelectItem value="NOVA">Nova</SelectItem>
                  <SelectItem value="REMANEJADA">Remanejada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.origem_tipo !== "NOVA" && (
              <div className="space-y-1">
                <Label>{f.origem_tipo === "REMANEJADA" ? "Remanejada de" : "Origem"}</Label>
                <Input list="facial-origem-unidades" value={f.origem_texto} onChange={(e) => setF({ ...f, origem_texto: e.target.value })} placeholder="Digite ou escolha uma unidade" />
                <datalist id="facial-origem-unidades">
                  {[...lojas].sort((a, b) => (a.unidades?.nome_unidade || "").localeCompare(b.unidades?.nome_unidade || "")).map((l) => (
                    <option key={l.unidade_id} value={l.unidades?.nome_unidade} />))}
                </datalist>
              </div>
            )}
          </div>
          <div className="space-y-1"><Label>Observação</Label><Textarea rows={2} value={f.observacao} onChange={(e) => setF({ ...f, observacao: e.target.value })} /></div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {facial ? <Button variant="destructive" disabled={saving} onClick={async () => {
            if (!window.confirm(`Apagar a facial ${facial.codigo}? Essa ação não pode ser desfeita.`)) return;
            setSaving(true);
            await db.from("elev_cronograma_faciais").delete().eq("facial_id", facial.id);
            await db.from("elev_historico").update({ facial_id: null }).eq("facial_id", facial.id);
            const { error } = await db.from("elev_faciais").delete().eq("id", facial.id);
            setSaving(false);
            if (error) { toast({ title: "Não foi possível apagar", description: traduzErro(error.message), variant: "destructive" }); return; }
            toast({ title: "Facial apagada" }); onOpenChange(false); onSaved?.();
          }}>Apagar</Button> : <span />}
          <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
