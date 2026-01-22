import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

// Generate session token
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, code } = await req.json();

    if (!userId || !code) {
      return new Response(
        JSON.stringify({ error: "userId e código são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user with TOTP secret and permission
    const { data: userData, error: fetchError } = await supabase
      .from("tb_usuario")
      .select(`
        user_id,
        nome,
        totp_secret,
        totp_enabled,
        permissao_id,
        tb_permissao!inner (nome, descricao)
      `)
      .eq("user_id", userId)
      .single();

    if (fetchError || !userData) {
      return new Response(
        JSON.stringify({ error: "Usuário não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userData.totp_enabled || !userData.totp_secret) {
      return new Response(
        JSON.stringify({ error: "2FA não está ativado para este usuário" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify TOTP code (check current and adjacent time windows for clock skew)
    const currentCode = await generateTotpCode(userData.totp_secret, 0);
    const previousCode = await generateTotpCode(userData.totp_secret, -1);
    const nextCode = await generateTotpCode(userData.totp_secret, 1);

    if (code !== currentCode && code !== previousCode && code !== nextCode) {
      return new Response(
        JSON.stringify({ error: "Código 2FA inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Extract permission data
    const permissao = userData.tb_permissao as unknown as { nome: string; descricao: string } | null;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login realizado com sucesso",
        user: {
          id: userData.user_id,
          nome: userData.nome,
          permissao: permissao?.nome || "VIEWER",
          permissao_descricao: permissao?.descricao,
        },
        session: {
          token: sessionToken,
          expires_at: expiresAt,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error verifying 2FA:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
