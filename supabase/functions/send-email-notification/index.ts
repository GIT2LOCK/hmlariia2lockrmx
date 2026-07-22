// Envia notificações de chamados ao webhook do N8N.
// Cada tipo de evento envia um payload específico contendo TODOS os dados do
// chamado (com relações) e, quando aplicável, a lista completa de alterações.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EVENT_LABEL: Record<string, string> = {
  created: "Chamado aberto",
  comment: "Nova mensagem no chamado",
  status_change: "Status do chamado alterado",
  assigned: "Técnico atribuído ao chamado",
  solicitante_added: "Você foi adicionado como solicitante",
  updated: "Chamado atualizado",
  reopened: "Chamado reaberto",
  resolved: "Chamado resolvido",
  closed: "Chamado encerrado",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Webhook fixo dos chamados (mail2lock). Não sobrescrever por env para evitar drift.
  const url = "https://webwork.2lock.app.br/webhook/mail2lock";

  try {
    const { ticket_id, comment_id, event, extra, to: toOverride } = await req.json();
    if (!ticket_id) return json({ error: "ticket_id obrigatório" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Ticket + todas as relações relevantes
    const { data: ticket, error: ticketErr } = await supabase
      .from("tickets")
      .select(`
        *,
        empresas:empresa_id(id,nome_fantasia,razao_social,cnpj),
        unidades:unidade_id(id,nome_unidade,logradouro,numero,bairro,cidade,estado,cep,udm_codigo,prefixo_hostname),
        operadoras:operadora_id(id,nome),
        ticket_filas:fila_id(id,nome),
        ticket_categorias:categoria_id(id,nome),
        tecnico:tecnico_id(id,nome,email),
        criador:criado_por(id,nome,email),
        sla_policy:sla_policy_id(id,nome,first_response_minutes,resolution_minutes)
      `)
      .eq("id", ticket_id)
      .maybeSingle();

    if (ticketErr) console.error("[send-email-notification] ticket select error", ticketErr);
    if (!ticket) return json({ error: "Ticket não encontrado", detail: ticketErr?.message }, 404);

    // Embeds sem FK declarada — buscar manualmente
    let equipe: any = null;
    if ((ticket as any).assigned_group_id) {
      const { data } = await supabase.from("support_groups").select("id,nome").eq("id", (ticket as any).assigned_group_id).maybeSingle();
      equipe = data ?? null;
    }
    let atribuidoPor: any = null;
    if ((ticket as any).assigned_by) {
      const { data } = await supabase.from("usuarios").select("id,nome,email").eq("id", (ticket as any).assigned_by).maybeSingle();
      atribuidoPor = data ?? null;
    }
    (ticket as any).support_groups = equipe;
    (ticket as any).atribuido_por = atribuidoPor;

    const primary = (toOverride || ticket.solicitante_email || "").toString().trim();
    const extras: string[] = Array.isArray(ticket.solicitante_emails_extra) ? ticket.solicitante_emails_extra : [];

    // Responsáveis fixos vinculados à empresa (escopo inteiro) e à unidade selecionada
    const respEmails: string[] = [];
    const respDetails: Array<{ nome: string; email: string; escopo: string; unidade_id: number | null }> = [];
    if (ticket.empresa_id) {
      const { data: resps } = await supabase
        .from("contatos")
        .select("nome,email,unidade_id,cobre_empresa_inteira,empresa_id,tipo")
        .eq("tipo", "responsavel")
        .eq("empresa_id", ticket.empresa_id)
        .or(
          ticket.unidade_id
            ? `cobre_empresa_inteira.eq.true,unidade_id.eq.${ticket.unidade_id}`
            : `cobre_empresa_inteira.eq.true`,
        );
      for (const r of resps || []) {
        const em = (r.email || "").toString().trim().toLowerCase();
        if (!em) continue;
        respEmails.push(em);
        respDetails.push({
          nome: r.nome,
          email: em,
          escopo: r.cobre_empresa_inteira ? "empresa" : "unidade",
          unidade_id: r.unidade_id ?? null,
        });
      }
    }

    const recipients = Array.from(new Set(
      [primary, ...extras, ...respEmails].map((e) => (e || "").toString().trim().toLowerCase()).filter(Boolean),
    ));
    if (recipients.length === 0) return json({ ok: true, skipped: "sem email" });

    // Comentário atrelado (se houver)
    let comentario: any = null;
    if (comment_id) {
      const { data: c } = await supabase
        .from("ticket_comments")
        .select("id,conteudo,tipo,autor_id,autor_nome,criado_em")
        .eq("id", comment_id)
        .maybeSingle();
      if (c) comentario = c;
    }
    let conteudo = comentario?.conteudo || "";
    if (!conteudo && event === "created") conteudo = ticket.descricao || "";

    // Todos os anexos do chamado, com links assinados de 7 dias
    const anexosLinks: Array<{ id: number; name: string; url: string; comment_id: number | null; mime_type: string | null; size: number | null }> = [];
    const { data: anexos } = await supabase
      .from("ticket_attachments")
      .select("id,file_name,mime_type,tamanho_bytes,storage_path,comment_id")
      .eq("ticket_id", ticket_id);
    for (const a of anexos || []) {
      const { data: signed } = await supabase.storage.from("ticket-attachments")
        .createSignedUrl(a.storage_path, 60 * 60 * 24 * 7);
      if (signed?.signedUrl) {
        anexosLinks.push({
          id: a.id,
          name: a.file_name,
          url: signed.signedUrl,
          comment_id: a.comment_id ?? null,
          mime_type: a.mime_type ?? null,
          size: a.tamanho_bytes ?? null,
        });
      }
    }

    // Últimos eventos do histórico (contexto adicional)
    const { data: historico } = await supabase
      .from("ticket_history")
      .select("id,campo,valor_anterior,valor_novo,observacao,autor_nome,criado_em")
      .eq("ticket_id", ticket_id)
      .order("criado_em", { ascending: false })
      .limit(30);

    const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://ariia.2lock.com.br").replace(/\/+$/, "");
    const ticketUrl = `${appBaseUrl}/dashboard/chamados/${ticket.id}`;

    const eventKey = event || (comment_id ? "comment" : "updated");
    const subjectPrefix = `[Chamado #${ticket.id}${ticket.codigo ? ` · ${ticket.codigo}` : ""}]`;
    const eventLabel = EVENT_LABEL[eventKey] || "Atualização do chamado";
    const subject = `${subjectPrefix} ${eventLabel} — ${ticket.titulo}`;

    // extra.changes = [{ campo, valor_anterior, valor_novo, label? }]
    const changes = Array.isArray(extra?.changes) ? extra.changes : [];

    // Payload específico por evento (o N8N pode ramificar por `event`)
    const eventPayload: Record<string, unknown> = { event: eventKey };
    if (eventKey === "status_change") {
      eventPayload.status_anterior = extra?.status_anterior ?? null;
      eventPayload.status_novo = extra?.status_novo ?? ticket.status;
    }
    if (eventKey === "assigned") {
      eventPayload.tecnico_nome = extra?.tecnico_nome ?? ticket.tecnico?.nome ?? null;
      eventPayload.tecnico_email = extra?.tecnico_email ?? ticket.tecnico?.email ?? null;
      eventPayload.equipe_nome = extra?.equipe_nome ?? ticket.support_groups?.nome ?? null;
    }
    if (eventKey === "comment" && comentario) {
      eventPayload.comment = {
        id: comentario.id,
        tipo: comentario.tipo,
        autor_nome: comentario.autor_nome,
        criado_em: comentario.criado_em,
        conteudo: comentario.conteudo,
      };
    }

    const basePayload = {
      event: eventKey,
      event_label: eventLabel,
      timestamp: new Date().toISOString(),

      // Identificadores rápidos
      ticket_id: String(ticket.id),
      ticket_numero: ticket.id,
      codigo: ticket.codigo,
      ticket_url: ticketUrl,
      url: ticketUrl,
      subject,
      message: conteudo,

      // Snapshot completo do chamado (todos os campos + relações)
      ticket,

      // Campos frequentemente usados em templates de e-mail
      titulo: ticket.titulo,
      descricao: ticket.descricao,
      status: ticket.status,
      prioridade: ticket.prioridade,
      tipo_chamado: ticket.tipo_chamado,
      empresa: ticket.empresas ?? null,
      unidade: ticket.unidades ?? null,
      operadora: ticket.operadoras ?? null,
      fila: ticket.ticket_filas ?? null,
      categoria: ticket.ticket_categorias ?? null,
      equipe: ticket.support_groups ?? null,
      tecnico: ticket.tecnico ?? null,
      criador: ticket.criador ?? null,
      atribuido_por: ticket.atribuido_por ?? null,
      sla_policy: ticket.sla_policy ?? null,

      solicitante_nome: ticket.solicitante_nome,
      solicitante_email: ticket.solicitante_email,
      solicitante_telefone: ticket.solicitante_telefone,
      solicitante_emails_extra: extras,
      responsaveis_fixos: respDetails,

      attachments: anexosLinks,
      historico_recente: historico ?? [],

      // Todas as alterações desta interação (se houver)
      changes,

      // Payload específico do evento
      event_data: eventPayload,

      // Compat: campo extra bruto original
      extra: extra || null,
    };

    const results: any[] = [];
    for (const to of recipients) {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload, to, recipients }),
      });
      const txt = await r.text();
      results.push({ to, status: r.status, ok: r.ok, detail: r.ok ? undefined : txt });
    }
    const anyFail = results.some((r) => !r.ok);
    if (anyFail) return json({ error: "Falha em algum destinatário", results }, 502);
    return json({ ok: true, event: eventKey, recipients, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
