import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-token",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// SLA defaults (espelho de src/lib/ticketSla.ts)
const SLA_ATENDIMENTO: Record<string, number> = { CRITICO: 15, ALTO: 30, MEDIO: 120, BAIXO: 480 };
const SLA_SOLUCAO: Record<string, number> = { CRITICO: 240, ALTO: 480, MEDIO: 1440, BAIXO: 4320 };
const PAUSED = ["AGUARDANDO_CLIENTE", "AGUARDANDO_OPERADORA", "AGUARDANDO_TERCEIRO", "AGENDADO", "TRIAGEM"];

function authorize(req: Request) {
  const expected = Deno.env.get("N8N_API_TOKEN");
  if (!expected) return false;
  const header = req.headers.get("x-api-token") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  return header === expected;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!authorize(req)) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const url = new URL(req.url);
  // path expected: /tickets-api/tickets[/:id[/comments|/status|/assign]]
  const parts = url.pathname.split("/").filter(Boolean);
  // remove function name prefix
  const fnIdx = parts.indexOf("tickets-api");
  const segs = fnIdx >= 0 ? parts.slice(fnIdx + 1) : parts;

  try {
    // ROUTING
    if (segs[0] !== "tickets") return json({ error: "Not found" }, 404);

    // GET /tickets
    if (segs.length === 1 && req.method === "GET") {
      const status = url.searchParams.get("status");
      const empresa_id = url.searchParams.get("empresa_id");
      const tecnico_id = url.searchParams.get("tecnico_id");
      const limit = Number(url.searchParams.get("limit") || 100);

      let q = supabase.from("tickets").select("*").order("data_abertura", { ascending: false }).limit(limit);
      if (status) q = q.eq("status", status);
      if (empresa_id) q = q.eq("empresa_id", Number(empresa_id));
      if (tecnico_id) q = q.eq("tecnico_id", Number(tecnico_id));
      const { data, error } = await q;
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // POST /tickets
    if (segs.length === 1 && req.method === "POST") {
      const body = await req.json();
      if (!body.titulo) return json({ error: "titulo obrigatório" }, 400);
      const prioridade = body.prioridade || "MEDIO";
      const payload = {
        titulo: body.titulo,
        descricao: body.descricao || null,
        prioridade,
        status: body.status || "NOVO",
        origem: body.origem || "API",
        empresa_id: body.empresa_id || null,
        unidade_id: body.unidade_id || null,
        link_id: body.link_id || null,
        operadora_id: body.operadora_id || null,
        fila_id: body.fila_id || null,
        categoria_id: body.categoria_id || null,
        tecnico_id: body.tecnico_id || null,
        solicitante_nome: body.solicitante_nome || null,
        solicitante_email: body.solicitante_email || null,
        solicitante_telefone: body.solicitante_telefone || null,
        ativo: body.ativo || null,
        sla_atendimento_minutos: body.sla_atendimento_minutos || SLA_ATENDIMENTO[prioridade],
        sla_solucao_minutos: body.sla_solucao_minutos || SLA_SOLUCAO[prioridade],
      };
      const { data, error } = await supabase.from("tickets").insert(payload).select("*").maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ data }, 201);
    }

    const id = Number(segs[1]);
    if (!id) return json({ error: "id inválido" }, 400);

    // GET /tickets/:id
    if (segs.length === 2 && req.method === "GET") {
      const { data, error } = await supabase.from("tickets").select("*").eq("id", id).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data) return json({ error: "Not found" }, 404);
      const [c, h, a] = await Promise.all([
        supabase.from("ticket_comments").select("*").eq("ticket_id", id).order("criado_em"),
        supabase.from("ticket_history").select("*").eq("ticket_id", id).order("criado_em", { ascending: false }),
        supabase.from("ticket_attachments").select("*").eq("ticket_id", id).order("criado_em", { ascending: false }),
      ]);
      return json({ data, comments: c.data || [], history: h.data || [], attachments: a.data || [] });
    }

    // PATCH /tickets/:id
    if (segs.length === 2 && req.method === "PATCH") {
      const body = await req.json();
      const allowed = [
        "titulo","descricao","prioridade","status","empresa_id","unidade_id","link_id",
        "operadora_id","fila_id","categoria_id","tecnico_id","solicitante_nome",
        "solicitante_email","solicitante_telefone","ativo",
      ];
      const update: Record<string, unknown> = {};
      for (const k of allowed) if (k in body) update[k] = body[k];
      const { data, error } = await supabase.from("tickets").update(update).eq("id", id).select("*").maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ data });
    }

    // POST /tickets/:id/comments
    if (segs.length === 3 && segs[2] === "comments" && req.method === "POST") {
      const body = await req.json();
      if (!body.conteudo) return json({ error: "conteudo obrigatório" }, 400);
      const { data, error } = await supabase.from("ticket_comments").insert({
        ticket_id: id,
        conteudo: body.conteudo,
        tipo: body.tipo || "INTERNO",
        autor_nome: body.autor_nome || "API",
      }).select("*").maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ data }, 201);
    }

    // POST /tickets/:id/status
    if (segs.length === 3 && segs[2] === "status" && req.method === "POST") {
      const body = await req.json();
      const status = body.status;
      if (!status) return json({ error: "status obrigatório" }, 400);
      const { data: cur } = await supabase.from("tickets").select("*").eq("id", id).maybeSingle();
      if (!cur) return json({ error: "Not found" }, 404);
      const now = new Date().toISOString();
      const update: Record<string, unknown> = { status };
      const wasPaused = PAUSED.includes(cur.status);
      const willPause = PAUSED.includes(status);
      if (!wasPaused && willPause) update.sla_pausa_inicio = now;
      else if (wasPaused && !willPause && cur.sla_pausa_inicio) {
        update.sla_pausa_total_segundos = (cur.sla_pausa_total_segundos || 0) +
          Math.round((Date.now() - new Date(cur.sla_pausa_inicio).getTime()) / 1000);
        update.sla_pausa_inicio = null;
      }
      if (status === "EM_ATENDIMENTO" && !cur.data_primeiro_atendimento) update.data_primeiro_atendimento = now;
      if (status === "RESOLVIDO" && !cur.data_solucao) update.data_solucao = now;
      if (status === "FECHADO") update.data_fechamento = now;
      const { error } = await supabase.from("tickets").update(update).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      await supabase.from("ticket_history").insert({
        ticket_id: id, campo: "status",
        valor_anterior: cur.status, valor_novo: status,
        autor_nome: body.autor_nome || "API",
      });
      return json({ ok: true });
    }

    // POST /tickets/:id/assign
    if (segs.length === 3 && segs[2] === "assign" && req.method === "POST") {
      const body = await req.json();
      const tecnico_id = body.tecnico_id ?? null;
      const { data: cur } = await supabase.from("tickets").select("tecnico_id").eq("id", id).maybeSingle();
      const { error } = await supabase.from("tickets").update({ tecnico_id }).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      await supabase.from("ticket_history").insert({
        ticket_id: id, campo: "tecnico_id",
        valor_anterior: cur?.tecnico_id?.toString() || null,
        valor_novo: tecnico_id?.toString() || null,
        autor_nome: body.autor_nome || "API",
      });
      return json({ ok: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
