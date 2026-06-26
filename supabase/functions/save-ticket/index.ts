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

const ALLOWED_FIELDS = [
  "titulo","descricao","prioridade","status","empresa_id","unidade_id",
  "operadora_id","fila_id","categoria_id","subcategoria_id","tecnico_id",
  "solicitante_nome","solicitante_email","solicitante_telefone","ativo",
  "origem","tipo_chamado","sla_atendimento_minutos","sla_solucao_minutos",
  "assigned_group_id","nivel_escalonamento","link_id",
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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

  const { data: user } = await supabase
    .from("usuarios")
    .select("id, permissao, empresa_id, ativo, access_scope")
    .eq("id", usuarioId)
    .maybeSingle();

  if (!user || !user.ativo) return json({ error: "usuario_invalido" }, 403);
  if (user.access_scope === "BLOCKED" || user.access_scope === "GRAFANA_ONLY") {
    return json({ error: "no_access" }, 403);
  }
  if (user.permissao === "VIEWER" || user.permissao === "TV_VIEW") {
    return json({ error: "forbidden" }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const ticketId: number | null = body?.ticket_id ? Number(body.ticket_id) : null;
  const payload: Record<string, any> = {};
  for (const k of ALLOWED_FIELDS) {
    if (k in (body?.payload ?? {})) payload[k] = body.payload[k];
  }
  if (!payload.titulo || typeof payload.titulo !== "string" || !payload.titulo.trim()) {
    return json({ error: "titulo_obrigatorio" }, 400);
  }

  // CLIENTE não pode criar/editar por esta função (tem fluxo próprio)
  if (user.permissao === "CLIENTE") return json({ error: "forbidden" }, 403);

  // USER: só pode criar/editar tickets dentro do seu escopo
  if (user.permissao === "USER" && ticketId) {
    const { data: t } = await supabase
      .from("tickets")
      .select("id, tecnico_id, criado_por, assigned_by, assigned_group_id")
      .eq("id", ticketId).maybeSingle();
    if (!t) return json({ error: "nao_encontrado" }, 404);
    let ok = t.tecnico_id === usuarioId || t.criado_por === usuarioId || t.assigned_by === usuarioId;
    if (!ok && t.assigned_group_id) {
      const { data: m } = await supabase
        .from("support_group_members").select("usuario_id")
        .eq("group_id", t.assigned_group_id).eq("usuario_id", usuarioId)
        .eq("ativo", true).maybeSingle();
      ok = !!m;
    }
    if (!ok) return json({ error: "sem_acesso" }, 403);
  }

  let savedId = ticketId;
  if (ticketId) {
    const { error } = await supabase.from("tickets").update(payload).eq("id", ticketId);
    if (error) return json({ error: error.message }, 500);
  } else {
    payload.criado_por = usuarioId;
    const { data, error } = await supabase.from("tickets").insert(payload).select("id").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    savedId = data?.id ?? null;
  }

  return json({ ok: true, ticket_id: savedId });
});
