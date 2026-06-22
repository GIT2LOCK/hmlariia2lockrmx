import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();

    if (!token || token.length < 32) {
      return new Response(JSON.stringify({ valid: false, error: "invalid_token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tokenHash = await sha256Hex(token);
    const { data: row } = await supabase
      .from("password_reset_tokens")
      .select("id, email, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ valid: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mascara o e-mail para não vazar conta completa
    const [local, domain] = row.email.split("@");
    const masked = `${local.slice(0, 2)}***@${domain ?? ""}`;

    return new Response(JSON.stringify({ valid: true, email_masked: masked }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    console.error("[validate-reset-token] fatal", err);
    return new Response(JSON.stringify({ valid: false }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
