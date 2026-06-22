import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WEBHOOK_URL = "https://autom.2lock.app.br/webhook-test/8133acad-5def-4bf4-9c6a-c6df08ec969d";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") || "https://ariia.2lock.com.br";
const TOKEN_TTL_MINUTES = 30;

function genericResponse() {
  return new Response(
    JSON.stringify({
      ok: true,
      message: "Se este e-mail estiver cadastrado, enviaremos as instruções para redefinição de senha.",
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
  );
}

function randomTokenHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: "invalid_email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Rate limit: max 3 solicitações por e-mail nos últimos 15 minutos
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from("password_reset_tokens")
      .select("id", { count: "exact", head: true })
      .ilike("email", email)
      .gte("created_at", since);

    if ((recentCount ?? 0) >= 3) {
      // Mensagem genérica mesmo no rate-limit
      return genericResponse();
    }

    const { data: user } = await supabase
      .from("usuarios")
      .select("id, nome, email, ativo, auth_user_id")
      .ilike("email", email)
      .maybeSingle();

    if (!user || !user.ativo) {
      // Não revelar existência
      return genericResponse();
    }

    // Invalidar tokens pendentes anteriores
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("usuario_id", user.id)
      .is("used_at", null);

    const token = randomTokenHex(32);
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();
    const requestedAt = new Date().toISOString();

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const ua = req.headers.get("user-agent") || null;

    const { error: insErr } = await supabase.from("password_reset_tokens").insert({
      usuario_id: user.id,
      auth_user_id: user.auth_user_id,
      email: user.email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      request_ip: ip,
      user_agent: ua,
    });
    if (insErr) {
      console.error("[request-password-reset] insert error", insErr);
      return genericResponse();
    }

    const resetUrl = `${APP_BASE_URL}/redefinir-senha?token=${token}`;

    // Webhook (não bloqueia a resposta em caso de falha)
    try {
      await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "password_reset_requested",
          email: user.email,
          nome: user.nome,
          usuario_id: user.id,
          reset_url: resetUrl,
          expires_at: expiresAt,
          requested_at: requestedAt,
        }),
      });
    } catch (e) {
      console.error("[request-password-reset] webhook error", e);
    }

    return genericResponse();
  } catch (err) {
    console.error("[request-password-reset] fatal", err);
    return genericResponse();
  }
});
