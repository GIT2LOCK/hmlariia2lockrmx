// Envia notificação de novo comentário público para o N8N → cliente por e-mail
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("N8N_EMAIL_WEBHOOK_URL") || "https://webwork.2lock.app.br/webhook/mail2lock";

  try {
    const { ticket_id, comment_id, event, extra, to: toOverride } = await req.json();
    if (!ticket_id) return json({ error: "ticket_id obrigatório" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", ticket_id).maybeSingle();
    if (!ticket) return json({ error: "Ticket não encontrado" }, 404);

    const primary = (toOverride || ticket.solicitante_email || "").toString().trim();
    const extras: string[] = Array.isArray(ticket.solicitante_emails_extra) ? ticket.solicitante_emails_extra : [];
    const recipients = Array.from(new Set([primary, ...extras].map((e) => (e || "").toString().trim()).filter(Boolean)));
    if (recipients.length === 0) return json({ ok: true, skipped: "sem email" });

    let conteudo = "";
    if (comment_id) {
      const { data: c } = await supabase.from("ticket_comments").select("conteudo").eq("id", comment_id).maybeSingle();
      conteudo = c?.conteudo || "";
    }
    if (!conteudo && event === "created") conteudo = ticket.descricao || "";

    // Anexos (links assinados, válidos por 7 dias) — apenas para eventos com mensagem
    const anexosLinks: Array<{ name: string; url: string }> = [];
    if (event === "comment" || event === "created" || !event) {
      const { data: anexos } = await supabase.from("ticket_attachments").select("*").eq("ticket_id", ticket_id);
      for (const a of anexos || []) {
        const { data: signed } = await supabase.storage.from("ticket-attachments")
          .createSignedUrl(a.storage_path, 60 * 60 * 24 * 7);
        if (signed?.signedUrl) anexosLinks.push({ name: a.file_name, url: signed.signedUrl });
      }
    }

    const appBaseUrl = (Deno.env.get("APP_BASE_URL") || "https://ariia.2lock.com.br").replace(/\/+$/, "");
    const ticketUrl = `${appBaseUrl}/dashboard/chamados/${ticket.id}`;

    const eventoLabel: Record<string, string> = {
      created: "Chamado aberto",
      comment: "Nova mensagem no chamado",
      status_change: "Status do chamado alterado",
      assigned: "Técnico atribuído ao chamado",
      solicitante_added: "Você foi adicionado como solicitante",
    };
    const subjectPrefix = `[Chamado #${ticket.id}]`;
    const subject = event && eventoLabel[event]
      ? `${subjectPrefix} ${eventoLabel[event]} — ${ticket.titulo}`
      : `${subjectPrefix} ${ticket.titulo}`;

    const basePayload = {
      event: event || "comment",
      ticket_id: String(ticket.id),
      ticket_numero: ticket.id,
      codigo: ticket.codigo,
      ticket_url: ticketUrl,
      url: ticketUrl,
      subject,
      message: conteudo,
      titulo: ticket.titulo,
      status: ticket.status,
      prioridade: ticket.prioridade,
      solicitante_nome: ticket.solicitante_nome,
      solicitante_email: ticket.solicitante_email,
      solicitante_emails_extra: extras,
      attachments: anexosLinks,
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
    return json({ ok: true, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
