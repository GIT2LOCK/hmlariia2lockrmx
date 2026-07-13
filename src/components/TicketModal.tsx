import { useEffect, useMemo, useState } from "react";
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
import { Paperclip, X, Upload } from "lucide-react";
import { logDiff } from "@/lib/ticketHistory";
import {
  CLOSED_STATUSES,
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
interface UnidadeOpt extends Option { empresa_id: number }
interface ContatoOpt {
  id: number;
  nome: string;
  email: string | null;
  telefone: string | null;
  tipo: string;
  empresa_id: number | null;
  unidade_id: number | null;
  cobre_empresa_inteira: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticketId?: number | null;
  onSaved?: () => void;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export function TicketModal({ open, onOpenChange, ticketId, onSaved }: Props) {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [empresas, setEmpresas] = useState<Option[]>([]);
  const [unidadesAll, setUnidadesAll] = useState<UnidadeOpt[]>([]);
  const [operadoras, setOperadoras] = useState<Option[]>([]);
  const [filas, setFilas] = useState<Option[]>([]);
  const [categorias, setCategorias] = useState<Option[]>([]);
  const [tecnicos, setTecnicos] = useState<Option[]>([]);
  const [contatosAll, setContatosAll] = useState<ContatoOpt[]>([]);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<any[]>([]);

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
    solicitante_id: "" as string,
    solicitante_nome: "",
    solicitante_email: "",
    solicitante_telefone: "",
    solicitante_emails_extra: [] as string[],
    ativo: "",
    origem: "MANUAL" as string,
    tipo_chamado: "T" as string,
  });
  const [novoEmail, setNovoEmail] = useState("");

  const unidadesFiltered = useMemo(() => {
    if (!form.empresa_id) return [];
    const empId = Number(form.empresa_id);
    return unidadesAll.filter((u) => u.empresa_id === empId);
  }, [form.empresa_id, unidadesAll]);

  const contatosFiltered = useMemo(() => {
    if (!form.empresa_id) return [];
    const empId = Number(form.empresa_id);
    const unidId = form.unidade_id ? Number(form.unidade_id) : null;
    return contatosAll.filter((c) => {
      if (c.empresa_id !== empId) return false;
      // se cobre empresa inteira ou sem unidade, sempre aparece
      if (c.cobre_empresa_inteira || !c.unidade_id) return true;
      // se há unidade selecionada, mostrar somente os daquela unidade
      if (unidId) return c.unidade_id === unidId;
      // sem unidade selecionada: mostrar todos da empresa
      return true;
    });
  }, [form.empresa_id, form.unidade_id, contatosAll]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [e, u, o, f, c, us, ct] = await Promise.all([
        supabase.from("empresas").select("id,nome_fantasia").order("nome_fantasia"),
        supabase.from("unidades").select("id,nome_unidade,empresa_id").order("nome_unidade"),
        supabase.from("operadoras").select("id,nome").order("nome"),
        supabase.from("support_groups").select("id,nome").eq("ativo", true).order("nome"),
        supabase.from("ticket_categorias").select("id,nome,parent_id").is("parent_id", null).order("nome"),
        supabase
          .from("usuarios")
          .select("id,nome,permissao,access_scope,ativo")
          .eq("ativo", true)
          .in("permissao", ["SUPERADMIN", "ADMIN", "USER"])
          .in("access_scope", ["ARIIA_ONLY", "ARIIA_AND_GRAFANA"])
          .order("nome"),
        supabase.from("contatos").select("id,nome,email,telefone,tipo,empresa_id,unidade_id,cobre_empresa_inteira").order("nome"),
      ]);
      setEmpresas((e.data || []).map((r: any) => ({ id: r.id, label: r.nome_fantasia })));
      setUnidadesAll((u.data || []).map((r: any) => ({ id: r.id, label: r.nome_unidade, empresa_id: r.empresa_id })));
      setOperadoras((o.data || []).map((r: any) => ({ id: r.id, label: r.nome })));
      setFilas((f.data || []).map((r: any) => ({ id: r.id, label: r.nome })));
      setCategorias((c.data || []).map((r: any) => ({ id: r.id, label: r.nome })));
      setTecnicos((us.data || []).map((r: any) => ({ id: r.id, label: r.nome })));
      setContatosAll((ct.data || []) as ContatoOpt[]);

      if (ticketId) {
        const sessionToken = localStorage.getItem("auth_token") || "";
        const { data: res } = await supabase.functions.invoke("get-ticket-cliente", {
          body: { ticket_id: ticketId },
          headers: { Authorization: `Bearer ${sessionToken}` },
        });
        const data = res?.ticket || null;
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
            solicitante_id: "",
            solicitante_nome: data.solicitante_nome || "",
            solicitante_email: data.solicitante_email || "",
            solicitante_telefone: data.solicitante_telefone || "",
            solicitante_emails_extra: Array.isArray(data.solicitante_emails_extra) ? data.solicitante_emails_extra : [],
            ativo: data.ativo || "",
            origem: data.origem || "MANUAL",
            tipo_chamado: (data as any).tipo_chamado || "T",
          });
        }
        const { data: atts } = await supabase
          .from("ticket_attachments")
          .select("*")
          .eq("ticket_id", ticketId)
          .order("criado_em", { ascending: false });
        setExistingAttachments(atts || []);
      } else {
        setForm({
          titulo: "", descricao: "", prioridade: "MEDIO", status: "NOVO",
          empresa_id: "", unidade_id: "", operadora_id: "", fila_id: "",
          categoria_id: "", tecnico_id: "", solicitante_id: "",
          solicitante_nome: "", solicitante_email: "", solicitante_telefone: "",
          solicitante_emails_extra: [],
          ativo: "", origem: "MANUAL", tipo_chamado: "T",
        });
        setExistingAttachments([]);
      }
      setPendingFiles([]);
    })();
  }, [open, ticketId]);

  // ao trocar empresa, limpar unidade e solicitante se não pertencerem
  useEffect(() => {
    if (!form.empresa_id) {
      if (form.unidade_id || form.solicitante_id) {
        setForm((f) => ({ ...f, unidade_id: "", solicitante_id: "" }));
      }
      return;
    }
    const empId = Number(form.empresa_id);
    const unidValid = !form.unidade_id || unidadesAll.some((u) => u.id === Number(form.unidade_id) && u.empresa_id === empId);
    const contValid = !form.solicitante_id || contatosAll.some((c) => c.id === Number(form.solicitante_id) && c.empresa_id === empId);
    if (!unidValid || !contValid) {
      setForm((f) => ({ ...f, unidade_id: unidValid ? f.unidade_id : "", solicitante_id: contValid ? f.solicitante_id : "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.empresa_id]);

  const handlePickContato = (id: string) => {
    const c = contatosAll.find((x) => x.id === Number(id));
    if (!c) return;
    setForm((f) => ({
      ...f,
      solicitante_id: id,
      solicitante_nome: c.nome,
      solicitante_email: c.email || "",
      solicitante_telefone: c.telefone || "",
    }));
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    const valid: File[] = [];
    for (const f of incoming) {
      if (f.size > MAX_FILE_BYTES) {
        toast({ title: "Arquivo muito grande", description: `${f.name} excede 5MB`, variant: "destructive" });
        continue;
      }
      valid.push(f);
    }
    setPendingFiles((prev) => [...prev, ...valid]);
  };

  const uploadAttachments = async (tid: number) => {
    if (!pendingFiles.length) return;
    for (const file of pendingFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${tid}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("ticket-attachments").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) {
        toast({ title: "Erro ao enviar anexo", description: `${file.name}: ${upErr.message}`, variant: "destructive" });
        continue;
      }
      await supabase.from("ticket_attachments").insert({
        ticket_id: tid,
        autor_id: user?.id ? Number(user.id) : null,
        autor_nome: user?.nome || null,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
      });
    }
  };

  const handleSave = async () => {
    if (!form.titulo.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    if (!form.fila_id) {
      toast({ title: "Selecione a Fila / Equipe", description: "Todo chamado precisa de uma fila de destino.", variant: "destructive" });
      return;
    }
    if (!form.tecnico_id) {
      toast({ title: "Selecione o técnico responsável", description: "É obrigatório atribuir o chamado a um técnico ao abrir.", variant: "destructive" });
      return;
    }
    // valida emails extras
    const extras = (form.solicitante_emails_extra || []).map((e) => e.trim()).filter(Boolean);
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const em of extras) {
      if (!emailRe.test(em)) {
        toast({ title: "E-mail inválido", description: em, variant: "destructive" });
        return;
      }
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
      solicitante_email: form.solicitante_email || null,
      solicitante_telefone: form.solicitante_telefone || null,
      solicitante_emails_extra: extras,
      ativo: form.ativo || null,
      origem: form.origem,
      tipo_chamado: (form.tipo_chamado || "T").toUpperCase().slice(0, 1),
      sla_atendimento_minutos: SLA_ATENDIMENTO[form.prioridade],
      sla_solucao_minutos: SLA_SOLUCAO[form.prioridade],
    };

    let savedId = ticketId || null;
    let beforeRow: any = null;
    let errMsg: string | null = null;
    try {
      const ariiaToken = localStorage.getItem("auth_token");
      if (!ariiaToken) throw new Error("Sessão expirada. Faça login novamente.");

      const response = await fetch(`${SUPABASE_URL}/functions/v1/save-ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${ariiaToken}`,
        },
        body: JSON.stringify({ ticket_id: ticketId ?? null, payload }),
      });
      const res = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(res?.error || `save-ticket status=${response.status}`);
      if (res?.error) throw new Error(res.error);
      savedId = res?.ticket_id ?? savedId;
      beforeRow = res?.before ?? null;
    } catch (e: any) {
      errMsg = e?.message || String(e);
    }
    if (errMsg) {
      setLoading(false);
      const { translateTicketError } = await import("@/components/tickets/TicketAttachmentList");
      toast({ title: "Erro ao salvar", description: translateTicketError(errMsg), variant: "destructive" });
      return;
    }

    // Log per-field diff on edit
    if (ticketId && beforeRow) {
      const trackedFields: (keyof typeof payload)[] = [
        "titulo","descricao","prioridade","status","empresa_id","unidade_id",
        "operadora_id","fila_id","categoria_id","tecnico_id","ativo",
        "solicitante_nome","solicitante_email","solicitante_telefone",
      ];
      const diff: Record<string, { before: any; after: any }> = {};
      for (const f of trackedFields) {
        diff[f as string] = { before: (beforeRow as any)[f], after: (payload as any)[f] };
      }
      await logDiff(ticketId, user, diff);
    }

    if (savedId) await uploadAttachments(savedId);
    setLoading(false);
    toast({ title: ticketId ? "Chamado atualizado" : "Chamado criado" });
    onOpenChange(false);
    onSaved?.();
  };

  const removeExisting = async (att: any) => {
    await supabase.storage.from("ticket-attachments").remove([att.storage_path]);
    await supabase.from("ticket_attachments").delete().eq("id", att.id);
    setExistingAttachments((prev) => prev.filter((a) => a.id !== att.id));
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
            <Label>Tipo do chamado</Label>
            <Select
              value={form.tipo_chamado}
              onValueChange={(v) => setForm({ ...form, tipo_chamado: v })}
              disabled={!!ticketId}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="T">T — Chamado (padrão)</SelectItem>
                <SelectItem value="I">I — Incidente</SelectItem>
                <SelectItem value="R">R — Requisição</SelectItem>
                <SelectItem value="P">P — Problema</SelectItem>
                <SelectItem value="M">M — Mudança</SelectItem>
                <SelectItem value="A">A — Atendimento</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Define a letra do código (ex.: 2L<b>{form.tipo_chamado || "T"}</b>AAMM0001). Não pode ser alterado após criação.
            </p>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TicketStatus })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_ORDER
                  .filter((s) => ticketId || !CLOSED_STATUSES.includes(s))
                  .map((s) => (
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
            <Select
              value={form.unidade_id}
              onValueChange={(v) => setForm({ ...form, unidade_id: v })}
              disabled={!form.empresa_id}
            >
              <SelectTrigger>
                <SelectValue placeholder={form.empresa_id ? "Selecione" : "Selecione a empresa"} />
              </SelectTrigger>
              <SelectContent>
                {unidadesFiltered.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma unidade</div>
                ) : unidadesFiltered.map((o) => (
                  <SelectItem key={o.id} value={o.id.toString()}>{o.label}</SelectItem>
                ))}
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
            <Label>Solicitante (Pessoa/Responsável)</Label>
            <Select
              value={form.solicitante_id}
              onValueChange={handlePickContato}
              disabled={!form.empresa_id}
            >
              <SelectTrigger>
                <SelectValue placeholder={form.empresa_id ? "Selecione um contato" : "Selecione a empresa"} />
              </SelectTrigger>
              <SelectContent>
                {contatosFiltered.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum contato cadastrado</div>
                ) : contatosFiltered.map((c) => (
                  <SelectItem key={c.id} value={c.id.toString()}>
                    {c.nome} {c.tipo ? `· ${c.tipo}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.solicitante_nome && (
              <p className="text-xs text-muted-foreground mt-1">
                {form.solicitante_nome}
                {form.solicitante_email ? ` · ${form.solicitante_email}` : ""}
                {form.solicitante_telefone ? ` · ${form.solicitante_telefone}` : ""}
              </p>
            )}
          </div>

          <div className="md:col-span-2">
            <Label>E-mails adicionais para notificação</Label>
            <div className="flex gap-2">
              <Input
                placeholder="email@dominio.com"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const em = novoEmail.trim().toLowerCase();
                    if (!em) return;
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
                      toast({ title: "E-mail inválido", variant: "destructive" });
                      return;
                    }
                    if (form.solicitante_email?.toLowerCase() === em || form.solicitante_emails_extra.includes(em)) {
                      setNovoEmail("");
                      return;
                    }
                    setForm({ ...form, solicitante_emails_extra: [...form.solicitante_emails_extra, em] });
                    setNovoEmail("");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const em = novoEmail.trim().toLowerCase();
                  if (!em) return;
                  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
                    toast({ title: "E-mail inválido", variant: "destructive" });
                    return;
                  }
                  if (form.solicitante_email?.toLowerCase() === em || form.solicitante_emails_extra.includes(em)) {
                    setNovoEmail("");
                    return;
                  }
                  setForm({ ...form, solicitante_emails_extra: [...form.solicitante_emails_extra, em] });
                  setNovoEmail("");
                }}
              >
                Adicionar
              </Button>
            </div>
            {form.solicitante_emails_extra.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.solicitante_emails_extra.map((em) => (
                  <span key={em} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-1">
                    {em}
                    <button
                      type="button"
                      className="text-destructive hover:opacity-70"
                      onClick={() => setForm({ ...form, solicitante_emails_extra: form.solicitante_emails_extra.filter((x) => x !== em) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Estes e-mails receberão as mesmas notificações do solicitante principal (abertura, mensagens, status).
            </p>
          </div>

          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea rows={4} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>

          <div className="md:col-span-2 space-y-2">
            <Label>Anexos (máx 5MB por arquivo)</Label>
            <label className="flex items-center gap-2 border border-dashed rounded-md px-3 py-3 cursor-pointer hover:bg-muted/50 transition-colors text-sm text-muted-foreground">
              <Upload className="h-4 w-4" />
              <span>Clique para selecionar arquivos</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
              />
            </label>
            {existingAttachments.length > 0 && (
              <div className="space-y-1">
                {existingAttachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-sm bg-muted/40 rounded px-2 py-1">
                    <span className="flex items-center gap-2 truncate">
                      <Paperclip className="h-3.5 w-3.5" />
                      {a.file_name} <span className="text-xs text-muted-foreground">({Math.round(a.tamanho_bytes / 1024)} KB)</span>
                    </span>
                    <button type="button" onClick={() => removeExisting(a)} className="text-destructive hover:opacity-70">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {pendingFiles.length > 0 && (
              <div className="space-y-1">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-primary/5 rounded px-2 py-1">
                    <span className="flex items-center gap-2 truncate">
                      <Paperclip className="h-3.5 w-3.5" />
                      {f.name} <span className="text-xs text-muted-foreground">({Math.round(f.size / 1024)} KB)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
                      className="text-destructive hover:opacity-70"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
