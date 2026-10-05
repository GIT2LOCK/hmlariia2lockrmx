import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import CadastroLoteDialog, { ModoCadastro } from "./CadastroLoteDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import { Elevador, Facial, INST_LABEL, PRES_LABEL, SIT_LABEL, SIT_VARIANT, STATUS_LABEL, VALID_LABEL, situacao } from "./elevModel";
import FacialDialog from "./FacialDialog";

interface Props {
  elevadores: Elevador[]; faciais: Facial[]; lojas: any[]; admin: boolean; lojaNome: (id: number) => string;
  onOpenElevador: (e: Elevador) => void; onChanged: () => void;
}

export default function CadastrosView({ elevadores, faciais, lojas, admin, lojaNome, onOpenElevador, onChanged }: Props) {
  const [fv, setFv] = useState("todos"), [ff, setFf] = useState("todos"), [fi, setFi] = useState("todos");
  const [fFac, setFFac] = useState("todos");
  const [edit, setEdit] = useState<Facial | null>(null), [open, setOpen] = useState(false);
  const [unidadeIni, setUnidadeIni] = useState<number | undefined>();
  const [modo, setModo] = useState<ModoCadastro | null>(null), [buscaU, setBuscaU] = useState(""), [aberta, setAberta] = useState<Set<number>>(new Set());
  const facsDe = (id: number) => faciais.filter((x) => x.elevador_id === id);
  const fac = (id: number) => faciais.find((x) => x.elevador_id === id);

  const elevs = useMemo(() => elevadores.filter((e) => {
    const f = fac(e.id);
    if (fv !== "todos" && e.validacao_status !== fv) return false;
    if (ff === "com" && !f) return false;
    if (ff === "sem" && (f || e.validacao_status !== "VALIDADO")) return false;
    if (ff === "nao_encontrado" && e.facial_situacao !== "NAO_ENCONTRADO") return false;
    if (ff === "compra" && e.facial_situacao !== "NECESSITA_COMPRA") return false;
    if (fi !== "todos" && (f?.instalacao || "NAO_INICIADA") !== fi) return false;
    return true;
  }), [elevadores, faciais, fv, ff, fi]);

  const facs = faciais.filter((f) => fFac === "todos" || (fFac === "sem" ? !f.elevador_id : fFac === "com" ? !!f.elevador_id : f.instalacao === fFac || f.presenca === fFac));
  const elevPorId = new Map(elevadores.map((e) => [e.id, e]));

  return (
    <Tabs defaultValue="unidades" className="space-y-3">
      <TabsList><TabsTrigger value="unidades">Unidades ({lojas.length})</TabsTrigger><TabsTrigger value="elevadores">Elevadores ({elevadores.length})</TabsTrigger><TabsTrigger value="faciais">Faciais ({faciais.length})</TabsTrigger></TabsList>

      <TabsContent value="unidades" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><Input className="max-w-xs" placeholder="Buscar unidade..." value={buscaU} onChange={(e) => setBuscaU(e.target.value)} /><div className="flex-1" />{admin && <Button onClick={() => setModo("unidade")}><Plus className="h-4 w-4 mr-1" />Nova unidade</Button>}</div>
        <div className="space-y-2">{[...lojas].filter((l) => lojaNome(l.unidade_id).toLowerCase().includes(buscaU.toLowerCase())).sort((a, b) => lojaNome(a.unidade_id).localeCompare(lojaNome(b.unidade_id))).map((l) => { const es = elevadores.filter((e) => e.unidade_id === l.unidade_id), fu = faciais.filter((f) => f.unidade_id === l.unidade_id), livres = fu.filter((f) => !f.elevador_id), op = aberta.has(l.unidade_id); return <div key={l.unidade_id} className="rounded-lg border border-border">
          <button className="flex w-full items-center gap-2 p-3 text-left" onClick={() => setAberta((s) => { const n = new Set(s); n.has(l.unidade_id) ? n.delete(l.unidade_id) : n.add(l.unidade_id); return n; })}>{op ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}<span className="font-medium">{lojaNome(l.unidade_id)}</span><Badge variant="outline" className="ml-auto">{es.length} elevador(es)</Badge><Badge variant="outline">{fu.length} facial(is)</Badge></button>
          {op && <div className="space-y-2 border-t p-3 text-sm">
            {es.map((e) => <div key={e.id} className="rounded border p-2"><button className="font-medium underline-offset-2 hover:underline" onClick={() => onOpenElevador(e)}>{e.tipo} #{e.id}</button> <span className="text-xs text-muted-foreground">{[e.marca, e.numero_serie].filter(Boolean).join(" · ")}</span><div className="mt-1 flex flex-wrap gap-1 pl-4">{facsDe(e.id).map((f) => <Badge key={f.id} variant={f.instalacao === "INSTALADA" ? "default" : "secondary"}>{f.codigo} · {INST_LABEL[f.instalacao]}</Badge>)}{!facsDe(e.id).length && <span className="text-xs text-muted-foreground">Sem facial</span>}</div></div>)}
            {!es.length && <p className="text-xs text-muted-foreground">Nenhum elevador cadastrado.</p>}
            {livres.length > 0 && <div className="rounded border border-dashed p-2"><p className="text-xs font-semibold">Faciais sem elevador</p><div className="mt-1 flex flex-wrap gap-1">{livres.map((f) => <Badge key={f.id} variant="outline">{f.codigo}</Badge>)}</div></div>}
            {admin && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => { setUnidadeIni(l.unidade_id); setModo("elevador"); }}><Plus className="h-4 w-4 mr-1" />Elevadores</Button><Button size="sm" variant="outline" onClick={() => { setUnidadeIni(l.unidade_id); setModo("facial"); }}><Plus className="h-4 w-4 mr-1" />Faciais</Button></div>}
          </div>}
        </div>; })}</div>
      </TabsContent>

      <TabsContent value="elevadores" className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={fv} onValueChange={setFv}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="todos">Validação: todos</SelectItem><SelectItem value="NAO_VALIDADO">Não validado</SelectItem><SelectItem value="VALIDADO">Validado</SelectItem></SelectContent></Select>
          <Select value={ff} onValueChange={setFf}><SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="todos">Facial: todos</SelectItem><SelectItem value="com">Com facial</SelectItem><SelectItem value="sem">Sem facial (validado)</SelectItem>
            <SelectItem value="nao_encontrado">Não encontrado</SelectItem><SelectItem value="compra">Necessita compra</SelectItem></SelectContent></Select>
          <Select value={fi} onValueChange={setFi}><SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="todos">Instalação: todos</SelectItem>{Object.entries(INST_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>
          <div className="flex-1" />
          {admin && <Button onClick={() => { setUnidadeIni(undefined); setModo("elevador"); }}><Plus className="h-4 w-4 mr-1" />Novo elevador</Button>}
        </div>
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Elevador</TableHead><TableHead>Unidade</TableHead><TableHead>Status</TableHead><TableHead>Validação</TableHead><TableHead>Facial</TableHead><TableHead>Instalação</TableHead><TableHead>Situação</TableHead></TableRow></TableHeader>
            <TableBody>
              {elevs.map((e) => { const f = fac(e.id); const s = situacao(e, f); return (
                <TableRow key={e.id} className="cursor-pointer" onClick={() => onOpenElevador(e)}>
                  <TableCell className="font-medium">{e.tipo} <span className="text-xs text-muted-foreground">#{e.id}</span></TableCell>
                  <TableCell>{lojaNome(e.unidade_id)}</TableCell>
                  <TableCell>{STATUS_LABEL[e.status]}</TableCell>
                  <TableCell><Badge variant={e.validacao_status === "VALIDADO" ? "default" : "outline"}>{VALID_LABEL[e.validacao_status]}</Badge></TableCell>
                  <TableCell>{facsDe(e.id).map((x) => x.codigo).join(", ") || "—"}</TableCell>
                  <TableCell>{f ? INST_LABEL[f.instalacao] : "—"}</TableCell>
                  <TableCell><Badge variant={SIT_VARIANT[s]}>{SIT_LABEL[s]}</Badge></TableCell>
                </TableRow>); })}
              {!elevs.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum elevador.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="faciais" className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={fFac} onValueChange={setFFac}><SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="todos">Todos os faciais</SelectItem><SelectItem value="sem">Sem elevador</SelectItem><SelectItem value="com">Com elevador</SelectItem>
            <SelectItem value="PRESENTE">Presente na unidade</SelectItem><SelectItem value="NAO_ENCONTRADO">Não encontrado</SelectItem>
            <SelectItem value="AGUARDANDO">Aguardando instalação</SelectItem><SelectItem value="INSTALADA">Instalado</SelectItem></SelectContent></Select>
          <div className="flex-1" />
          {admin && <Button onClick={() => { setUnidadeIni(undefined); setModo("facial"); }}><Plus className="h-4 w-4 mr-1" />Nova facial</Button>}
        </div>
        <div className="rounded-lg border border-border overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Facial</TableHead><TableHead>Unidade</TableHead><TableHead>Elevador</TableHead><TableHead>Presença</TableHead><TableHead>Instalação</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {facs.map((f) => { const e = f.elevador_id ? elevPorId.get(f.elevador_id) : null; return (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.codigo}<p className="text-xs text-muted-foreground">{[f.marca, f.modelo, f.numero_serie].filter(Boolean).join(" · ")}</p></TableCell>
                  <TableCell>{lojaNome(f.unidade_id)}</TableCell>
                  <TableCell>{e ? <button className="underline" onClick={() => onOpenElevador(e)}>{e.tipo} #{e.id}</button> : <Badge variant="secondary">Sem elevador</Badge>}</TableCell>
                  <TableCell>{PRES_LABEL[f.presenca]}</TableCell>
                  <TableCell><Badge variant={f.instalacao === "INSTALADA" ? "default" : "outline"}>{INST_LABEL[f.instalacao]}</Badge></TableCell>
                  <TableCell>{admin && <Button size="icon" variant="ghost" onClick={() => { setEdit(f); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>}</TableCell>
                </TableRow>); })}
              {!facs.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhum facial cadastrado.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </TabsContent>
      <CadastroLoteDialog modo={modo} onClose={() => setModo(null)} lojas={lojas} elevadores={elevadores} onSaved={onChanged} unidadeInicial={unidadeIni} />
      <FacialDialog open={open} onOpenChange={setOpen} facial={edit} lojas={lojas} elevadores={elevadores} faciais={faciais} onSaved={onChanged} />
    </Tabs>
  );
}
