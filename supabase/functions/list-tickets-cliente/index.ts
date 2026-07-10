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
    .select("id, permissao, empresa_id, email, ativo")
    .eq("id", usuarioId)
    .maybeSingle();

  if (!user || !user.ativo) return json({ error: "usuario_invalido" }, 403);
  if (user.permissao !== "CLIENTE") return json({ error: "only_cliente" }, 403);

  // Descobrir unidades vinculadas ao cliente via contatos (match por e-mail)
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
      for (const r of cu ?? []) {
        if (typeof r.unidade_id === "number") directUnits.push(r.unidade_id);
      }
    }

    // Se algum contato cobre empresa inteira, incluir todas as unidades daquela empresa
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

  // Filtro: tickets criados pelo próprio usuário OU solicitante_email = user.email OU pertencentes às suas unidades
  const orClauses = [`criado_por.eq.${usuarioId}`];
  if (user.email) orClauses.push(`solicitante_email.ilike.${user.email}`);
  if (unidadeIds.length > 0) {
    orClauses.push(`unidade_id.in.(${unidadeIds.join(",")})`);
  }

  let query = supabase
    .from("tickets")
    .select(`*,
      empresas:empresa_id(nome_fantasia),
      unidades:unidade_id(nome_unidade),
      usuarios:tecnico_id(nome)`)
    .or(orClauses.join(","))
    .order("data_abertura", { ascending: false })
    .limit(500);

  // Mantém escopo de empresa, se houver
  if (user.empresa_id) query = query.eq("empresa_id", user.empresa_id);

  const { data, error } = await query;

  if (error) return json({ error: error.message }, 500);
  return json({ tickets: data ?? [] });
});
