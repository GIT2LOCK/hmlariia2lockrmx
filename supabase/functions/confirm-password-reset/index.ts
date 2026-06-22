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

function validatePassword(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[a-z]/.test(pw)) return "A senha deve conter uma letra minúscula.";
  if (!/[A-Z]/.test(pw)) return "A senha deve conter uma letra maiúscula.";
  if (!/\d/.test(pw)) return "A senha deve conter um número.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "A senha deve conter um caractere especial.";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "").trim();
    const password = String(body?.password ?? "");
    const confirm = String(body?.confirm ?? "");

    if (!token || token.length < 32) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (password !== confirm) {
      return new Response(JSON.stringify({ error: "passwords_do_not_match" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      return new Response(JSON.stringify({ error: "weak_password", message: pwErr }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const tokenHash = await sha256Hex(token);
    const { data: row } = await supabase
      .from("password_reset_tokens")
      .select("id, usuario_id, auth_user_id, email, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "token_invalid_or_expired" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Localiza/cria auth_user_id
    let authUserId = row.auth_user_id as string | null;
    if (!authUserId) {
      // Tenta encontrar por e-mail
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users?.find((u: any) => (u.email || "").toLowerCase() === row.email.toLowerCase());
      if (found) authUserId = found.id;
    }
    if (!authUserId) {
      // Cria auth user com a nova senha
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: row.email,
        password,
        email_confirm: true,
      });
      if (createErr || !created.user) {
        console.error("[confirm-password-reset] createUser error", createErr);
        return new Response(JSON.stringify({ error: "auth_update_failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      authUserId = created.user.id;
      await supabase.from("usuarios").update({ auth_user_id: authUserId }).eq("id", row.usuario_id);
    } else {
      const { error: updErr } = await supabase.auth.admin.updateUserById(authUserId, { password });
      if (updErr) {
        console.error("[confirm-password-reset] updateUserById error", updErr);
        return new Response(JSON.stringify({ error: "auth_update_failed" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Limpa senha legada
    await supabase.from("usuarios").update({ senha_hash: null }).eq("id", row.usuario_id);

    // Marca token como usado e invalida outros pendentes
    const now = new Date().toISOString();
    await supabase.from("password_reset_tokens").update({ used_at: now }).eq("id", row.id);
    await supabase
      .from("password_reset_tokens")
      .update({ used_at: now })
      .eq("usuario_id", row.usuario_id)
      .is("used_at", null);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (err) {
    console.error("[confirm-password-reset] fatal", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
