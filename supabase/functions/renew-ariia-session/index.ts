import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createSession } from "../_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Sessão Supabase ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return new Response(JSON.stringify({ error: "Configuração Supabase ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await authClient.auth.getUser(jwt);
    const authUser = authData?.user;
    if (authError || !authUser) {
      return new Response(JSON.stringify({ error: "Sessão Supabase inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = (authUser.email || "").trim().toLowerCase();
    if (!email) {
      return new Response(JSON.stringify({ error: "Usuário Supabase sem e-mail" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let { data: usuario } = await serviceClient
      .from("usuarios")
      .select("id, nome, email, permissao, ativo, auth_user_id")
      .eq("auth_user_id", authUser.id)
      .maybeSingle();

    if (!usuario) {
      const { data: byEmail } = await serviceClient
        .from("usuarios")
        .select("id, nome, email, permissao, ativo, auth_user_id")
        .ilike("email", email)
        .maybeSingle();
      usuario = byEmail;
    }

    if (!usuario || !usuario.ativo) {
      return new Response(JSON.stringify({ error: "Usuário Ariia inválido ou inativo" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!usuario.auth_user_id) {
      await serviceClient.from("usuarios").update({ auth_user_id: authUser.id }).eq("id", usuario.id);
    } else if (usuario.auth_user_id !== authUser.id) {
      return new Response(JSON.stringify({ error: "Sessão Supabase pertence a outro usuário" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await createSession(serviceClient, usuario.id, req);
    if (!session) {
      return new Response(JSON.stringify({ error: "Falha ao renovar sessão Ariia" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      user: { id: usuario.id, nome: usuario.nome, email: usuario.email, permissao: usuario.permissao },
      session,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[renew-ariia-session] error", error);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});