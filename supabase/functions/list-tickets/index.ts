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

  const { data: user } = await supabase
    .from("usuarios")
    .select("id, permissao, empresa_id, email, ativo, access_scope")
    .eq("id", usuarioId)
    .maybeSingle();

  if (!user || !user.ativo) return json({ error: "usuario_invalido" }, 403);
  if (user.access_scope === "BLOCKED" || user.access_scope === "GRAFANA_ONLY") {
    return json({ error: "no_access" }, 403);
  }

  const selectCols = `*,
    empresas:empresa_id(nome_fantasia),
    unidades:unidade_id(nome_unidade),
    usuarios:tecnico_id(nome)`;

  const perm = user.permissao;

  // ADMIN / SUPERADMIN: todos os chamados, sem filtro
  if (perm === "SUPERADMIN" || perm === "ADMIN") {
    const { data, error } = await supabase
      .from("tickets")
      .select(selectCols)
      .order("data_abertura", { ascending: false })
      .limit(500);
    if (error) return json({ error: error.message }, 500);
    return json({ tickets: data ?? [] });
  }

  // CLIENTE: criados pelo próprio OU unidades vinculadas via contatos, escopo empresa
  if (perm === "CLIENTE") {
    let unidadeIds: number[] = [];
    if (user.email) {
      const { data: contatos } = await supabase
        .from("contatos")
        .select("id, unidade_id, cobre_empresa_inteira, empresa_id")
        .ilike("email", user.email);
      const directUnits = (contatos ?? [])
        .map((c: any) => c.unidade_id)
        .filter((v: any): v is number => typeof v === "number");
      const contatoIds = (contatos ?? []).map((c: any) => c.id);
      if (contatoIds.length > 0) {
        const { data: cu } = await supabase
          .from("contato_unidades")
          .select("unidade_id")
          .in("contato_id", contatoIds);
        for (const r of cu ?? []) if (typeof r.unidade_id === "number") directUnits.push(r.unidade_id);
      }
      const empresasCobertura = (contatos ?? [])
        .filter((c: any) => c.cobre_empresa_inteira && c.empresa_id)
        .map((c: any) => c.empresa_id);
      if (empresasCobertura.length > 0) {
        const { data: us } = await supabase
          .from("unidades")
          .select("id")
          .in("empresa_id", empresasCobertura);
        for (const r of us ?? []) directUnits.push(r.id);
      }
      unidadeIds = Array.from(new Set(directUnits));
    }
    const orClauses = [`criado_por.eq.${usuarioId}`];
    if (user.email) {
      orClauses.push(`solicitante_email.ilike.${user.email}`);
      orClauses.push(`solicitante_emails_extra.cs.{${user.email.toLowerCase()}}`);
    }
    if (unidadeIds.length > 0) orClauses.push(`unidade_id.in.(${unidadeIds.join(",")})`);
    const q = supabase
      .from("tickets")
      .select(selectCols)
      .or(orClauses.join(","))
      .order("data_abertura", { ascending: false })
      .limit(500);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ tickets: data ?? [] });
  }

  // TECNICO / outros: tickets onde é técnico, criou, atribuiu, ou grupo de suporte
  const { data: groups } = await supabase
    .from("support_group_members")
    .select("group_id")
    .eq("usuario_id", usuarioId)
    .eq("ativo", true);
  const groupIds = (groups ?? []).map((g: any) => g.group_id).filter(Boolean);

  const orClauses = [
    `tecnico_id.eq.${usuarioId}`,
    `criado_por.eq.${usuarioId}`,
    `assigned_by.eq.${usuarioId}`,
  ];
  if (user.email) {
    orClauses.push(`solicitante_email.ilike.${user.email}`);
    orClauses.push(`solicitante_emails_extra.cs.{${user.email.toLowerCase()}}`);
  }
  if (groupIds.length > 0) orClauses.push(`assigned_group_id.in.(${groupIds.join(",")})`);

  const { data, error } = await supabase
    .from("tickets")
    .select(selectCols)
    .or(orClauses.join(","))
    .order("data_abertura", { ascending: false })
    .limit(500);
  if (error) return json({ error: error.message }, 500);
  return json({ tickets: data ?? [] });
});
