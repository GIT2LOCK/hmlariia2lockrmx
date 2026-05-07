import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import {
  ArrowLeft, Pencil, Paperclip, Upload, X, Download, Send, Clock, History,
} from "lucide-react";
import {
  computeSlaSolucao,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  TicketPriority,
  TicketStatus,
  isClosed,
  SLA_ATENDIMENTO,
  SLA_SOLUCAO,
} from "@/lib/ticketSla";
import { TicketModal } from "@/components/TicketModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  CRITICO: "bg-destructive text-destructive-foreground",
  ALTO: "bg-orange-500 text-white",
  MEDIO: "bg-amber-500 text-white",
  BAIXO: "bg-secondary text-secondary-foreground",
};
const STATUS_COLORS: Record<TicketStatus, string> = {
  NOVO: "bg-blue-500 text-white",
  TRIAGEM: "bg-cyan-500 text-white",
  EM_ATENDIMENTO: "bg-primary text-primary-foreground",
  AGUARDANDO_CLIENTE: "bg-amber-400 text-black",
  AGUARDANDO_OPERADORA: "bg-amber-500 text-white",
  AGUARDANDO_TERCEIRO: "bg-amber-600 text-white",
  AGENDADO: "bg-purple-500 text-white",
  RESOLVIDO: "bg-emerald-600 text-white",
  FECHADO: "bg-muted text-muted-foreground",
  CANCELADO: "bg-zinc-500 text-white",
};
const SLA_COLORS = {
  ok: "bg-emerald-600 text-white",
  warn: "bg-amber-500 text-white",
  overdue: "bg-destructive text-destructive-foreground",
  done: "bg-muted text-muted-foreground",
  paused: "bg-zinc-500 text-white",
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const fmtDate = (d?: string | null) =>
  d ? format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—";

export default function ChamadoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const ticketId = Number(id);

  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const [novoComentario, setNovoComentario] = useState("");
  const [tipoComent, setTipoComent] = useState<"INTERNO" | "CLIENTE">("INTERNO");
  const [salvandoComent, setSalvandoComent] = useState(false);

  const load = async () => {
    setLoading(true);
    const [t, c, h, a] = await Promise.all([
      supabase.from("tickets").select(`*,
        empresas:empresa_id(nome_fantasia),
        unidades:unidade_id(nome_unidade),
        operadoras:operadora_id(nome),
        usuarios:tecnico_id(nome,email),
        ticket_filas:fila_id(nome),
        ticket_categorias:categoria_id(nome)`).eq("id", ticketId).maybeSingle(),
      supabase.from("ticket_comments").select("*").eq("ticket_id", ticketId).order("criado_em", { ascending: true }),
      supabase.from("ticket_history").select("*").eq("ticket_id", ticketId).order("criado_em", { ascending: false }),
      supabase.from("ticket_attachments").select("*").eq("ticket_id", ticketId).order("criado_em", { ascending: false }),
    ]);
    setTicket(t.data);
    setComments(c.data || []);
    setHistory(h.data || []);
    setAttachments(a.data || []);
    setLoading(false);
  };

  useEffect(() => { if (ticketId) load(); }, [ticketId]);

  const sla = useMemo(() => ticket ? computeSlaSolucao(ticket) : null, [ticket]);

  const changeStatus = async (status: TicketStatus) => {
    if (!ticket) return;
    const now = new Date().toISOString();
    const update: any = { status };
    const wasPaused = ["AGUARDANDO_CLIENTE","AGUARDANDO_OPERADORA","AGUARDANDO_TERCEIRO","AGENDADO","TRIAGEM"].includes(ticket.status);
    const willPause = ["AGUARDANDO_CLIENTE","AGUARDANDO_OPERADORA","AGUARDANDO_TERCEIRO","AGENDADO","TRIAGEM"].includes(status);
    if (!wasPaused && willPause) update.sla_pausa_inicio = now;
    else if (wasPaused && !willPause && ticket.sla_pausa_inicio) {
      const acc = (ticket.sla_pausa_total_segundos || 0) + Math.round((Date.now() - new Date(ticket.sla_pausa_inicio).getTime()) / 1000);
      update.sla_pausa_inicio = null;
      update.sla_pausa_total_segundos = acc;
    }
    if (status === "EM_ATENDIMENTO" && !ticket.data_primeiro_atendimento) update.data_primeiro_atendimento = now;
    if (status === "RESOLVIDO" && !ticket.data_solucao) update.data_solucao = now;
    if (status === "FECHADO") update.data_fechamento = now;

    const { error } = await supabase.from("tickets").update(update).eq("id", ticketId);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    await supabase.from("ticket_history").insert({
      ticket_id: ticketId, campo: "status",
      valor_anterior: ticket.status, valor_novo: status,
      autor_id: user?.id ? Number(user.id) : null,
      autor_nome: user?.nome || null,
    });
    toast({ title: "Status atualizado" });
    load();
  };

  const adicionarComentario = async () => {
    if (!novoComentario.trim()) return;
    setSalvandoComent(true);
    const { data: inserted, error } = await supabase.from("ticket_comments").insert({
      ticket_id: ticketId,
      conteudo: novoComentario.trim(),
      tipo: tipoComent,
      autor_id: user?.id ? Number(user.id) : null,
      autor_nome: user?.nome || null,
    }).select("id").maybeSingle();
    setSalvandoComent(false);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }

    // Notificar cliente por e-mail (via N8N) quando comentário público
    if (tipoComent === "CLIENTE") {
      if (!ticket?.solicitante_email) {
        toast({ title: "Comentário salvo", description: "Sem e-mail do solicitante — webhook não disparado." });
      } else {
        try {
          const { data: r, error: fnErr } = await supabase.functions.invoke("send-email-notification", {
            body: { ticket_id: ticketId, comment_id: inserted?.id },
          });
          if (fnErr) throw fnErr;
          console.log("[notify] resposta", r);
          toast({ title: "Webhook N8N enviado", description: `${ticket.solicitante_email}` });
        } catch (e: any) {
          console.error("[notify] erro", e);
          toast({ title: "Falha ao enviar webhook", description: e?.message || String(e), variant: "destructive" });
        }
      }
    }
    setNovoComentario("");
    load();
  };

  const testarWebhookN8N = async () => {
    try {
      const { data: r, error } = await supabase.functions.invoke("send-email-notification", {
        body: { ticket_id: ticketId },
      });
      if (error) throw error;
      console.log("[test webhook]", r);
      toast({ title: "Webhook testado", description: JSON.stringify(r) });
    } catch (e: any) {
      console.error(e);
      toast({ title: "Falha", description: e?.message || String(e), variant: "destructive" });
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        toast({ title: "Arquivo muito grande", description: `${file.name} excede 5MB`, variant: "destructive" });
        continue;
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${ticketId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("ticket-attachments").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) { toast({ title: "Erro upload", description: upErr.message, variant: "destructive" }); continue; }
      await supabase.from("ticket_attachments").insert({
        ticket_id: ticketId,
        autor_id: user?.id ? Number(user.id) : null,
        autor_nome: user?.nome || null,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
      });
    }
    load();
  };

  const downloadAttachment = async (att: any) => {
    const { data, error } = await supabase.storage.from("ticket-attachments")
      .createSignedUrl(att.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast({ title: "Erro ao gerar link", description: error?.message, variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const removeAttachment = async (att: any) => {
    await supabase.storage.from("ticket-attachments").remove([att.storage_path]);
    await supabase.from("ticket_attachments").delete().eq("id", att.id);
    load();
  };

  if (loading || !ticket) {
    return <div className="p-8 text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/chamados")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{ticket.codigo}</span>
              <Badge className={PRIORITY_COLORS[ticket.prioridade as TicketPriority]}>
                {PRIORITY_LABELS[ticket.prioridade as TicketPriority]}
              </Badge>
              {sla && <Badge className={SLA_COLORS[sla.level]}>{sla.label}</Badge>}
            </div>
            <h1 className="text-xl font-bold mt-1">{ticket.titulo}</h1>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={ticket.status} onValueChange={(v) => changeStatus(v as TicketStatus)}>
            <SelectTrigger className="w-56">
              <Badge className={STATUS_COLORS[ticket.status as TicketStatus]}>
                {STATUS_LABELS[ticket.status as TicketStatus]}
              </Badge>
            </SelectTrigger>
            <SelectContent>
              {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="resumo" className="w-full">
        <TabsList>
          <TabsTrigger value="resumo">Conversa ({comments.length + 1})</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
          <TabsTrigger value="historico">Histórico ({history.length})</TabsTrigger>
          <TabsTrigger value="anexos">Anexos ({attachments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Timeline GLPI-style */}
            <div className="lg:col-span-2 space-y-5">
              {/* Mensagem inicial (descrição) */}
              <ConversationBubble
                side="left"
                authorName={ticket.solicitante_nome || ticket.usuarios?.nome || "Solicitante"}
                title={ticket.titulo}
                createdAt={ticket.data_abertura}
                createdLabel="Criado em"
                meta={ticket.solicitante_email}
                tone="primary"
              >
                {ticket.descricao || <span className="text-muted-foreground">Sem descrição</span>}
              </ConversationBubble>

              {/* Conversa */}
              {comments.map((c) => {
                const isInterno = c.tipo === "INTERNO";
                return (
                  <ConversationBubble
                    key={c.id}
                    side={isInterno ? "right" : "right"}
                    authorName={c.autor_nome || "Sistema"}
                    createdAt={c.criado_em}
                    createdLabel="Respondido em"
                    badge={isInterno ? "Nota interna" : "Resposta"}
                    tone={isInterno ? "internal" : "default"}
                  >
                    {c.conteudo}
                  </ConversationBubble>
                );
              })}

              {/* Compositor */}
              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex gap-2 items-center flex-wrap">
                    <Select value={tipoComent} onValueChange={(v) => setTipoComent(v as any)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CLIENTE">Resposta (cliente)</SelectItem>
                        <SelectItem value="INTERNO">Nota interna</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      {tipoComent === "CLIENTE"
                        ? "Visível ao cliente · dispara e-mail"
                        : "Visível apenas à equipe"}
                    </span>
                  </div>
                  <Textarea
                    rows={4}
                    placeholder="Escreva uma resposta ou nota..."
                    value={novoComentario}
                    onChange={(e) => setNovoComentario(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button onClick={adicionarComentario} disabled={salvandoComent || !novoComentario.trim()}>
                      <Send className="h-4 w-4 mr-1" /> Enviar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Painel lateral de detalhes */}
            <div className="space-y-4">
              <DetailGroup title="Solicitante">
                <DetailRow label="Nome" value={ticket.solicitante_nome} />
                <DetailRow label="Email" value={ticket.solicitante_email} />
                <DetailRow label="Telefone" value={ticket.solicitante_telefone} />
                <DetailRow label="Origem" value={ticket.origem} />
              </DetailGroup>

              <DetailGroup title="Localização">
                <DetailRow label="Cliente" value={ticket.empresas?.nome_fantasia} />
                <DetailRow label="Unidade" value={ticket.unidades?.nome_unidade} />
                <DetailRow label="Operadora" value={ticket.operadoras?.nome} />
                <DetailRow label="Ativo" value={ticket.ativo} />
              </DetailGroup>

              <DetailGroup title="Atribuição">
                <DetailRow label="Fila" value={ticket.ticket_filas?.nome} />
                <DetailRow label="Categoria" value={ticket.ticket_categorias?.nome} />
                <DetailRow label="Técnico" value={ticket.usuarios?.nome} />
              </DetailGroup>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sla" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={testarWebhookN8N}>
              <Send className="h-4 w-4 mr-1" /> Testar webhook N8N
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> SLA Solução</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {sla && <Badge className={SLA_COLORS[sla.level]}>{sla.label}</Badge>}
                <DetailRow label="Meta" value={`${SLA_SOLUCAO[ticket.prioridade as TicketPriority]} min`} />
                <DetailRow label="Pausa acumulada" value={`${Math.round((ticket.sla_pausa_total_segundos || 0) / 60)} min`} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Marcos</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <DetailRow label="Abertura" value={fmtDate(ticket.data_abertura)} />
                <DetailRow label="1º Atendimento" value={fmtDate(ticket.data_primeiro_atendimento)} />
                <DetailRow label="Solução" value={fmtDate(ticket.data_solucao)} />
                <DetailRow label="Fechamento" value={fmtDate(ticket.data_fechamento)} />
                <DetailRow label="SLA Atendimento" value={`${SLA_ATENDIMENTO[ticket.prioridade as TicketPriority]} min`} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="sla" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={testarWebhookN8N}>
              <Send className="h-4 w-4 mr-1" /> Testar webhook N8N
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> SLA Solução</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {sla && <Badge className={SLA_COLORS[sla.level]}>{sla.label}</Badge>}
                <DetailRow label="Meta" value={`${SLA_SOLUCAO[ticket.prioridade as TicketPriority]} min`} />
                <DetailRow label="Pausa acumulada" value={`${Math.round((ticket.sla_pausa_total_segundos || 0) / 60)} min`} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Marcos</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <DetailRow label="Abertura" value={fmtDate(ticket.data_abertura)} />
                <DetailRow label="1º Atendimento" value={fmtDate(ticket.data_primeiro_atendimento)} />
                <DetailRow label="Solução" value={fmtDate(ticket.data_solucao)} />
                <DetailRow label="Fechamento" value={fmtDate(ticket.data_fechamento)} />
                <DetailRow label="SLA Atendimento" value={`${SLA_ATENDIMENTO[ticket.prioridade as TicketPriority]} min`} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="historico" className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Sem histórico</p>
          )}
          {history.map((h) => (
            <Card key={h.id}>
              <CardContent className="pt-4 flex items-center gap-3 text-sm">
                <History className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <span className="font-medium">{h.campo}</span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-muted-foreground line-through">{h.valor_anterior || "—"}</span>
                  <span className="mx-2">→</span>
                  <span className="font-medium">{h.valor_novo || "—"}</span>
                </div>
                <span className="text-xs text-muted-foreground">{h.autor_nome || "Sistema"} · {fmtDate(h.criado_em)}</span>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="anexos" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <label className="flex items-center gap-2 border border-dashed rounded-md px-3 py-4 cursor-pointer hover:bg-muted/50 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                <span>Clique para enviar arquivos (máx 5MB cada)</span>
                <input type="file" multiple className="hidden" onChange={(e) => { handleUpload(e.target.files); e.target.value = ""; }} />
              </label>
            </CardContent>
          </Card>
          <div className="space-y-2">
            {attachments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sem anexos</p>
            )}
            {attachments.map((a) => (
              <Card key={a.id}>
                <CardContent className="pt-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Paperclip className="h-4 w-4" />
                    <span className="font-medium">{a.file_name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({Math.round(a.tamanho_bytes / 1024)} KB) · {a.autor_nome || "—"} · {fmtDate(a.criado_em)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => downloadAttachment(a)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeAttachment(a)}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <TicketModal open={editOpen} onOpenChange={setEditOpen} ticketId={ticketId} onSaved={load} />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-2 py-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-right text-sm truncate max-w-[60%]">{value || "—"}</span>
    </div>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="bg-muted/50 px-4 py-2 border-b">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      </div>
      <CardContent className="p-4 divide-y divide-border/50">{children}</CardContent>
    </Card>
  );
}

function getInitials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function ConversationBubble({
  side,
  authorName,
  title,
  createdAt,
  createdLabel,
  meta,
  badge,
  tone = "default",
  children,
}: {
  side: "left" | "right";
  authorName: string;
  title?: string;
  createdAt?: string | null;
  createdLabel?: string;
  meta?: string | null;
  badge?: string;
  tone?: "default" | "primary" | "internal";
  children: React.ReactNode;
}) {
  const isLeft = side === "left";
  const toneClasses =
    tone === "primary"
      ? "bg-primary/5 border-primary/30"
      : tone === "internal"
      ? "bg-amber-500/5 border-amber-500/40"
      : "bg-card border-border";
  const avatarClasses =
    tone === "primary"
      ? "bg-primary text-primary-foreground"
      : tone === "internal"
      ? "bg-amber-500 text-white"
      : "bg-secondary text-secondary-foreground";

  return (
    <div className={`flex gap-3 ${isLeft ? "flex-row" : "flex-row-reverse"}`}>
      <div
        className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center font-semibold text-sm shadow-sm ${avatarClasses}`}
      >
        {getInitials(authorName)}
      </div>
      <div className={`flex-1 max-w-[88%] ${isLeft ? "" : "flex flex-col items-end"}`}>
        <div className={`relative rounded-lg border ${toneClasses} shadow-sm w-full`}>
          <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-border/60 bg-muted/30 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{createdLabel || "Criado em"}:</span>
              <b className="text-foreground">{fmtDate(createdAt)}</b>
            </span>
            <span className="inline-flex items-center gap-1">
              <span>·</span>
              <b className="text-foreground">{authorName}</b>
            </span>
            {meta && (
              <span className="inline-flex items-center gap-1">
                <span>·</span>
                <span>{meta}</span>
              </span>
            )}
            {badge && (
              <Badge variant="outline" className="ml-auto text-[10px] py-0 px-1.5">
                {badge}
              </Badge>
            )}
          </div>
          <div className="px-4 py-3 space-y-2">
            {title && <h4 className="font-semibold text-base text-foreground">{title}</h4>}
            <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
