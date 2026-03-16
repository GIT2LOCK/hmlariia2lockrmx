import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode as base32Decode } from "https://deno.land/std@0.168.0/encoding/base32.ts";
import { createSession } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function generateTOTP(secret: string, timeStep: number): Promise<string> {
  const key = base32Decode(secret);
  const time = Math.floor(timeStep);
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setUint32(4, time);

  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const hmac = await crypto.subtle.sign("HMAC", cryptoKey, timeBuffer);
  const hmacArray = new Uint8Array(hmac);

  const offset = hmacArray[hmacArray.length - 1] & 0x0f;
  const code = ((hmacArray[offset] & 0x7f) << 24 | (hmacArray[offset + 1] & 0xff) << 16 |
    (hmacArray[offset + 2] & 0xff) << 8 | (hmacArray[offset + 3] & 0xff)) % 1000000;

  return code.toString().padStart(6, "0");
}

async function verifyTOTP(secret: string, token: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000 / 30);
  for (let i = -1; i <= 1; i++) {
    const generated = await generateTOTP(secret, now + i);
    if (generated === token) return true;
  }
  return false;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, code, isSetup, setupToken } = await req.json();

    if (!code) {
      return new Response(JSON.stringify({ error: "Código é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let targetUserId = userId;

    // If setupToken (post-signup), resolve userId
    if (setupToken && !userId) {
      const { data: session } = await supabase
        .from("sessions").select("user_id").eq("token", setupToken).maybeSingle();
      if (!session) {
        return new Response(JSON.stringify({ error: "Token inválido" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      targetUserId = session.user_id;
    }

    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "userId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get user with TOTP secret
    const { data: user, error: userError } = await supabase
      .from("usuarios").select("id, nome, email, permissao, totp_secret, totp_enabled")
      .eq("id", targetUserId).maybeSingle();

    if (userError || !user || !user.totp_secret) {
      return new Response(JSON.stringify({ error: "2FA não configurado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const isValid = await verifyTOTP(user.totp_secret, code);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "Código inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // If this is setup flow, enable TOTP
    if (isSetup) {
      await supabase.from("usuarios").update({ totp_enabled: true }).eq("id", targetUserId);
    }

    // Create session
    const session = await createSession(supabase, targetUserId, req);
    if (!session) {
      return new Response(JSON.stringify({ error: "Erro ao criar sessão" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      success: true,
      message: isSetup ? "2FA ativado com sucesso" : "Verificação concluída",
      user: { id: user.id, nome: user.nome, email: user.email, permissao: user.permissao },
      session,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Verify 2FA error:", error);
    return new Response(JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
