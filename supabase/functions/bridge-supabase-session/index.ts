import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Bridges a valid custom Ariia session (auth_token in sessions table) into a
 * Supabase Auth session.
 *
 * Returns a hashed OTP token that the client uses with
 *   supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
 * to establish a real Supabase Auth session for the same user.
 *
 * Authorization: Bearer <custom auth_token>
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token ausente" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // 1. Validate custom session
    const { data: session } = await supabase
      .from("sessions")
      .select("user_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!session) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (new Date(session.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Sessão expirada" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Load usuario
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("id, email, ativo, auth_user_id, totp_enabled")
      .eq("id", session.user_id)
      .maybeSingle();

    if (!usuario || !usuario.ativo) {
      return new Response(JSON.stringify({ error: "Usuário inválido ou inativo" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = String(usuario.email).toLowerCase();

    // 3. Ensure auth.users entry
    let authUserId = usuario.auth_user_id as string | null;
    if (!authUserId) {
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = list?.users?.find(
        (u: any) => (u.email || "").toLowerCase() === email,
      );
      if (existing) {
        authUserId = existing.id;
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (createErr || !created?.user) {
          console.error("[bridge] createUser error", createErr);
          return new Response(JSON.stringify({ error: "Falha ao criar auth user" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        authUserId = created.user.id;
      }
      await supabase.from("usuarios").update({ auth_user_id: authUserId }).eq("id", usuario.id);
    }

    // 4. Generate a magiclink token to be consumed client-side via verifyOtp
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("[bridge] generateLink error", linkErr);
      return new Response(JSON.stringify({ error: "Falha ao gerar link de sessão" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        email,
        token_hash: linkData.properties.hashed_token,
        totp_enabled: !!usuario.totp_enabled,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[bridge] error", e);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
