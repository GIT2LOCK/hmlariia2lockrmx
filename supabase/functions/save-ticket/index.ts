// Cria ou atualiza tickets para staff (SUPERADMIN, ADMIN, USER) via service_role,
// evitando bloqueios de RLS quando a sessão Supabase está dessincronizada.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSession } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SLA_ATEND: Record<string, number> = { BAIXO: 480, MEDIO: 240, ALTO: 60, CRITICO: 15 };
const SLA_SOL: Record<string, number> = { BAIXO: 2880, MEDIO: 1440, ALTO: 480, CRITICO: 240 };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let usuarioId: number;
  try { usuarioId = await validateSession(req, supabase); }
  catch (e) { return json({ error: (e as Error).message }, 401); }

  const { data: user } = await supabase
    .from("usuarios")
    .select("id, nome, permissao, ativo")
    .eq("id", usuarioId)
    .maybeSingle();
  if (!user || !user.ativo) return json({ error: "usuario_invalido" }, 403);

  const perm = user.permissao;
  if (perm !== "SUPERADMIN" && perm !== "ADMIN" && perm !== "USER") {
    return json({ error: "sem_permissao" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const ticketId = body?.ticket_id ? Number(body.ticket_id) : null;
  const f = body?.payload ?? {};
  if (!f?.titulo || !String(f.titulo).trim()) return json({ error: "titulo_obrigatorio" }, 400);

  const allowedPrio = ["BAIXO", "MEDIO", "ALTO", "CRITICO"];
  const prioridade = allowedPrio.includes(f.prioridade) ? f.prioridade : "MEDIO";

  const payload: Record<string, unknown> = {
    titulo: String(f.titulo).slice(0, 200),
    descricao: f.descricao ?? null,
    prioridade,
    status: f.status ?? "NOVO",
    empresa_id: f.empresa_id ?? null,
    unidade_id: f.unidade_id ?? null,
    operadora_id: f.operadora_id ?? null,
    fila_id: f.fila_id ?? null,
    categoria_id: f.categoria_id ?? null,
    tecnico_id: f.tecnico_id ?? null,
    solicitante_nome: f.solicitante_nome ?? null,
    solicitante_email: f.solicitante_email ?? null,
    solicitante_telefone: f.solicitante_telefone ?? null,
    ativo: f.ativo ?? null,
    origem: f.origem ?? "MANUAL",
    tipo_chamado: (f.tipo_chamado || "T").toString().toUpperCase().slice(0, 1),
    sla_atendimento_minutos: SLA_ATEND[prioridade] ?? null,
    sla_solucao_minutos: SLA_SOL[prioridade] ?? null,
  };

  if (ticketId) {
    const { data: beforeRow } = await supabase.from("tickets").select("*").eq("id", ticketId).maybeSingle();
    const { error } = await supabase.from("tickets").update(payload).eq("id", ticketId);
    if (error) return json({ error: error.message }, 500);

    // Notifica novo solicitante quando adicionado/alterado em chamado existente
    try {
      const oldEmail = (beforeRow?.solicitante_email || "").toLowerCase().trim();
      const newEmail = (payload.solicitante_email as string || "").toLowerCase().trim();
      if (newEmail && newEmail !== oldEmail) {
        supabase.functions.invoke("send-email-notification", {
          body: { ticket_id: ticketId, event: "solicitante_added", to: newEmail },
        }).catch((e) => console.error("[save-ticket] notify solicitante_added", e));
      }
      // Mudança de status via edição
      if (payload.status && beforeRow?.status && payload.status !== beforeRow.status) {
        supabase.functions.invoke("send-email-notification", {
          body: {
            ticket_id: ticketId,
            event: "status_change",
            extra: { status_anterior: beforeRow.status, status_novo: payload.status },
          },
        }).catch((e) => console.error("[save-ticket] notify status", e));
      }
    } catch (e) { console.error("[save-ticket] notify block", e); }

    return json({ ok: true, ticket_id: ticketId, before: beforeRow });
  } else {
    payload.criado_por = usuarioId;
    const { data, error } = await supabase.from("tickets").insert(payload).select("id, codigo").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    // Notifica solicitante da criação
    if (payload.solicitante_email && data?.id) {
      supabase.functions.invoke("send-email-notification", {
        body: { ticket_id: data.id, event: "created" },
      }).catch((e) => console.error("[save-ticket] notify created", e));
    }
    return json({ ok: true, ticket_id: data?.id, codigo: data?.codigo });
  }
});
