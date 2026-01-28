import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createSession } from "../_shared/auth.ts";

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

// Parse User-Agent to detect device type, browser, and OS
function parseUserAgent(userAgent: string): { deviceType: string; browser: string; os: string } {
  let deviceType = "desktop";
  let browser = "Desconhecido";
  let os = "Desconhecido";

  // Detect device type
  if (/Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    if (/iPad|Tablet/i.test(userAgent)) {
      deviceType = "tablet";
    } else {
      deviceType = "mobile";
    }
  }

  // Detect browser
  if (userAgent.includes("Firefox")) {
    browser = "Firefox";
  } else if (userAgent.includes("Edg")) {
    browser = "Edge";
  } else if (userAgent.includes("Chrome")) {
    browser = "Chrome";
  } else if (userAgent.includes("Safari")) {
    browser = "Safari";
  } else if (userAgent.includes("Opera") || userAgent.includes("OPR")) {
    browser = "Opera";
  }

  // Detect OS
  if (userAgent.includes("Windows")) {
    os = "Windows";
  } else if (userAgent.includes("Mac OS")) {
    os = "macOS";
  } else if (userAgent.includes("Linux")) {
    os = "Linux";
  } else if (userAgent.includes("Android")) {
    os = "Android";
  } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    os = "iOS";
  }

  return { deviceType, browser, os };
}

// Get location from IP using free API
async function getLocationFromIp(ip: string): Promise<{ country: string; state: string; city: string }> {
  try {
    // Skip local IPs
    if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
      return { country: "Local", state: "", city: "" };
    }

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=country,regionName,city`);
    if (response.ok) {
      const data = await response.json();
      return {
        country: data.country || "Desconhecido",
        state: data.regionName || "",
        city: data.city || "",
      };
    }
  } catch (error) {
    console.error("Error getting location:", error);
  }
  return { country: "Desconhecido", state: "", city: "" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, code, rememberDevice, deviceToken, userAgent } = await req.json();

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
        tb_permissao!inner (nome, descricao),
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

    // Get IP address from request headers
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || req.headers.get("x-real-ip") 
      || req.headers.get("cf-connecting-ip")
      || "Desconhecido";

    // Parse user agent
    const uaString = userAgent || req.headers.get("user-agent") || "";
    const { deviceType, browser, os } = parseUserAgent(uaString);

    // Get location from IP
    const location = await getLocationFromIp(ipAddress);

    // Calculate remember_until if rememberDevice is true
    const rememberUntil = rememberDevice 
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
      : null;

    // Save or update device info
    if (deviceToken) {
      const { data: existingDevice } = await supabase
        .from("tb_dispositivo")
        .select("dispositivo_id")
        .eq("user_id", userId)
        .eq("device_token", deviceToken)
        .maybeSingle();

      if (existingDevice) {
        // Update existing device
        await supabase
          .from("tb_dispositivo")
          .update({
            ip_address: ipAddress,
            location_country: location.country,
            location_state: location.state,
            location_city: location.city,
            device_type: deviceType,
            browser_name: browser,
            os_name: os,
            last_activity: new Date().toISOString(),
            remember_until: rememberUntil,
            is_active: true,
          })
          .eq("dispositivo_id", existingDevice.dispositivo_id);
      } else {
        // Insert new device
        await supabase.from("tb_dispositivo").insert({
          user_id: userId,
          device_token: deviceToken,
          ip_address: ipAddress,
          location_country: location.country,
          location_state: location.state,
          location_city: location.city,
          device_type: deviceType,
          browser_name: browser,
          os_name: os,
          login_at: new Date().toISOString(),
          last_activity: new Date().toISOString(),
          remember_until: rememberUntil,
          is_active: true,
        });
      }
    }

    // Create server-side session
    const session = await createSession(supabase, userData.user_id, req);
    if (!session) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar sessão" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract permission data
    const permissao = userData.tb_permissao as unknown as { nome: string; descricao: string } | null;
    const emailData = userData.tb_email as unknown as { email_principal: string } | null;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login realizado com sucesso",
        user: {
          id: userData.user_id,
          nome: userData.nome,
          email: emailData?.email_principal,
          permissao: permissao?.nome || "VIEWER",
          permissao_descricao: permissao?.descricao,
        },
        session,
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
