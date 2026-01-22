import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate a base32 secret for TOTP (16 characters = 80 bits, standard for TOTP)
function generateTotpSecret(): string {
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  const randomBytes = new Uint8Array(10); // 10 bytes = 80 bits = 16 base32 chars
  crypto.getRandomValues(randomBytes);
  
  // Convert bytes to base32
  let bits = "";
  for (const byte of randomBytes) {
    bits += byte.toString(2).padStart(8, "0");
  }
  
  // Take 5 bits at a time to create base32 characters
  for (let i = 0; i < 80; i += 5) {
    const chunk = bits.slice(i, i + 5);
    const index = parseInt(chunk, 2);
    secret += base32Chars[index];
  }
  
  return secret; // Returns 16 character base32 string
}

// Generate TOTP code from secret
async function generateTotpCode(secret: string, offset: number = 0): Promise<string> {
  const timeStep = 30;
  const time = Math.floor(Date.now() / 1000 / timeStep) + offset;
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setBigUint64(0, BigInt(time), false);

  // Decode base32 secret
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.toUpperCase()) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  
  // Pad bits to multiple of 8
  while (bits.length % 8 !== 0) {
    bits += "0";
  }
  
  const keyBytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < keyBytes.length; i++) {
    keyBytes[i] = parseInt(bits.slice(i * 8, (i + 1) * 8), 2);
  }

  // HMAC-SHA1
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new Uint8Array(timeBuffer));
  const signatureArray = new Uint8Array(signature);

  // Dynamic truncation
  const offsetIdx = signatureArray[signatureArray.length - 1] & 0x0f;
  const code =
    ((signatureArray[offsetIdx] & 0x7f) << 24) |
    ((signatureArray[offsetIdx + 1] & 0xff) << 16) |
    ((signatureArray[offsetIdx + 2] & 0xff) << 8) |
    (signatureArray[offsetIdx + 3] & 0xff);

  return (code % 1000000).toString().padStart(6, "0");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, action, code } = await req.json();

    if (!userId || !action) {
      return new Response(
        JSON.stringify({ error: "userId e action são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user with email
    const { data: userData, error: fetchError } = await supabase
      .from("tb_usuario")
      .select(`
        user_id,
        nome,
        totp_secret,
        totp_enabled,
        tb_email!inner (email_principal)
      `)
      .eq("user_id", userId)
      .single();

    if (fetchError || !userData) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = (userData.tb_email as unknown as { email_principal: string }).email_principal;

    if (action === "generate") {
      // Generate new TOTP secret (16 chars, valid base32)
      const secret = generateTotpSecret();
      
      console.log("Generated TOTP secret:", secret, "Length:", secret.length);
      
      // Save secret temporarily (not enabled yet)
      const { error: updateError } = await supabase
        .from("tb_usuario")
        .update({ totp_secret: secret })
        .eq("user_id", userId);

      if (updateError) {
        console.error("Error saving TOTP secret:", updateError);
        return new Response(
          JSON.stringify({ error: "Erro ao gerar 2FA" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate QR code URL for Google Authenticator
      // Format: otpauth://totp/LABEL?PARAMETERS
      const issuer = "WebContador";
      const label = `${issuer}:${email}`;
      const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
      
      console.log("Generated otpauth URL:", otpauthUrl);

      return new Response(
        JSON.stringify({
          success: true,
          secret,
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
          otpauthUrl,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      if (!code) {
        return new Response(
          JSON.stringify({ error: "Código é obrigatório para verificação" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!userData.totp_secret) {
        return new Response(
          JSON.stringify({ error: "2FA não configurado. Gere um QR code primeiro." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verify TOTP code (check current and adjacent time windows for clock skew)
      const currentCode = await generateTotpCode(userData.totp_secret, 0);
      const previousCode = await generateTotpCode(userData.totp_secret, -1);
      const nextCode = await generateTotpCode(userData.totp_secret, 1);
      
      console.log("Verifying code:", code, "Expected:", currentCode, "Prev:", previousCode, "Next:", nextCode);

      if (code !== currentCode && code !== previousCode && code !== nextCode) {
        return new Response(
          JSON.stringify({ error: "Código 2FA inválido" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Enable 2FA
      const { error: enableError } = await supabase
        .from("tb_usuario")
        .update({ totp_enabled: true })
        .eq("user_id", userId);

      if (enableError) {
        console.error("Error enabling 2FA:", enableError);
        return new Response(
          JSON.stringify({ error: "Erro ao ativar 2FA" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "2FA ativado com sucesso!" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "disable") {
      const { error: disableError } = await supabase
        .from("tb_usuario")
        .update({ totp_enabled: false, totp_secret: null })
        .eq("user_id", userId);

      if (disableError) {
        console.error("Error disabling 2FA:", disableError);
        return new Response(
          JSON.stringify({ error: "Erro ao desativar 2FA" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "2FA desativado com sucesso" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "status") {
      return new Response(
        JSON.stringify({
          success: true,
          enabled: userData.totp_enabled || false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in 2FA setup:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
