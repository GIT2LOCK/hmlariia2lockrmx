import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Circle, Link2, Unlink, Plus } from "lucide-react";
import {
  ACAO_LABEL, CHECKLIST, Elevador, Facial, FacialSituacao, FSIT_LABEL, INST_LABEL, PRES_LABEL, SIT_LABEL, SIT_VARIANT,
  STATUS_LABEL, VALID_LABEL, situacao, traduzErro,
} from "./elevModel";
import FacialDialog from "./FacialDialog";

const db = supabase as any;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

interface Props {
  elevador: Elevador | null; onClose: () => void; admin: boolean; lojaNome: (id: number) => string;
  lojas: any[]; elevadores: Elevador[]; faciais: Facial[]; onChanged: () => void;
}

export function SituacaoBadges({ e, f }: { e: Elevador; f?: Facial | null }) {
  const s = situacao(e, f);
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={e.validacao_status === "VALIDADO" ? "default" : "outline"}>{e.validacao_status === "VALIDADO" ? "Validado" : "Aguardando validação"}</Badge>
      {e.validacao_status === "VALIDADO" && <Badge variant={f ? "default" : "destructive"}>{f ? `Facial ${f.codigo}` : FSIT_LABEL[e.facial_situacao]}</Badge>}
      {e.validacao_status === "VALIDADO" && <Badge variant={SIT_VARIANT[s]}>{SIT_LABEL[s]}</Badge>}
    </div>
  );
}

export default function ElevadorDetalhe({ elevador: e, onClose, admin, lojaNome, lojas, elevadores, faciais, onChanged }: Props) {
  const { toast } = useToast();
  const [hist, setHist] = useState<any[]>([]);
  const [obs, setObs] = useState("");
  const [fsit, setFsit] = useState<FacialSituacao>("NAO_IDENTIFICADO");
  const [assoc, setAssoc] = useState("");
  const [novoFacial, setNovoFacial] = useState(false);
  const f = e ? faciais.find((x) => x.elevador_id === e.id) || null : null;
  const livres = e ? faciais.filter((x) => x.unidade_id === e.unidade_id && !x.elevador_id) : [];
  const outrosUnidade = e ? faciais.filter((x) => x.unidade_id !== e.unidade_id && !x.elevador_id) : [];

  const loadHist = async () => {
    if (!e) return;
    const { data } = await db.from("elev_historico").select("*, u:usuarios(nome)").or(`elevador_id.eq.${e.id}${f ? `,facial_id.eq.${f.id}` : ""}`).order("criado_em", { ascending: false }).limit(100);
    setHist(data || []);
  };
  useEffect(() => {
    if (!e) return;
    setObs(e.validacao_obs || ""); setFsit(e.facial_situacao === "NAO_IDENTIFICADO" ? (f ? "ENCONTRADO" : "NAO_ENCONTRADO") : e.facial_situacao); setAssoc("");
    loadHist();
  }, [e?.id, e?.validacao_status, e?.facial_situacao, f?.id, f?.instalacao, e?.status]);

  if (!e) return null;
  const run = async (p: Promise<any>, ok: string) => {
    const { error } = await p;
    if (error) { toast({ title: "Não foi possível salvar", description: traduzErro(error.message), variant: "destructive" }); return; }
    toast({ title: ok }); onChanged(); loadHist();
  };
  const validar = () => run(db.from("elev_elevadores").update({ validacao_status: "VALIDADO", facial_situacao: f ? "ENCONTRADO" : fsit, validacao_obs: obs.trim() || null }).eq("id", e.id), "Elevador validado");
  const desvalidar = () => run(db.from("elev_elevadores").update({ validacao_status: "NAO_VALIDADO", facial_situacao: "NAO_IDENTIFICADO" }).eq("id", e.id), "Validação removida");
  const associar = async () => {
    if (!assoc) return;
    const sel = faciais.find((x) => String(x.id) === assoc);
    if (sel?.elevador_id) { toast({ title: `Este facial já está associado ao elevador #${sel.elevador_id}.`, variant: "destructive" }); return; }
    await run(db.from("elev_faciais").update({ elevador_id: e.id }).eq("id", Number(assoc)), "Facial associado");
    if (e.validacao_status === "VALIDADO") await db.from("elev_elevadores").update({ facial_situacao: "ENCONTRADO" }).eq("id", e.id);
  };
  const desassociar = () => f && run(db.from("elev_faciais").update({ elevador_id: null, instalacao: "NAO_INICIADA" }).eq("id", f.id), "Facial desassociado");
  const instalarFacial = () => f && run(db.from("elev_faciais").update({ instalacao: "INSTALADA" }).eq("id", f.id), "Facial marcado como instalado");
  const toggleCheck = (k: string, v: boolean) => run(db.from("elev_elevadores").update({ checklist: { ...(e.checklist || {}), [k]: v } }).eq("id", e.id), "Checklist atualizado");

  return (
    <Sheet open={!!e} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto space-y-5">
        <SheetHeader>
          <SheetTitle>{e.tipo} <span className="text-muted-foreground font-normal">#{e.id}</span></SheetTitle>
          <SituacaoBadges e={e} f={f} />
        </SheetHeader>

        <section className="space-y-1 text-sm">
          <h3 className="font-semibold text-foreground">Informações</h3>
          <p>Unidade: <b>{lojaNome(e.unidade_id)}</b></p>
          <p>Marca: {e.marca || "—"} · Série: {e.numero_serie || "—"}</p>
          <p>Status: <Badge variant="outline">{STATUS_LABEL[e.status]}</Badge></p>
          {e.observacao && <p className="text-muted-foreground">{e.observacao}</p>}
        </section>

        <section className="space-y-2 text-sm rounded-lg border border-border p-3">
          <h3 className="font-semibold text-foreground">Validação</h3>
          <p>Status: <b>{VALID_LABEL[e.validacao_status]}</b>{e.validacao_status === "VALIDADO" && <> · {fmt(e.validado_em)}{e.val?.nome ? ` por ${e.val.nome}` : ""}</>}</p>
          {e.validacao_status === "VALIDADO" && <p>Facial na validação: <b>{FSIT_LABEL[e.facial_situacao]}</b></p>}
          {e.validacao_obs && <p className="text-muted-foreground">{e.validacao_obs}</p>}
          {admin && (
            <div className="space-y-2 pt-1">
              {!f && (
                <div className="space-y-1">
                  <Label>Situação do facial encontrada</Label>
                  <Select value={fsit} onValueChange={(v) => setFsit(v as FacialSituacao)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NAO_ENCONTRADO">Facial não encontrado</SelectItem>
                      <SelectItem value="NECESSITA_COMPRA">Necessita compra</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Se o facial foi encontrado, associe-o abaixo antes de validar.</p>
                </div>
              )}
              <Textarea rows={2} placeholder="Observações da validação" value={obs} onChange={(x) => setObs(x.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" onClick={validar}>{e.validacao_status === "VALIDADO" ? "Atualizar validação" : "Validar elevador"}</Button>
                {e.validacao_status === "VALIDADO" && <Button size="sm" variant="outline" onClick={desvalidar}>Remover validação</Button>}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-2 text-sm rounded-lg border border-border p-3">
          <h3 className="font-semibold text-foreground">Facial</h3>
          {f ? (
            <>
              <p><b>{f.codigo}</b> {f.marca && `· ${f.marca}`} {f.numero_serie && `· ${f.numero_serie}`}</p>
              <p>{PRES_LABEL[f.presenca]} · Instalação: <b>{INST_LABEL[f.instalacao]}</b>{f.instalado_em && ` em ${fmt(f.instalado_em)}`}</p>
              {admin && (
                <div className="flex flex-wrap gap-2">
                  {f.instalacao !== "INSTALADA" && <Button size="sm" onClick={instalarFacial}><CheckCircle2 className="h-4 w-4 mr-1" />Marcar instalado</Button>}
                  <Button size="sm" variant="outline" onClick={desassociar}><Unlink className="h-4 w-4 mr-1" />Desassociar</Button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-muted-foreground">{e.validacao_status === "VALIDADO" ? "Nenhum facial associado." : "Ainda não sabemos se existe facial para este elevador."}</p>
              {admin && (
                <div className="space-y-2">
                  <Select value={assoc} onValueChange={setAssoc}>
                    <SelectTrigger><SelectValue placeholder="Selecionar facial existente" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {livres.map((x) => <SelectItem key={x.id} value={String(x.id)}>{x.codigo} — {PRES_LABEL[x.presenca]} (sem elevador)</SelectItem>)}
                      {faciais.filter((x) => x.unidade_id === e.unidade_id && x.elevador_id).map((x) => (
                        <SelectItem key={x.id} value={String(x.id)} disabled>{x.codigo} — já associado ao elevador #{x.elevador_id}</SelectItem>))}
                      {!livres.length && <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum facial livre nesta unidade{outrosUnidade.length ? " (há faciais livres em outras unidades)" : ""}.</div>}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={associar} disabled={!assoc}><Link2 className="h-4 w-4 mr-1" />Associar</Button>
                    <Button size="sm" variant="outline" onClick={() => setNovoFacial(true)}><Plus className="h-4 w-4 mr-1" />Cadastrar novo facial</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="space-y-2 text-sm rounded-lg border border-border p-3">
          <h3 className="font-semibold text-foreground">Checklist</h3>
          {CHECKLIST.map((c) => {
            const auto = "auto" in c ? c.auto(e, f) : undefined;
            const v = auto ?? !!e.checklist?.[c.key];
            return (
              <label key={c.key} className="flex items-center gap-2">
                {auto !== undefined ? (v ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />)
                  : <Checkbox checked={v} disabled={!admin} onCheckedChange={(x) => toggleCheck(c.key, !!x)} />}
                <span className={v ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
              </label>
            );
          })}
        </section>

        <section className="space-y-2 text-sm">
          <h3 className="font-semibold text-foreground">Histórico</h3>
          <ol className="border-l border-border pl-4 space-y-2">
            {hist.map((h) => (
              <li key={h.id}>
                <p className="font-medium">{ACAO_LABEL[h.acao] || (h.status_novo ? `${h.status_anterior || "—"} → ${h.status_novo}` : "Alteração")}</p>
                <p className="text-xs text-muted-foreground">{fmt(h.criado_em)}{h.u?.nome ? ` · ${h.u.nome}` : ""}{h.valor_anterior || h.valor_novo ? ` · ${h.valor_anterior || "—"} → ${h.valor_novo || "—"}` : ""}</p>
              </li>
            ))}
            {!hist.length && <p className="text-xs text-muted-foreground">Sem registros.</p>}
          </ol>
        </section>

        <FacialDialog open={novoFacial} onOpenChange={setNovoFacial} unidadeId={e.unidade_id} elevadorId={e.id}
          lojas={lojas} elevadores={elevadores} faciais={faciais} onSaved={onChanged} />
      </SheetContent>
    </Sheet>
  );
}
