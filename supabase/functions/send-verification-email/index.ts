import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, userId, nome } = await req.json();

    if (!email || !userId) {
      return new Response(
        JSON.stringify({ error: "E-mail e userId são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const web3formsKey = Deno.env.get("WEB3FORMS_ACCESS_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
