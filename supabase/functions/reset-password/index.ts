import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hashPassword } from "../_shared/auth.ts";

// TOTP verification helpers (same logic as in verify-2fa)
function base32ToUint8Array(base32: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = base32.toUpperCase().replace(/=+$/, "");
  let bits = "";
  for (const char of clean) {
    const idx = alphabet.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

async function generateTOTP(secret: string, counter: number): Promise<string> {
  const keyBytes = base32ToUint8Array(secret);
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setBigUint64(0, BigInt(counter), false);

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const hmacResult = new Uint8Array(await crypto.subtle.sign("HMAC", key, counterBuffer));
  const offset = hmacResult[19] & 0x0f;
  const binary =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);
  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

function normalizeEmail(input: unknown): string {
  return String(input ?? "").trim().toLowerCase();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, totpCode, newPassword } = await req.json();
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !totpCode || !newPassword) {
      return new Response(
        JSON.stringify({ error: "Email, código TOTP e nova senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 8) {
      return new Response(
        JSON.stringify({ error: "A nova senha deve ter pelo menos 8 caracteres" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Lookup user by email
    const { data: emailData, error: emailError } = await supabase
      .from("tb_email")
      .select("email_id")
      .or(
        `email_principal.ilike.${normalizedEmail},email_secundario.ilike.${normalizedEmail},email_alternativo.ilike.${normalizedEmail}`
      )
      .order("email_id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (emailError || !emailData) {
      console.log("[reset-password] email not found");
      return new Response(
        JSON.stringify({ error: "E-mail não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: userData, error: userError } = await supabase
      .from("tb_usuario")
      .select("user_id, totp_enabled, totp_secret")
      .eq("email_id", emailData.email_id)
      .maybeSingle();

    if (userError || !userData) {
      console.log("[reset-password] user not found by email_id");
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userData.totp_enabled || !userData.totp_secret) {
      return new Response(
        JSON.stringify({ error: "Este usuário não possui 2FA habilitado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate TOTP code with ±1 window
    const now = Math.floor(Date.now() / 1000);
    const counter = Math.floor(now / 30);
    let valid = false;
    for (let i = -1; i <= 1; i++) {
      const expected = await generateTOTP(userData.totp_secret, counter + i);
      if (expected === totpCode) {
        valid = true;
        break;
      }
    }

    if (!valid) {
      console.log("[reset-password] invalid TOTP", { user_id: userData.user_id });
      return new Response(
        JSON.stringify({ error: "Código TOTP inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash new password with PBKDF2
    const newHash = await hashPassword(newPassword);

    const { error: updateError } = await supabase
      .from("tb_usuario")
      .update({ senha: newHash })
      .eq("user_id", userData.user_id);

    if (updateError) {
      console.error("[reset-password] update error", { message: updateError.message });
      return new Response(
        JSON.stringify({ error: "Erro ao atualizar senha" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[reset-password] password reset successfully", { user_id: userData.user_id });

    return new Response(
      JSON.stringify({ success: true, message: "Senha atualizada com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[reset-password] error", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
