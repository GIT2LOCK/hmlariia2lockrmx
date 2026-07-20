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

  const { data: user, error: userErr } = await supabase
    .from("usuarios")
    .select("id, nome, email, permissao, empresa_id, ativo")
    .eq("id", usuarioId)
    .maybeSingle();

  if (userErr || !user || !user.ativo) return json({ error: "usuario_invalido" }, 403);
  if (!user.empresa_id) return json({ error: "usuario_sem_empresa" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  if (!body?.titulo || !body?.descricao) {
    return json({ error: "titulo_e_descricao_obrigatorios" }, 400);
  }

  const allowedPrio = ["BAIXO", "MEDIO", "ALTO", "CRITICO"];
  const prioridade = allowedPrio.includes(body.prioridade) ? body.prioridade : "MEDIO";

  const payload: Record<string, unknown> = {
    titulo: String(body.titulo).slice(0, 200),
    descricao: String(body.descricao).slice(0, 10000),
    prioridade,
    status: "NOVO",
    tipo_chamado: "T",
    empresa_id: user.empresa_id,            // sempre força a empresa do cliente
    unidade_id: body.unidade_id ?? null,
    categoria_id: body.categoria_id ?? null,
    ativo: body.ativo ?? null,
    origem: "MANUAL",
    solicitante_nome: body.solicitante_nome ?? `${user.nome ?? ""}`.trim(),
    solicitante_email: body.solicitante_email ?? user.email ?? null,
    solicitante_telefone: body.solicitante_telefone ?? null,
    criado_por: user.id,
  };

  const { data, error } = await supabase
    .from("tickets")
    .insert(payload)
    .select("id, codigo")
    .maybeSingle();

  if (error) {
    console.error("[create-ticket-cliente] insert error", error);
    return json({ error: error.message }, 500);
  }

  if (data?.id) {
    supabase.functions.invoke("send-email-notification", {
      body: { ticket_id: data.id, event: "created" },
    }).catch((e) => console.error("[create-ticket-cliente] notify", e));
  }

  return json({ ok: true, ticket: data });
});
