import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSession } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate session - user can only verify their own email
    let userId: number;
    try {
      userId = await validateSession(req, supabase);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Não autorizado";
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { code } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Código é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user verification data
    const { data: userData, error: fetchError } = await supabase
      .from("tb_usuario")
      .select("email_verification_token, email_verification_expires, email_id, verification_attempts, last_verification_attempt")
      .eq("user_id", userId)
      .single();

    if (fetchError || !userData) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check rate limiting
    const lastAttempt = userData.last_verification_attempt ? new Date(userData.last_verification_attempt) : null;
    const attempts = userData.verification_attempts || 0;
    const lockoutTime = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000);

    // Reset attempts if lockout period has passed
    const effectiveAttempts = lastAttempt && lastAttempt < lockoutTime ? 0 : attempts;

    if (effectiveAttempts >= MAX_ATTEMPTS) {
      const retryAfter = lastAttempt 
        ? Math.ceil((lastAttempt.getTime() + LOCKOUT_MINUTES * 60 * 1000 - Date.now()) / 1000)
        : LOCKOUT_MINUTES * 60;
      
      return new Response(
        JSON.stringify({ 
          error: `Muitas tentativas. Tente novamente em ${Math.ceil(retryAfter / 60)} minutos.`,
          retryAfter 
        }),
        { 
          status: 429, 
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": retryAfter.toString()
          } 
        }
      );
    }

    // Update attempt count
    await supabase
      .from("tb_usuario")
      .update({ 
        verification_attempts: effectiveAttempts + 1,
        last_verification_attempt: new Date().toISOString()
      })
      .eq("user_id", userId);

    // Check if code matches
    if (userData.email_verification_token !== code) {
      return new Response(
        JSON.stringify({ error: "Código de verificação incorreto" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if code is expired
    if (new Date(userData.email_verification_expires) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Código de verificação expirado. Solicite um novo código." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update user as verified
    const { error: updateUserError } = await supabase
      .from("tb_usuario")
      .update({
        email_verificado: true,
        email_verification_token: null,
        email_verification_expires: null,
      })
      .eq("user_id", userId);

    if (updateUserError) {
      console.error("Error updating user verification:", updateUserError);
      return new Response(
        JSON.stringify({ error: "Erro ao verificar e-mail" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update email as verified
    await supabase
      .from("tb_email")
      .update({ verificado: true })
      .eq("email_id", userData.email_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "E-mail verificado com sucesso!" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error verifying email:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
