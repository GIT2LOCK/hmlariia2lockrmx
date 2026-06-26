import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSession } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

  let ticketId: number | null = null;
  try {
    const body = await req.json();
    ticketId = Number(body?.ticket_id);
  } catch {
    // ignore
  }
  if (!ticketId || Number.isNaN(ticketId)) return json({ error: "ticket_id_invalido" }, 400);

  const { data: user } = await supabase
    .from("usuarios")
    .select("id, permissao, empresa_id, email, ativo")
    .eq("id", usuarioId)
    .maybeSingle();

  if (!user || !user.ativo) return json({ error: "usuario_invalido" }, 403);

  const { data: ticket, error: tErr } = await supabase
    .from("tickets")
    .select(`*,
      empresas:empresa_id(nome_fantasia),
      unidades:unidade_id(nome_unidade),
      operadoras:operadora_id(nome),
      usuarios:tecnico_id(nome,email),
      ticket_filas:fila_id(nome),
      ticket_categorias:categoria_id(nome)`)
    .eq("id", ticketId)
    .maybeSingle();

  if (tErr) return json({ error: tErr.message }, 500);
  if (!ticket) return json({ error: "nao_encontrado" }, 404);

  const perm = user.permissao;
  const isAdmin = perm === "SUPERADMIN" || perm === "ADMIN";
  let autorizado = isAdmin;

  if (!autorizado && perm === "CLIENTE") {
    const unidadeIds: number[] = [];
    if (user.email) {
      const { data: contatos } = await supabase
        .from("contatos")
        .select("id, unidade_id, cobre_empresa_inteira, empresa_id")
        .ilike("email", user.email);
      for (const c of contatos ?? []) {
        if (typeof c.unidade_id === "number") unidadeIds.push(c.unidade_id);
      }
      const contatoIds = (contatos ?? []).map((c: any) => c.id);
      if (contatoIds.length > 0) {
        const { data: cu } = await supabase
          .from("contato_unidades")
          .select("unidade_id")
          .in("contato_id", contatoIds);
        for (const r of cu ?? []) if (typeof r.unidade_id === "number") unidadeIds.push(r.unidade_id);
      }
      const empresasCobertura = (contatos ?? [])
        .filter((c: any) => c.cobre_empresa_inteira && c.empresa_id)
        .map((c: any) => c.empresa_id);
      if (empresasCobertura.length > 0) {
        const { data: us } = await supabase.from("unidades").select("id").in("empresa_id", empresasCobertura);
        for (const r of us ?? []) unidadeIds.push((r as any).id);
      }
    }
    const ownsTicket = ticket.criado_por === usuarioId;
    const inUnits = ticket.unidade_id && unidadeIds.includes(ticket.unidade_id);
    const sameEmpresa = !user.empresa_id || ticket.empresa_id === user.empresa_id;
    autorizado = sameEmpresa && (ownsTicket || !!inUnits);
  } else if (!autorizado) {
    // Técnico/USER: dono, atribuído, ou membro do grupo
    if (ticket.criado_por === usuarioId || ticket.tecnico_id === usuarioId || ticket.assigned_by === usuarioId) {
      autorizado = true;
    } else if (ticket.assigned_group_id) {
      const { data: m } = await supabase
        .from("support_group_members")
        .select("usuario_id")
        .eq("group_id", ticket.assigned_group_id)
        .eq("usuario_id", usuarioId)
        .eq("ativo", true)
        .maybeSingle();
      autorizado = !!m;
    }
  }

  if (!autorizado) return json({ error: "sem_acesso" }, 403);

  const [c, h, a] = await Promise.all([
    supabase.from("ticket_comments").select("*").eq("ticket_id", ticketId).order("criado_em", { ascending: true }),
    supabase.from("ticket_history").select("*").eq("ticket_id", ticketId).order("criado_em", { ascending: false }),
    supabase.from("ticket_attachments").select("*").eq("ticket_id", ticketId).order("criado_em", { ascending: false }),
  ]);

  return json({
    ticket,
    comments: c.data ?? [],
    history: h.data ?? [],
    attachments: a.data ?? [],
  });
});
