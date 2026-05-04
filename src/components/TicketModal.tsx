import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  SLA_ATENDIMENTO,
  SLA_SOLUCAO,
  STATUS_LABELS,
  STATUS_ORDER,
  TicketPriority,
  TicketStatus,
} from "@/lib/ticketSla";

interface Option { id: number; label: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticketId?: number | null;
  onSaved?: () => void;
}

export function TicketModal({ open, onOpenChange, ticketId, onSaved }: Props) {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [empresas, setEmpresas] = useState<Option[]>([]);
  const [unidades, setUnidades] = useState<Option[]>([]);
  const [operadoras, setOperadoras] = useState<Option[]>([]);
  const [filas, setFilas] = useState<Option[]>([]);
  const [categorias, setCategorias] = useState<Option[]>([]);
  const [tecnicos, setTecnicos] = useState<Option[]>([]);

  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    prioridade: "MEDIO" as TicketPriority,
    status: "NOVO" as TicketStatus,
    empresa_id: "" as string,
    unidade_id: "" as string,
    operadora_id: "" as string,
    fila_id: "" as string,
    categoria_id: "" as string,
    tecnico_id: "" as string,
    solicitante_nome: "",
    ativo: "",
    origem: "MANUAL" as string,
  });

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [e, u, o, f, c, us] = await Promise.all([
        supabase.from("empresas").select("id,nome_fantasia").order("nome_fantasia"),
        supabase.from("unidades").select("id,nome_unidade").order("nome_unidade"),
        supabase.from("operadoras").select("id,nome").order("nome"),
        supabase.from("ticket_filas").select("id,nome").eq("ativo", true).order("nome"),
        supabase.from("ticket_categorias").select("id,nome,parent_id").is("parent_id", null).order("nome"),
        supabase.from("usuarios").select("id,nome").eq("ativo", true).order("nome"),
      ]);
      setEmpresas((e.data || []).map((r: any) => ({ id: r.id, label: r.nome_fantasia })));
      setUnidades((u.data || []).map((r: any) => ({ id: r.id, label: r.nome_unidade })));
      setOperadoras((o.data || []).map((r: any) => ({ id: r.id, label: r.nome })));
      setFilas((f.data || []).map((r: any) => ({ id: r.id, label: r.nome })));
      setCategorias((c.data || []).map((r: any) => ({ id: r.id, label: r.nome })));
      setTecnicos((us.data || []).map((r: any) => ({ id: r.id, label: r.nome })));

      if (ticketId) {
        const { data } = await supabase.from("tickets").select("*").eq("id", ticketId).maybeSingle();
        if (data) {
          setForm({
            titulo: data.titulo || "",
            descricao: data.descricao || "",
            prioridade: data.prioridade,
            status: data.status,
            empresa_id: data.empresa_id?.toString() || "",
            unidade_id: data.unidade_id?.toString() || "",
            operadora_id: data.operadora_id?.toString() || "",
            fila_id: data.fila_id?.toString() || "",
            categoria_id: data.categoria_id?.toString() || "",
            tecnico_id: data.tecnico_id?.toString() || "",
            solicitante_nome: data.solicitante_nome || "",
            ativo: data.ativo || "",
            origem: data.origem || "MANUAL",
          });
        }
      } else {
        setForm({
          titulo: "", descricao: "", prioridade: "MEDIO", status: "NOVO",
          empresa_id: "", unidade_id: "", operadora_id: "", fila_id: "",
          categoria_id: "", tecnico_id: "", solicitante_nome: "", ativo: "", origem: "MANUAL",
        });
      }
    })();
  }, [open, ticketId]);

  const handleSave = async () => {
    if (!form.titulo.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    setLoading(true);
    const payload: any = {
      titulo: form.titulo.trim(),
      descricao: form.descricao || null,
      prioridade: form.prioridade,
      status: form.status,
      empresa_id: form.empresa_id ? Number(form.empresa_id) : null,
      unidade_id: form.unidade_id ? Number(form.unidade_id) : null,
      operadora_id: form.operadora_id ? Number(form.operadora_id) : null,
      fila_id: form.fila_id ? Number(form.fila_id) : null,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      tecnico_id: form.tecnico_id ? Number(form.tecnico_id) : null,
      solicitante_nome: form.solicitante_nome || null,
      ativo: form.ativo || null,
      origem: form.origem,
      sla_atendimento_minutos: SLA_ATENDIMENTO[form.prioridade],
      sla_solucao_minutos: SLA_SOLUCAO[form.prioridade],
    };

    let error;
    if (ticketId) {
      ({ error } = await supabase.from("tickets").update(payload).eq("id", ticketId));
    } else {
      payload.criado_por = user?.id ? Number(user.id) : null;
      ({ error } = await supabase.from("tickets").insert(payload));
    }
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: ticketId ? "Chamado atualizado" : "Chamado criado" });
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{ticketId ? "Editar Chamado" : "Novo Chamado"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Título *</Label>
            <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </div>

          <div>
            <Label>Prioridade</Label>
            <Select value={form.prioridade} onValueChange={(v) => setForm({ ...form, prioridade: v as TicketPriority })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>{PRIORITY_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TicketStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Cliente (Empresa)</Label>
            <Select value={form.empresa_id} onValueChange={(v) => setForm({ ...form, empresa_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {empresas.map((o) => <SelectItem key={o.id} value={o.id.toString()}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Unidade</Label>
            <Select value={form.unidade_id} onValueChange={(v) => setForm({ ...form, unidade_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {unidades.map((o) => <SelectItem key={o.id} value={o.id.toString()}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Operadora (opcional)</Label>
            <Select value={form.operadora_id} onValueChange={(v) => setForm({ ...form, operadora_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {operadoras.map((o) => <SelectItem key={o.id} value={o.id.toString()}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Ativo (opcional)</Label>
            <Input value={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.value })} />
          </div>

          <div>
            <Label>Fila / Equipe</Label>
            <Select value={form.fila_id} onValueChange={(v) => setForm({ ...form, fila_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {filas.map((o) => <SelectItem key={o.id} value={o.id.toString()}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {categorias.map((o) => <SelectItem key={o.id} value={o.id.toString()}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Técnico responsável</Label>
            <Select value={form.tecnico_id} onValueChange={(v) => setForm({ ...form, tecnico_id: v })}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {tecnicos.map((o) => <SelectItem key={o.id} value={o.id.toString()}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Solicitante</Label>
            <Input value={form.solicitante_nome} onChange={(e) => setForm({ ...form, solicitante_nome: e.target.value })} />
          </div>

          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea rows={4} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>

          <div className="md:col-span-2 text-xs text-muted-foreground">
            SLA Atendimento: <b>{SLA_ATENDIMENTO[form.prioridade]} min</b> · SLA Solução: <b>{SLA_SOLUCAO[form.prioridade]} min</b>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
