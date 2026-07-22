// Atualiza ações pontuais de chamados via service_role, mantendo autorização Ariia em código.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSession } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const STAFF_ROLES = new Set(["SUPERADMIN", "ADMIN", "USER"]);
const ADMIN_ROLES = new Set(["SUPERADMIN", "ADMIN"]);
const ALLOWED_UPDATE_FIELDS = new Set([
  "status",
  "data_primeiro_atendimento",
  "data_solucao",
  "data_fechamento",
  "solucao_aplicada",
  "motivo_encerramento",
  "motivo_encerramento_outro",
  "sla_pausa_inicio",
  "sla_pausa_total_segundos",
  "aguardando_cliente_motivo",
  "aguardando_cliente_desde",
  "tecnico_id",
  "assigned_group_id",
  "assigned_by",
  "assigned_at",
  "fila_id",
  "nivel_escalonamento",
]);

async function userCanUpdateTicket(supabase: any, user: any, ticket: any) {
  if (ADMIN_ROLES.has(user.permissao)) return true;
  if (user.permissao !== "USER") return false;
  if (ticket.criado_por === user.id || ticket.tecnico_id === user.id || ticket.assigned_by === user.id) return true;
  if (user.email && ticket.solicitante_email &&
      String(ticket.solicitante_email).toLowerCase() === String(user.email).toLowerCase()) return true;
  if (!ticket.assigned_group_id) return true;
  const { data } = await supabase
    .from("support_group_members")
    .select("usuario_id")
    .eq("group_id", ticket.assigned_group_id)
    .eq("usuario_id", user.id)
    .eq("ativo", true)
    .maybeSingle();
  return !!data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let usuarioId: number;
  try {
    usuarioId = await validateSession(req, supabase);
  } catch (e) {
    return json({ error: (e as Error).message }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const ticketId = Number(body?.ticket_id);
  if (!ticketId || Number.isNaN(ticketId)) return json({ error: "ticket_id_invalido" }, 400);

  const updatesIn = body?.updates && typeof body.updates === "object" ? body.updates : null;
  if (!updatesIn || Array.isArray(updatesIn)) return json({ error: "updates_invalidos" }, 400);

  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updatesIn)) {
    if (!ALLOWED_UPDATE_FIELDS.has(key)) return json({ error: `campo_nao_permitido:${key}` }, 400);
    updates[key] = value;
  }
  if (Object.keys(updates).length === 0) return json({ error: "sem_alteracoes" }, 400);

  const { data: user } = await supabase
    .from("usuarios")
    .select("id, nome, email, permissao, ativo")
    .eq("id", usuarioId)
    .maybeSingle();
  if (!user || !user.ativo) return json({ error: "usuario_invalido" }, 403);
  if (!STAFF_ROLES.has(user.permissao)) return json({ error: "sem_permissao" }, 403);

  const { data: ticket, error: tErr } = await supabase
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (tErr) return json({ error: tErr.message }, 500);
  if (!ticket) return json({ error: "ticket_nao_encontrado" }, 404);

  if (!(await userCanUpdateTicket(supabase, user, ticket))) return json({ error: "sem_acesso" }, 403);

  const { data: updated, error: uErr } = await supabase
    .from("tickets")
    .update(updates)
    .eq("id", ticketId)
    .select("*")
    .maybeSingle();
  if (uErr) return json({ error: uErr.message }, 500);

  const history = Array.isArray(body?.history) ? body.history : [];
  if (history.length > 0) {
    const rows = history.slice(0, 20).map((h: any) => ({
      ticket_id: ticketId,
      campo: String(h?.campo || "alteracao").slice(0, 80),
      valor_anterior: h?.valorAnterior == null ? null : String(h.valorAnterior),
      valor_novo: h?.valorNovo == null ? null : String(h.valorNovo),
      observacao: h?.observacao == null ? null : String(h.observacao).slice(0, 4000),
      autor_id: usuarioId,
      autor_nome: user.nome,
    }));
    const { error: hErr } = await supabase.from("ticket_history").insert(rows);
    if (hErr) console.error("[update-ticket] history error", hErr);
  }

  const comment = body?.comment;
  if (comment?.conteudo) {
    const tipo = String(comment?.tipo || "INTERNO").toUpperCase() === "CLIENTE" ? "CLIENTE" : "INTERNO";
    const { error: cErr } = await supabase.from("ticket_comments").insert({
      ticket_id: ticketId,
      conteudo: String(comment.conteudo).slice(0, 8000),
      tipo,
      autor_id: usuarioId,
      autor_nome: user.nome,
    });
    if (cErr) console.error("[update-ticket] comment error", cErr);
  }

  // === Notificações ao solicitante (webhook mail2lock via n8n) ===
  // Consolida TODAS as alterações desta chamada em uma única notificação, com
  // o evento priorizado por tipo (resolved/closed/reopened/status_change/assigned/comment/updated).
  try {
    const changes: Array<{ campo: string; valor_anterior: any; valor_novo: any }> = [];
    for (const [k, v] of Object.entries(updates)) {
      const prev = (ticket as any)[k];
      if (prev !== v) changes.push({ campo: k, valor_anterior: prev ?? null, valor_novo: v ?? null });
    }

    const statusChanged = Object.prototype.hasOwnProperty.call(updates, "status") && updates.status !== ticket.status;
    const tecnicoChanged = Object.prototype.hasOwnProperty.call(updates, "tecnico_id")
      && updates.tecnico_id && updates.tecnico_id !== ticket.tecnico_id;
    const tipoNorm = String(comment?.tipo || "INTERNO").toUpperCase();
    const hasPublicComment = !!comment?.conteudo && tipoNorm === "CLIENTE";

    let eventName: string | null = null;
    const extra: Record<string, unknown> = { changes };

    if (statusChanged) {
      const s = String(updates.status);
      if (s === "RESOLVIDO") eventName = "resolved";
      else if (s === "FECHADO") eventName = "closed";
      else if (["EM_ATENDIMENTO", "NOVO", "TRIAGEM"].includes(s) && ["RESOLVIDO", "FECHADO", "CANCELADO"].includes(String(ticket.status))) eventName = "reopened";
      else eventName = "status_change";
      extra.status_anterior = ticket.status;
      extra.status_novo = updates.status;
    } else if (tecnicoChanged) {
      eventName = "assigned";
      const { data: tec } = await supabase.from("usuarios").select("nome,email").eq("id", updates.tecnico_id as any).maybeSingle();
      extra.tecnico_nome = tec?.nome || null;
      extra.tecnico_email = tec?.email || null;
    } else if (hasPublicComment) {
      eventName = "comment";
    } else if (changes.length > 0) {
      eventName = "updated";
    }

    if (eventName) {
      const body: Record<string, unknown> = { ticket_id: ticketId, event: eventName, extra };
      // Se houver comentário público nesta interação, anexa o comment_id ao evento
      if (hasPublicComment) {
        const { data: lastComment } = await supabase
          .from("ticket_comments")
          .select("id")
          .eq("ticket_id", ticketId)
          .eq("tipo", "CLIENTE")
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastComment?.id) body.comment_id = lastComment.id;
      }
      supabase.functions.invoke("send-email-notification", { body })
        .catch((e) => console.error("[notify]", eventName, e));
    }
  } catch (e) {
    console.error("[update-ticket] notify error", e);
  }

  return json({ ok: true, ticket: updated });
});