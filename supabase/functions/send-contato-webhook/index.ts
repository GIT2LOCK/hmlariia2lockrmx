import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const WEBHOOK_URL = "https://workflow01.2lock.com.br/webhook/ariia";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      tipo_contato, // 'primeiro' | 'responsavel'
      contato_nome,
      contato_telefone,
      mensagem,
      host,
      problema,
      prefixo,
    } = body ?? {};

    if (!contato_nome || !contato_telefone) {
      return new Response(JSON.stringify({ error: "contato_nome e contato_telefone são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = {
      tipo_contato: tipo_contato || "primeiro",
      contato_nome,
      contato_telefone,
      mensagem: mensagem || "",
      host: host || null,
      problema: problema || null,
      prefixo: prefixo || null,
      timestamp: new Date().toISOString(),
    };

    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("Webhook error:", res.status, text);
      return new Response(JSON.stringify({ error: `Webhook respondeu ${res.status}`, details: text }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, response: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-contato-webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
