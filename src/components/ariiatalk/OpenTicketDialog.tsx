import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Opt = { id: number; nome: string };
type EmpresaOpt = { id: number; nome_fantasia: string };
type UnidadeOpt = { id: number; nome_unidade: string; empresa_id: number | null };

export type TicketPrefill = {
  nome: string;
  email: string;
  telefone: string;
  empresa_id: number | null;
  unidade_id: number | null;
  conversa: string;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefill: TicketPrefill | null;
  empresas: EmpresaOpt[];
  unidades: UnidadeOpt[];
  staff: Opt[];
  onCreated?: (codigo: string | null) => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const sel = "mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm";

export default function OpenTicketDialog({ open, onOpenChange, prefill, empresas, unidades, staff, onCreated }: Props) {
  const [form, setForm] = useState({ titulo: "", resumo: "", prioridade: "MEDIO", empresa_id: "", unidade_id: "", categoria_id: "", fila_id: "", tecnico_id: "", nome: "", email: "", telefone: "" });
  const [categorias, setCategorias] = useState<Opt[]>([]);
  const [filas, setFilas] = useState<Opt[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !prefill) return;
    setError(null);
    setForm({
      titulo: "", resumo: "", prioridade: "MEDIO",
      empresa_id: prefill.empresa_id ? String(prefill.empresa_id) : "",
      unidade_id: prefill.unidade_id ? String(prefill.unidade_id) : "",
      categoria_id: "", fila_id: "", tecnico_id: "",
      nome: prefill.nome, email: prefill.email, telefone: prefill.telefone,
    });
    void Promise.all([
      supabase.from("ticket_categorias").select("id,nome").is("parent_id", null).order("nome"),
      supabase.from("ticket_filas").select("id,nome").eq("ativo", true).order("nome"),
    ]).then(([c, f]) => { setCategorias((c.data as Opt[]) || []); setFilas((f.data as Opt[]) || []); });
    // Only reset when the dialog opens; prefill is recreated on every background refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, !!prefill]);

  const set = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const emailOk = !form.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const submit = async () => {
    if (!form.titulo.trim() || !form.resumo.trim()) { setError("Preencha o título e o resumo do problema."); return; }
    if (!emailOk) { setError("E-mail do solicitante inválido."); return; }
    setSaving(true); setError(null);
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");
      const descricao = `${form.resumo.trim()}\n\n— Aberto a partir do AriiaTalk (conversa: ${prefill?.conversa || "-"})`;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/save-ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ticket_id: null, payload: {
          titulo: form.titulo.trim(), descricao, prioridade: form.prioridade, status: "NOVO",
          empresa_id: form.empresa_id ? Number(form.empresa_id) : null,
          unidade_id: form.unidade_id ? Number(form.unidade_id) : null,
          categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
          fila_id: form.fila_id ? Number(form.fila_id) : null,
          tecnico_id: form.tecnico_id ? Number(form.tecnico_id) : null,
          solicitante_nome: form.nome.trim() || null,
          solicitante_email: form.email.trim().toLowerCase() || null,
          solicitante_telefone: form.telefone.replace(/\D/g, "") || null,
          origem: "CHAT", tipo_chamado: "T",
        } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error || `Erro ${res.status}`);
      toast.success(`Chamado ${data.codigo || ""} aberto`, { description: form.email.trim() ? "O solicitante receberá as atualizações por e-mail." : "Sem e-mail: o solicitante não receberá atualizações." });
      onCreated?.(data.codigo ?? null);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Abrir chamado a partir da conversa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Título *</Label><Input value={form.titulo} maxLength={200} onChange={(e) => set("titulo", e.target.value)} placeholder="Ex.: Internet inoperante na unidade" /></div>
          <div><Label>Resumo do problema relatado *</Label><Textarea rows={5} value={form.resumo} maxLength={10000} onChange={(e) => set("resumo", e.target.value)} placeholder="Descreva o que o usuário relatou..." /></div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><Label>Prioridade</Label>
              <select className={sel} value={form.prioridade} onChange={(e) => set("prioridade", e.target.value)}>
                <option value="BAIXO">Baixa</option><option value="MEDIO">Média</option><option value="ALTO">Alta</option><option value="CRITICO">Crítica</option>
              </select></div>
            <div><Label>Categoria</Label>
              <select className={sel} value={form.categoria_id} onChange={(e) => set("categoria_id", e.target.value)}>
                <option value="">—</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select></div>
            <div><Label>Empresa</Label>
              <select className={sel} value={form.empresa_id} onChange={(e) => setForm((p) => ({ ...p, empresa_id: e.target.value, unidade_id: "" }))}>
                <option value="">—</option>{empresas.map((c) => <option key={c.id} value={c.id}>{c.nome_fantasia}</option>)}
              </select></div>
            <div><Label>Unidade</Label>
              <select className={sel} value={form.unidade_id} onChange={(e) => {
                const u = unidades.find((x) => String(x.id) === e.target.value);
                setForm((p) => ({ ...p, unidade_id: e.target.value, empresa_id: u?.empresa_id ? String(u.empresa_id) : p.empresa_id }));
              }}>
                <option value="">—</option>{unidades.filter((u) => !form.empresa_id || String(u.empresa_id) === form.empresa_id).map((u) => <option key={u.id} value={u.id}>{u.nome_unidade}</option>)}
              </select></div>
            <div><Label>Fila</Label>
              <select className={sel} value={form.fila_id} onChange={(e) => set("fila_id", e.target.value)}>
                <option value="">—</option>{filas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select></div>
            <div><Label>Técnico responsável</Label>
              <select className={sel} value={form.tecnico_id} onChange={(e) => set("tecnico_id", e.target.value)}>
                <option value="">—</option>{staff.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select></div>
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Solicitante</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><Label>Nome</Label><Input value={form.nome} onChange={(e) => set("nome", e.target.value)} /></div>
              <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="Recebe as atualizações" /></div>
              <div><Label>Telefone</Label><Input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} /></div>
            </div>
            {!form.email.trim() && <p className="mt-2 text-xs text-muted-foreground">Sem e-mail, o solicitante não receberá atualizações do chamado.</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => void submit()} disabled={saving}>{saving ? "Abrindo..." : "Abrir chamado"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
