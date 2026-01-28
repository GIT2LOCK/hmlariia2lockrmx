import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSession } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a cryptographically secure 6-digit verification code
function generateVerificationCode(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return (100000 + (array[0] % 900000)).toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const web3formsKey = Deno.env.get("WEB3FORMS_ACCESS_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate session - user can only send verification to their own email
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

    // Get user's email from database (don't trust client-provided email)
    const { data: userData, error: userError } = await supabase
      .from("tb_usuario")
      .select("nome, tb_email!inner(email_principal)")
      .eq("user_id", userId)
      .single();

    if (userError || !userData) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = (userData.tb_email as unknown as { email_principal: string }).email_principal;
    const nome = userData.nome;

    // Generate verification code and expiration (15 minutes)
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Update user with verification token
    const { error: updateError } = await supabase
      .from("tb_usuario")
      .update({
        email_verification_token: verificationCode,
        email_verification_expires: expiresAt,
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating verification token:", updateError);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar código de verificação" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send verification email using Web3Forms
    const emailResponse = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        access_key: web3formsKey,
        to: email,
        from_name: "Web Contador",
        subject: "Verifique seu e-mail - Web Contador",
        message: `
Olá, ${nome || "usuário"}!

Bem-vindo ao Web Contador! Para completar seu cadastro, use o código abaixo:

═══════════════════════
    ${verificationCode}
═══════════════════════

Este código expira em 15 minutos.

Se você não solicitou este código, ignore este e-mail.

--
Web Contador
© ${new Date().getFullYear()} Todos os direitos reservados.
        `.trim(),
      }),
    });

    const emailResult = await emailResponse.json();
    console.log("Web3Forms response:", emailResult);

    if (!emailResult.success) {
      console.error("Web3Forms error:", emailResult);
      return new Response(
        JSON.stringify({ error: "Erro ao enviar e-mail de verificação" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Código de verificação enviado para o e-mail" 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error sending verification email:", error);
    return new Response(
      JSON.stringify({ error: "Erro ao enviar e-mail de verificação" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
