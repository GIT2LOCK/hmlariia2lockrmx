// Dispara webhook N8N para envio de e-mail SmartSigma (indisponibilidade de link)
// e abre automaticamente um chamado "Em Atendimento" no Ariia.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireCaller, authErrorResponse } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const WEBHOOK_URL = "https://workflow01.2lock.com.br/webhook/smartsigma";

// SLA defaults (espelho de tickets-api)
const SLA_ATENDIMENTO: Record<string, number> = { CRITICO: 15, ALTO: 30, MEDIO: 120, BAIXO: 480 };
const SLA_SOLUCAO: Record<string, number> = { CRITICO: 240, ALTO: 480, MEDIO: 1440, BAIXO: 4320 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    await requireCaller(req);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  try {
    const body = await req.json();
    const {
      empresa, unidade, operadora_email, operadora_nome, message,
      user_email, user_nome, link_id, unidade_id,
    } = body || {};
    if (!empresa || !unidade || !message) {
      return json({ error: "empresa, unidade e message são obrigatórios" }, 400);
    }

    const subject = `Indisponibilidade de Link - ${empresa} ${unidade}`;
    const payload = {
      to: operadora_email || null,
      from: user_email || null,
      from_name: user_nome || null,
      user_email: user_email || null,
      user_nome: user_nome || null,
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

    // ===== Abre chamado automaticamente "EM_ATENDIMENTO" =====
    let ticket: any = null;
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      // Resolve empresa_id e operadora_id quando possível
      let empresa_id: number | null = null;
      let operadora_id: number | null = null;
      if (unidade_id) {
        const { data: u } = await supabase
          .from("unidades").select("empresa_id").eq("id", unidade_id).maybeSingle();
        empresa_id = (u as any)?.empresa_id ?? null;
      }
      if (link_id) {
        const { data: l } = await supabase
          .from("links_internet").select("operadora_id").eq("id", link_id).maybeSingle();
        operadora_id = (l as any)?.operadora_id ?? null;
      }

      const prioridade = "ALTO";
      const now = new Date().toISOString();
      const insertPayload = {
        titulo: subject,
        descricao: message,
        prioridade,
        status: "EM_ATENDIMENTO",
        origem: "API",
        empresa_id,
        unidade_id: unidade_id || null,
        link_id: link_id || null,
        operadora_id,
        solicitante_nome: user_nome || null,
        solicitante_email: user_email || null,
        data_primeiro_atendimento: now,
        sla_atendimento_minutos: SLA_ATENDIMENTO[prioridade],
        sla_solucao_minutos: SLA_SOLUCAO[prioridade],
      };
      const { data: inserted, error: insErr } = await supabase
        .from("tickets").insert(insertPayload).select("*").maybeSingle();
      if (insErr) {
        console.error("[smartsigma] erro ao criar ticket:", insErr.message);
      } else {
        ticket = inserted;
      }
    } catch (e) {
      console.error("[smartsigma] exceção ao criar ticket:", (e as Error).message);
    }

    return json({ ok: true, subject, ticket });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
