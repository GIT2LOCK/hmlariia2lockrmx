import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base32Encode } from "https://deno.land/std@0.168.0/encoding/base32.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateTOTPSecret(): string {
  const array = new Uint8Array(10); // 80 bits = 16 chars base32
  crypto.getRandomValues(array);
  return base32Encode(array).replace(/=/g, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, setupToken } = await req.json();

    if (!userId && !setupToken) {
      return new Response(JSON.stringify({ error: "userId ou setupToken é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let targetUserId = userId;

    // If setupToken provided (post-signup flow), validate it
    if (setupToken && !userId) {
      const { data: session } = await supabase
        .from("sessions").select("user_id").eq("token", setupToken).maybeSingle();
      if (!session) {
        return new Response(JSON.stringify({ error: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      targetUserId = session.user_id;
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from("usuarios").select("id, nome, email, totp_enabled").eq("id", targetUserId).maybeSingle();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Generate secret
    const secret = generateTOTPSecret();

    // Store secret (not enabled yet)
    await supabase.from("usuarios").update({ totp_secret: secret }).eq("id", targetUserId);

    // Build otpauth URI
    const issuer = "AriiaWebApp";
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;

    return new Response(JSON.stringify({
      success: true, secret, otpauthUrl,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Setup 2FA error:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
