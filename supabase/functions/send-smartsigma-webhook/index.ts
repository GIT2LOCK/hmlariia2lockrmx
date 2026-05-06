// Dispara webhook N8N para envio de e-mail SmartSigma (indisponibilidade de link)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const WEBHOOK_URL = "https://api01.2lock.com.br/webhook-test/smartsigma";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const { empresa, unidade, operadora_email, operadora_nome, message } = body || {};
    if (!empresa || !unidade || !message) {
      return json({ error: "empresa, unidade e message são obrigatórios" }, 400);
    }

    const subject = `Indisponibilidade de link - ${empresa} ${unidade}`;
    const payload = {
      to: operadora_email || null,
      subject,
      message,
      empresa,
      unidade,
      operadora: operadora_nome || null,
      ...body,
    };

    const r = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    if (!r.ok) return json({ error: "Falha webhook N8N", status: r.status, detail: txt }, 502);
    return json({ ok: true, subject });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
