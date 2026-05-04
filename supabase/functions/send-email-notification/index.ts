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

  const url = Deno.env.get("N8N_EMAIL_WEBHOOK_URL");
  if (!url) return json({ error: "N8N_EMAIL_WEBHOOK_URL não configurado" }, 500);

  try {
    const { ticket_id, comment_id } = await req.json();
    if (!ticket_id) return json({ error: "ticket_id obrigatório" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: ticket } = await supabase.from("tickets").select("*").eq("id", ticket_id).maybeSingle();
    if (!ticket) return json({ error: "Ticket não encontrado" }, 404);
    if (!ticket.solicitante_email) return json({ ok: true, skipped: "sem email" });

    let conteudo = "";
    if (comment_id) {
      const { data: c } = await supabase.from("ticket_comments").select("conteudo").eq("id", comment_id).maybeSingle();
      conteudo = c?.conteudo || "";
    }
    // Fallback: se não houver comentário, envia a descrição do chamado
    if (!conteudo) conteudo = ticket.descricao || "";

    // Anexos (links assinados, válidos por 7 dias)
    const { data: anexos } = await supabase.from("ticket_attachments").select("*").eq("ticket_id", ticket_id);
    const anexosLinks: Array<{ name: string; url: string }> = [];
    for (const a of anexos || []) {
      const { data: signed } = await supabase.storage.from("ticket-attachments")
        .createSignedUrl(a.storage_path, 60 * 60 * 24 * 7);
      if (signed?.signedUrl) anexosLinks.push({ name: a.file_name, url: signed.signedUrl });
    }

    const payload = {
      ticket_id: String(ticket.id),
      codigo: ticket.codigo,
      to: ticket.solicitante_email,
      subject: `[Ticket #${ticket.id}] ${ticket.titulo}`,
      message: conteudo,
      status: ticket.status,
      attachments: anexosLinks,
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    if (!r.ok) return json({ error: "Falha webhook N8N", status: r.status, detail: txt }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
