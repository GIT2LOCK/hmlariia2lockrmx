import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, code } = await req.json();

    if (!userId || !code) {
      return new Response(
        JSON.stringify({ error: "Código e userId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user verification data
    const { data: userData, error: fetchError } = await supabase
      .from("tb_usuario")
      .select("email_verification_token, email_verification_expires, email_id")
      .eq("user_id", userId)
      .single();

    if (fetchError || !userData) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
