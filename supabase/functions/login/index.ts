import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyPasswordHybrid, createSession } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, senha, deviceToken } = await req.json();

    if (!email || !senha) {
      return new Response(
        JSON.stringify({ error: "E-mail e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find email
    const { data: emailData } = await supabase
      .from("tb_email")
      .select("email_id")
      .eq("email_principal", email)
      .maybeSingle();

    if (!emailData) {
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user by email_id
    const { data: userData } = await supabase
      .from("tb_usuario")
      .select(`
        user_id,
        nome,
        senha,
        ativo,
        permissao_id,
        email_verificado,
        totp_enabled,
        tb_permissao!inner (nome, descricao)
      `)
      .eq("email_id", emailData.email_id)
      .maybeSingle();

    if (!userData) {
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is active
    if (!userData.ativo) {
      return new Response(
        JSON.stringify({ error: "Usuário inativo. Entre em contato com o administrador." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify password using hybrid method (supports both old and new formats)
    const isValidPassword = await verifyPasswordHybrid(
      senha,
      userData.senha,
      userData.user_id,
      supabase
    );

    if (!isValidPassword) {
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if 2FA is enabled (mandatory)
    if (userData.totp_enabled) {
      // Check if device is trusted (remembered)
      if (deviceToken) {
        const { data: trustedDevice } = await supabase
          .from("tb_dispositivo")
          .select("dispositivo_id, remember_until")
          .eq("user_id", userData.user_id)
          .eq("device_token", deviceToken)
          .eq("is_active", true)
          .maybeSingle();

        // If device is trusted and not expired, skip 2FA
        if (trustedDevice && trustedDevice.remember_until) {
          const rememberUntil = new Date(trustedDevice.remember_until);
          if (rememberUntil > new Date()) {
            // Update last activity
            await supabase
              .from("tb_dispositivo")
              .update({ last_activity: new Date().toISOString() })
              .eq("dispositivo_id", trustedDevice.dispositivo_id);

            // Create server-side session
            const session = await createSession(supabase, userData.user_id, req);
            if (!session) {
              return new Response(
                JSON.stringify({ error: "Erro ao criar sessão" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            const permissao = userData.tb_permissao as unknown as { nome: string; descricao: string } | null;

            return new Response(
              JSON.stringify({
                success: true,
                message: "Login realizado com sucesso",
                user: {
                  id: userData.user_id,
                  nome: userData.nome,
                  email: email,
                  permissao: permissao?.nome || "VIEWER",
                  permissao_descricao: permissao?.descricao,
                },
                session,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // 2FA required
      return new Response(
        JSON.stringify({
          success: false,
          requires2FA: true,
          user: {
            id: userData.user_id,
            nome: userData.nome,
          },
          message: "Digite o código do seu autenticador.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create server-side session
    const session = await createSession(supabase, userData.user_id, req);
    if (!session) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar sessão" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract permission data (it's an object due to !inner join)
    const permissao = userData.tb_permissao as unknown as { nome: string; descricao: string } | null;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login realizado com sucesso",
        user: {
          id: userData.user_id,
          nome: userData.nome,
          email: email,
          permissao: permissao?.nome || "VIEWER",
          permissao_descricao: permissao?.descricao,
        },
        session,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
