// Permite que clientes adicionem mensagens (e anexos) em chamados sem depender de RLS.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSession } from "../_shared/auth.ts";
import { getUserCompanyGroupScope, ticketMatchesCompanyScope } from "../_shared/authz.ts";

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
  const conteudo = String(body?.conteudo ?? "").trim();
  const tipoIn = String(body?.tipo ?? "").toUpperCase();
  const attachments: Array<{
    storage_path: string;
    file_name: string;
    mime_type?: string | null;
    tamanho_bytes?: number | null;
  }> = Array.isArray(body?.attachments) ? body.attachments : [];

  if (!ticketId || Number.isNaN(ticketId)) return json({ error: "ticket_id_invalido" }, 400);
  if (!conteudo && attachments.length === 0) return json({ error: "vazio" }, 400);

  const { data: user } = await supabase
    .from("usuarios")
    .select("id, nome, email, permissao, empresa_id, ativo")
    .eq("id", usuarioId)
    .maybeSingle();

  if (!user || !user.ativo) return json({ error: "usuario_invalido" }, 403);

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, empresa_id, unidade_id, criado_por, tecnico_id, assigned_by, assigned_group_id, solicitante_email")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return json({ error: "ticket_nao_encontrado" }, 404);

  const perm = user.permissao;
  const isAdmin = perm === "SUPERADMIN" || perm === "ADMIN";
  let autorizado = isAdmin;

  if (!autorizado) {
    const goodStorageScope = await getUserCompanyGroupScope(supabase, usuarioId, "GoodStorage");
    autorizado = ticketMatchesCompanyScope(ticket, goodStorageScope);
  }

  if (!autorizado && perm === "CLIENTE") {
    autorizado = ticket.criado_por === usuarioId;
    if (!autorizado && user.email && ticket.solicitante_email &&
        String(ticket.solicitante_email).toLowerCase() === String(user.email).toLowerCase()) {
      autorizado = true;
    }
    if (!autorizado && user.email) {
      const { data: contatos } = await supabase
        .from("contatos")
        .select("id, unidade_id, cobre_empresa_inteira, empresa_id")
        .ilike("email", user.email);
      const unidadeIds = new Set<number>();
      for (const c of contatos ?? []) if (typeof c.unidade_id === "number") unidadeIds.add(c.unidade_id);
      const contatoIds = (contatos ?? []).map((c: any) => c.id);
      if (contatoIds.length > 0) {
        const { data: cu } = await supabase.from("contato_unidades").select("unidade_id").in("contato_id", contatoIds);
        for (const r of cu ?? []) if (typeof r.unidade_id === "number") unidadeIds.add(r.unidade_id);
      }
      const empresasCobertura = (contatos ?? [])
        .filter((c: any) => c.cobre_empresa_inteira && c.empresa_id)
        .map((c: any) => c.empresa_id);
      if (empresasCobertura.length > 0) {
        const { data: us } = await supabase.from("unidades").select("id").in("empresa_id", empresasCobertura);
        for (const r of us ?? []) unidadeIds.add((r as any).id);
      }
      autorizado = !!(ticket.unidade_id && unidadeIds.has(ticket.unidade_id));
    }
    if (!autorizado && user.empresa_id && ticket.empresa_id === user.empresa_id) {
      autorizado = true;
    }
  } else if (!autorizado) {
    if (ticket.criado_por === usuarioId || ticket.tecnico_id === usuarioId || ticket.assigned_by === usuarioId) {
      autorizado = true;
    } else if (ticket.assigned_group_id) {
      const { data: m } = await supabase
        .from("support_group_members")
        .select("usuario_id")
        .eq("group_id", ticket.assigned_group_id)
        .eq("usuario_id", usuarioId)
        .eq("ativo", true)
        .maybeSingle();
      autorizado = !!m;
    }
  }
  if (!autorizado) return json({ error: "sem_acesso" }, 403);

  // CLIENTE sempre marca como CLIENTE; demais respeitam o tipo enviado (default INTERNO)
  const tipo = perm === "CLIENTE" ? "CLIENTE" : (tipoIn === "CLIENTE" ? "CLIENTE" : "INTERNO");

  const { data: comment, error: cErr } = await supabase
    .from("ticket_comments")
    .insert({
      ticket_id: ticketId,
      conteudo: conteudo || "(somente anexos)",
      tipo,
      autor_id: usuarioId,
      autor_nome: user.nome,
    })
    .select("id")
    .maybeSingle();
  if (cErr || !comment?.id) {
    console.error("[add-comment] insert comment error", cErr);
    return json({ error: cErr?.message || "erro_comentario" }, 500);
  }

  if (attachments.length > 0) {
    const rows = attachments.map((a) => ({
      ticket_id: ticketId,
      comment_id: comment.id,
      autor_id: usuarioId,
      autor_nome: user.nome,
      storage_path: a.storage_path,
      file_name: a.file_name,
      mime_type: a.mime_type ?? null,
      tamanho_bytes: a.tamanho_bytes ?? null,
    }));
    const { error: aErr } = await supabase.from("ticket_attachments").insert(rows);
    if (aErr) console.error("[add-comment] insert attachments error", aErr);
  }

  await supabase.from("ticket_history").insert({
    ticket_id: ticketId,
    campo: "comentario",
    valor_novo: tipo,
    observacao: (conteudo || "(somente anexos)").slice(0, 500),
    autor_id: usuarioId,
    autor_nome: user.nome,
  });

  // Notificação por e-mail quando staff publica para o cliente
  if (tipo === "CLIENTE" && perm !== "CLIENTE" && ticket.solicitante_email) {
    supabase.functions.invoke("send-email-notification", {
      body: { ticket_id: ticketId, comment_id: comment.id },
    }).catch((e) => console.error("[notify] erro", e));
  }

  return json({ ok: true, comment_id: comment.id });
});
