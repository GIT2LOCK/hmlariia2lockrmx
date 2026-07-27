import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_RENEW_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    const ariiaToken = (req.headers.get("x-ariia-token") || "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Sessão Supabase ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!ariiaToken) {
      return new Response(JSON.stringify({ error: "Sessão Ariia ausente" }), {
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

    const { data: ariiaSession } = await serviceClient
      .from("sessions")
      .select("user_id, expires_at, last_activity, criado_em")
      .eq("token", ariiaToken)
      .maybeSingle();

    if (!ariiaSession) {
      return new Response(JSON.stringify({ error: "Sessão Ariia inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const expiresAtMs = new Date(ariiaSession.expires_at).getTime();
    const activityAtMs = new Date(ariiaSession.last_activity || ariiaSession.criado_em || ariiaSession.expires_at).getTime();
    if (expiresAtMs < now.getTime() && activityAtMs < now.getTime() - SESSION_RENEW_GRACE_MS) {
      await serviceClient.from("sessions").delete().eq("token", ariiaToken);
      return new Response(JSON.stringify({ error: "Sessão Ariia expirada" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: usuario } = await serviceClient
      .from("usuarios")
      .select("id, nome, email, permissao, ativo, auth_user_id")
      .eq("id", ariiaSession.user_id)
      .maybeSingle();

    if (!usuario || !usuario.ativo) {
      return new Response(JSON.stringify({ error: "Usuário Ariia inválido ou inativo" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!usuario.auth_user_id) {
      if ((usuario.email || "").trim().toLowerCase() !== email) {
        return new Response(JSON.stringify({ error: "Sessões pertencem a usuários diferentes" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await serviceClient.from("usuarios").update({ auth_user_id: authUser.id }).eq("id", usuario.id);
    } else if (usuario.auth_user_id !== authUser.id) {
      return new Response(JSON.stringify({ error: "Sessão Supabase pertence a outro usuário" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const renewedExpiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    await serviceClient
      .from("sessions")
      .update({ expires_at: renewedExpiresAt, last_activity: now.toISOString() })
      .eq("token", ariiaToken);

    return new Response(JSON.stringify({
      success: true,
      user: { id: usuario.id, nome: usuario.nome, email: usuario.email, permissao: usuario.permissao },
      session: { token: ariiaToken, expires_at: renewedExpiresAt },
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