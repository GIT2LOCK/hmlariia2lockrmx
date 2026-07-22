import { useEffect, useMemo, useRef, useState } from "react";
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
  ArrowLeft, Pencil, Paperclip, Upload, X, Send, Clock, History,
  CheckCircle2, RefreshCcw, Loader2, Trash2,
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
import { TicketHeaderInfo } from "@/components/tickets/TicketHeaderInfo";
import { TicketTimeline } from "@/components/tickets/TicketTimeline";
import { EncerramentoModal } from "@/components/tickets/EncerramentoModal";
import { ReaberturaModal } from "@/components/tickets/ReaberturaModal";
import { FluxoOperacionalCard } from "@/components/tickets/FluxoOperacionalCard";
import { SlaCard } from "@/components/tickets/SlaCard";
import { logTicketEvent, fieldLabel, formatValue } from "@/lib/ticketHistory";
import { TicketModal } from "@/components/TicketModal";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import DOMPurify from "dompurify";
import { isCliente as isClienteRole, clientStatusLabel } from "@/lib/permissions";
import { TicketAttachmentList, translateTicketError, type AttachmentRow } from "@/components/tickets/TicketAttachmentList";
import { buildStatusUpdate, updateTicketViaEdge } from "@/lib/ticketActions";

function isHtmlContent(s?: string | null): boolean {
  if (!s) return false;
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

function RichContent({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">Sem conteúdo</span>;
  if (isHtmlContent(value)) {
    // Substitui imagens cid: não resolvidas por placeholder amigável
    const prepared = value.replace(
      /<img\b[^>]*\bsrc=["']cid:[^"']+["'][^>]*>/gi,
      '<span class="inline-block px-2 py-1 my-1 text-xs rounded border border-dashed border-muted-foreground/40 bg-muted/30 text-muted-foreground">[imagem inline da assinatura — não disponível]</span>'
    );
    const clean = DOMPurify.sanitize(prepared, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["target", "style", "src", "srcset", "alt", "width", "height", "align", "border", "cellpadding", "cellspacing", "bgcolor", "background", "class"],
      ADD_TAGS: ["img", "style"],
      ALLOW_DATA_ATTR: true,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
    });
    return (
      <div
        className="email-html prose prose-sm max-w-none dark:prose-invert break-words [overflow-wrap:anywhere] [&_img]:inline-block [&_img]:max-w-full [&_img]:h-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    );
  }
  return <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{value}</div>;
}

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
  const isCliente = isClienteRole(user.role);
  const isAdmin = user.role === "SUPERADMIN" || user.role === "ADMIN";
  const ticketId = Number(id);

  const [ticket, setTicket] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [encerrarOpen, setEncerrarOpen] = useState(false);
  const [reabrirOpen, setReabrirOpen] = useState(false);

  const [novoComentario, setNovoComentario] = useState("");
  const [tipoComent, setTipoComent] = useState<"INTERNO" | "CLIENTE">(isCliente ? "CLIENTE" : "INTERNO");
  const [salvandoComent, setSalvandoComent] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const sendingRef = useRef(false);

  // Alterações pendentes (não persistidas até clicar em "Salvar alterações").
  // Evita que trocar status apague o texto digitado no compositor.
  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);
  const [savingChanges, setSavingChanges] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const sessionToken = localStorage.getItem("auth_token") || "";
      const { data, error } = await supabase.functions.invoke("get-ticket-cliente", {
        body: { ticket_id: ticketId },
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (error || !data?.ticket) {
        if (error) toast({ title: "Não foi possível carregar o chamado", description: error.message, variant: "destructive" });
        setTicket(null);
      } else {
        setTicket(data.ticket);
        setComments(data.comments || []);
        setHistory(data.history || []);
        setAttachments(data.attachments || []);
      }
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => { if (ticketId) load(); }, [ticketId]);

  const sla = useMemo(() => ticket ? computeSlaSolucao(ticket) : null, [ticket]);

  const effectiveStatus = (pendingStatus ?? ticket?.status) as TicketStatus | undefined;
  const hasPendingChanges = !!pendingStatus && pendingStatus !== ticket?.status;

  const stageStatus = (status: TicketStatus) => {
    if (!ticket) return;
    // Fluxos que exigem modal continuam abrindo o modal (sem staging).
    if ((status === "RESOLVIDO" || status === "FECHADO") && !isClosed(ticket.status)) {
      setEncerrarOpen(true);
      return;
    }
    if (isClosed(ticket.status) && !isClosed(status)) {
      setReabrirOpen(true);
      return;
    }
    setPendingStatus(status === ticket.status ? null : status);
  };

  const discardChanges = () => {
    setPendingStatus(null);
  };

  const saveChanges = async () => {
    if (!ticket || !hasPendingChanges) return;
    setSavingChanges(true);
    try {
      const updates = buildStatusUpdate(ticket, pendingStatus!);
      const history = [{ campo: "status", valorAnterior: ticket.status, valorNovo: pendingStatus! }];

      // Se o usuário digitou algo no compositor, envia junto como comentário
      // e faz upload de eventuais anexos ligados a esse comentário.
      const shouldAttachComment = !!novoComentario.trim() || commentFiles.length > 0;
      const commentPayload = shouldAttachComment
        ? {
            conteudo: novoComentario.trim() || "(somente anexos)",
            tipo: (isCliente ? "CLIENTE" : tipoComent) as "INTERNO" | "CLIENTE",
          }
        : null;

      const res = await updateTicketViaEdge({
        ticketId,
        updates,
        history,
        comment: commentPayload,
      });

      // Anexos: como updateTicketViaEdge não retorna comment_id, fazemos upload
      // atrelado ao ticket (sem comment_id) quando houver arquivos junto.
      if (commentFiles.length > 0) {
        for (const file of commentFiles) {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${ticketId}/${Date.now()}_${safeName}`;
          const { error: upErr } = await supabase.storage.from("ticket-attachments").upload(path, file, {
            contentType: file.type || "application/octet-stream",
          });
          if (upErr) continue;
          await supabase.from("ticket_attachments").insert({
            ticket_id: ticketId,
            autor_id: user?.id ? Number(user.id) : null,
            autor_nome: user?.nome || null,
            storage_path: path,
            file_name: file.name,
            mime_type: file.type || null,
            tamanho_bytes: file.size,
          } as any);
        }
      }

      setPendingStatus(null);
      setNovoComentario("");
      setCommentFiles([]);
      toast({ title: "Alterações salvas" });
      await load();
    } catch (e: any) {
      toast({ title: "Erro ao salvar", description: translateTicketError(e?.message || String(e)), variant: "destructive" });
    } finally {
      setSavingChanges(false);
    }
  };

  const handleCommentFiles = (files: FileList | null) => {
    if (!files) return;
    const valid: File[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX_FILE_BYTES) {
        toast({ title: "Arquivo muito grande", description: `${f.name} excede 5MB`, variant: "destructive" });
        continue;
      }
      valid.push(f);
    }
    setCommentFiles((p) => [...p, ...valid]);
  };

  const uploadCommentAttachments = async (commentId: number) => {
    for (const file of commentFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${ticketId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("ticket-attachments").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) {
        toast({ title: "Erro ao enviar anexo", description: `${file.name}: ${upErr.message}`, variant: "destructive" });
        continue;
      }
      await supabase.from("ticket_attachments").insert({
        ticket_id: ticketId,
        comment_id: commentId,
        autor_id: user?.id ? Number(user.id) : null,
        autor_nome: user?.nome || null,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
      } as any);
    }
  };

  // Cliente: faz upload ao storage e depois envia metadados via edge function (service role).
  const uploadAttachmentsAsCliente = async (): Promise<Array<{
    storage_path: string; file_name: string; mime_type: string | null; tamanho_bytes: number;
  }>> => {
    const uploaded: Array<{ storage_path: string; file_name: string; mime_type: string | null; tamanho_bytes: number }> = [];
    for (const file of commentFiles) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${ticketId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from("ticket-attachments").upload(path, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (upErr) {
        toast({ title: "Erro ao enviar anexo", description: `${file.name}: ${upErr.message}`, variant: "destructive" });
        continue;
      }
      uploaded.push({
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || null,
        tamanho_bytes: file.size,
      });
    }
    return uploaded;
  };

  const adicionarComentario = async () => {
    if (sendingRef.current) return; // anti duplo-clique
    if (!novoComentario.trim() && commentFiles.length === 0) return;
    sendingRef.current = true;
    setSalvandoComent(true);
    try {
      const conteudo = novoComentario.trim() || "(somente anexos)";
      const uploaded = await uploadAttachmentsAsCliente();
      const sessionToken = localStorage.getItem("auth_token") || "";
      const { data, error } = await supabase.functions.invoke("add-ticket-comment-cliente", {
        body: {
          ticket_id: ticketId,
          conteudo,
          attachments: uploaded,
          tipo: isCliente ? "CLIENTE" : tipoComent,
        },
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      if (error || !data?.comment_id) {
        toast({
          title: "Não foi possível adicionar a mensagem. Tente novamente.",
          description: error?.message || (data as any)?.error,
          variant: "destructive",
        });
        return;
      }
      setNovoComentario("");
      setCommentFiles([]);
      if (!isCliente) toast({ title: "Mensagem adicionada ao chamado." });
      await load();
    } finally {
      setSalvandoComent(false);
      sendingRef.current = false;
    }
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
      await logTicketEvent({
        ticketId,
        campo: "anexo_add",
        valorNovo: file.name,
        user,
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
    await logTicketEvent({
      ticketId,
      campo: "anexo_remove",
      valorAnterior: att.file_name,
      user,
    });
    load();
  };

  if (loading) {
    return <div className="p-8 text-muted-foreground">Carregando...</div>;
  }
  if (!ticket) {
    return <div className="p-8 text-muted-foreground">Chamado não encontrado ou sem acesso.</div>;
  }


  const confirmarResolucao = async () => {
    const { error } = await supabase.rpc("fn_cliente_encerrar_ticket", { _ticket_id: ticketId } as any);
    if (error) {
      toast({ title: "Não foi possível encerrar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Chamado encerrado", description: "Obrigado por confirmar a resolução." });
    load();
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/chamados")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm bg-primary text-primary-foreground px-2.5 py-1 rounded font-semibold">
                {ticket.codigo}
              </span>
              {!isCliente && (
                <Badge className={PRIORITY_COLORS[ticket.prioridade as TicketPriority]}>
                  {PRIORITY_LABELS[ticket.prioridade as TicketPriority]}
                </Badge>
              )}
              <Badge className={`${STATUS_COLORS[ticket.status as TicketStatus]} text-sm`}>
                {isCliente ? clientStatusLabel(ticket.status) : STATUS_LABELS[ticket.status as TicketStatus]}
              </Badge>
              {!isCliente && sla && <Badge className={SLA_COLORS[sla.level]}>{sla.label}</Badge>}
            </div>
            <h1 className="text-xl font-bold mt-1">{ticket.titulo}</h1>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          {isCliente ? (
            ticket.status === "RESOLVIDO" && (
              <Button variant="default" onClick={confirmarResolucao}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar resolução
              </Button>
            )
          ) : isClosed(ticket.status) ? (
            <Button variant="outline" onClick={() => setReabrirOpen(true)}>
              <RefreshCcw className="h-4 w-4 mr-1" /> Reabrir
            </Button>
          ) : (
            <>
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
              <Button variant="default" onClick={() => setEncerrarOpen(true)}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Encerrar
              </Button>
            </>
          )}
          {!isCliente && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirm(`Excluir definitivamente o chamado ${ticket.codigo}? Esta ação não pode ser desfeita.`)) return;
                const sessionToken = localStorage.getItem("auth_token") || "";
                const { data, error } = await supabase.functions.invoke("delete-ticket", {
                  body: { ticket_id: ticketId },
                  headers: { Authorization: `Bearer ${sessionToken}` },
                });
                if (error || (data as any)?.error) {
                  toast({ title: "Erro ao excluir", description: error?.message || (data as any)?.error || "Falha", variant: "destructive" });
                  return;
                }
                toast({ title: "Chamado excluído" });
                navigate("/dashboard/chamados");
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </Button>
          )}
        </div>
      </div>

      {!isCliente && <TicketHeaderInfo ticket={ticket} history={history} />}
      {!isCliente && <FluxoOperacionalCard ticket={ticket} onChanged={load} />}

      <Tabs defaultValue="resumo" className="w-full">
        <TabsList>
          <TabsTrigger value="resumo">Conversa ({comments.length + 1})</TabsTrigger>
          {!isCliente && <TabsTrigger value="timeline">Timeline</TabsTrigger>}
          {!isCliente && <TabsTrigger value="sla">SLA</TabsTrigger>}
          {!isCliente && <TabsTrigger value="historico">Histórico ({history.length})</TabsTrigger>}
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
                {ticket.descricao ? <RichContent value={ticket.descricao} /> : <span className="text-muted-foreground">Sem descrição</span>}
              </ConversationBubble>

              {/* Anexos da abertura (sem comment_id) */}
              {(() => {
                const openingAtts = attachments.filter((a: any) => !a.comment_id);
                return openingAtts.length > 0 ? (
                  <div className="ml-12">
                    <TicketAttachmentList items={openingAtts as AttachmentRow[]} />
                  </div>
                ) : null;
              })()}

              {/* Conversa */}
              {comments
                .filter((c) => !isCliente || c.tipo !== "INTERNO")
                .map((c) => {
                  const isInterno = c.tipo === "INTERNO";
                  const commentAtts = attachments.filter((a: any) => a.comment_id === c.id);
                  return (
                    <div key={c.id} className="space-y-2">
                      <ConversationBubble
                        side={isInterno ? "right" : "right"}
                        authorName={c.autor_nome || "Sistema"}
                        createdAt={c.criado_em}
                        createdLabel="Respondido em"
                        badge={isInterno ? "Nota interna" : "Resposta"}
                        tone={isInterno ? "internal" : "default"}
                      >
                        <RichContent value={c.conteudo} />
                        {commentAtts.length > 0 && (
                          <TicketAttachmentList items={commentAtts as AttachmentRow[]} />
                        )}
                      </ConversationBubble>
                    </div>
                  );
                })}

              {/* Compositor */}
              <Card className="border-dashed">
                <CardContent className="pt-4 space-y-3">
                  {!isCliente && (
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
                  )}
                  <Textarea
                    rows={4}
                    maxLength={2500}
                    placeholder="Escreva uma resposta ou nota..."
                    value={novoComentario}
                    onChange={(e) => setNovoComentario(e.target.value.slice(0, 2500))}
                    disabled={salvandoComent}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`flex items-center gap-1 text-xs px-2 py-1 border rounded-md cursor-pointer hover:bg-muted/50 ${salvandoComent ? "pointer-events-none opacity-60" : ""}`}>
                      <Paperclip className="h-3.5 w-3.5" />
                      Anexar arquivo
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        disabled={salvandoComent}
                        onChange={(e) => { handleCommentFiles(e.target.files); e.target.value = ""; }}
                      />
                    </label>
                    {commentFiles.map((f, i) => (
                      <span key={i} className="text-xs bg-primary/5 rounded px-2 py-1 flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {f.name} ({Math.round(f.size / 1024)} KB)
                        <button
                          type="button"
                          disabled={salvandoComent}
                          onClick={() => setCommentFiles((p) => p.filter((_, idx) => idx !== i))}
                          className="text-destructive hover:opacity-70 ml-1"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className={`text-xs ${novoComentario.length >= 2500 ? "text-destructive" : "text-muted-foreground"}`}>
                      {novoComentario.length}/2500 caracteres
                    </span>
                    <Button
                      onClick={adicionarComentario}
                      disabled={salvandoComent || (!novoComentario.trim() && commentFiles.length === 0)}
                    >
                      {salvandoComent ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Enviando...</>
                      ) : (
                        <><Send className="h-4 w-4 mr-1" /> Enviar</>
                      )}
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

              {!isCliente && (
                <DetailGroup title="Atribuição">
                  <DetailRow label="Fila" value={ticket.ticket_filas?.nome} />
                  <DetailRow label="Categoria" value={ticket.ticket_categorias?.nome} />
                  <DetailRow label="Técnico" value={ticket.usuarios?.nome} />
                </DetailGroup>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="sla" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={testarWebhookN8N}>
              <Send className="h-4 w-4 mr-1" /> Testar webhook N8N
            </Button>
          </div>
          <SlaCard ticket={ticket} />
        </TabsContent>

        <TabsContent value="timeline" className="space-y-2">
          <Card>
            <CardContent className="pt-6">
              <TicketTimeline
                ticket={ticket}
                history={history}
                comments={comments}
                attachments={attachments}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Sem histórico</p>
          )}
          {history.map((h) => (
            <Card key={h.id}>
              <CardContent className="pt-4 flex items-start gap-3 text-sm">
                <History className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-medium">{fieldLabel(h.campo)}</span>
                    <span className="text-xs text-muted-foreground">
                      · {h.autor_nome || "Sistema"} · {fmtDate(h.criado_em)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="text-muted-foreground line-through">{formatValue(h.campo, h.valor_anterior)}</span>
                    <span className="mx-2">→</span>
                    <span className="font-medium">{formatValue(h.campo, h.valor_novo)}</span>
                  </div>
                  {h.observacao && (
                    <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                      {h.observacao}
                    </div>
                  )}
                </div>
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
          {attachments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sem anexos</p>
          ) : (
            <Card>
              <CardContent className="pt-4">
                <TicketAttachmentList
                  items={attachments as AttachmentRow[]}
                  onRemove={(a) => removeAttachment(a)}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <TicketModal open={editOpen} onOpenChange={setEditOpen} ticketId={ticketId} onSaved={load} />
      <EncerramentoModal open={encerrarOpen} onOpenChange={setEncerrarOpen} ticket={ticket} onClosed={load} />
      <ReaberturaModal open={reabrirOpen} onOpenChange={setReabrirOpen} ticket={ticket} onReopened={load} />
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
            <div className="text-sm leading-relaxed text-foreground/90">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
