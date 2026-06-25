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
    .select("id, permissao, empresa_id, ativo")
    .eq("id", usuarioId)
    .maybeSingle();

  if (!user || !user.ativo) return json({ error: "usuario_invalido" }, 403);
  if (user.permissao !== "CLIENTE") return json({ error: "only_cliente" }, 403);
  if (!user.empresa_id) return json({ tickets: [] });

  const { data, error } = await supabase
    .from("tickets")
    .select(`*,
      empresas:empresa_id(nome_fantasia),
      unidades:unidade_id(nome_unidade),
      usuarios:tecnico_id(nome)`)
    .eq("empresa_id", user.empresa_id)
    .order("data_abertura", { ascending: false })
    .limit(500);

  if (error) return json({ error: error.message }, 500);
  return json({ tickets: data ?? [] });
});
