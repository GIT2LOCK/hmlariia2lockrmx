import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyPasswordHybrid, createSession, hashPassword } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeEmail(input: unknown): string {
  return String(input ?? "").trim().toLowerCase();
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function looksLikeSha256Hex(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, senha, deviceToken } = await req.json();

     const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !senha) {
      return new Response(
        JSON.stringify({ error: "E-mail e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find email (supports principal/secundario/alternativo and is case-insensitive)
    const { data: emailData, error: emailError } = await supabase
      .from("tb_email")
      .select("email_id")
      .or(
        `email_principal.ilike.${normalizedEmail},email_secundario.ilike.${normalizedEmail},email_alternativo.ilike.${normalizedEmail}`
      )
      .order("email_id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (emailError) {
      console.error("[login] email lookup error", { message: emailError.message });
    }

    if (!emailData) {
      console.log("[login] email not found");
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user by email_id
    const { data: userData, error: userError } = await supabase
      .from("tb_usuario")
      .select(`
        user_id,
        nome,
        senha,
        ativo,
        permissao_id,
        email_verificado,
        totp_enabled,
        tb_permissao!inner (nome, descricao)
      `)
      .eq("email_id", emailData.email_id)
      .order("user_id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (userError) {
      console.error("[login] user lookup error", { message: userError.message });
    }

    if (!userData) {
      console.log("[login] user not found by email_id");
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is active
    if (!userData.ativo) {
      return new Response(
        JSON.stringify({ error: "Usuário inativo. Entre em contato com o administrador." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify password using hybrid method (supports both old and new formats)
    let isValidPassword = await verifyPasswordHybrid(
      senha,
      userData.senha,
      userData.user_id,
      supabase
    );

    // Extra backward-compatibility: some older databases used SHA-256 without salt
    // or with salt prefix. If we detect a legacy 64-hex hash, try safe variants and
    // migrate to PBKDF2 on success.
    if (!isValidPassword) {
      const storedHash = String(userData.senha ?? "").toLowerCase();
      const looksLegacy = !storedHash.includes(":") && looksLikeSha256Hex(storedHash);

      if (looksLegacy) {
        const salt = Deno.env.get("PASSWORD_SALT") ?? "webcontador_salt_2024";

        const candidates: Array<{ scheme: string; digest: string }> = [
          // suffix salt is already covered by verifyPasswordHybrid, but keep it here
          // so we can detect/migrate even if legacy impl differs slightly.
          { scheme: "suffix_salt", digest: await sha256Hex(String(senha) + salt) },
          { scheme: "prefix_salt", digest: await sha256Hex(salt + String(senha)) },
          { scheme: "no_salt", digest: await sha256Hex(String(senha)) },
        ];

        const match = candidates.find((c) => c.digest === storedHash);
        if (match) {
          console.log("[login] legacy password matched; migrating", {
            user_id: userData.user_id,
            scheme: match.scheme,
          });

          const newHash = await hashPassword(String(senha));
          const { error: updateError } = await supabase
            .from("tb_usuario")
            .update({ senha: newHash })
            .eq("user_id", userData.user_id);

          if (updateError) {
            console.error("[login] failed to migrate legacy password", {
              user_id: userData.user_id,
              message: updateError.message,
            });
          }

          isValidPassword = true;
        }
      }
    }

    if (!isValidPassword) {
      console.log("[login] invalid password", { user_id: userData.user_id });
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if 2FA is enabled (mandatory)
    if (userData.totp_enabled) {
      // Check if device is trusted (remembered)
      if (deviceToken) {
        const { data: trustedDevice } = await supabase
          .from("tb_dispositivo")
          .select("dispositivo_id, remember_until")
          .eq("user_id", userData.user_id)
          .eq("device_token", deviceToken)
          .eq("is_active", true)
          .maybeSingle();

        // If device is trusted and not expired, skip 2FA
        if (trustedDevice && trustedDevice.remember_until) {
          const rememberUntil = new Date(trustedDevice.remember_until);
          if (rememberUntil > new Date()) {
            // Update last activity
            await supabase
              .from("tb_dispositivo")
              .update({ last_activity: new Date().toISOString() })
              .eq("dispositivo_id", trustedDevice.dispositivo_id);

            // Create server-side session
            const session = await createSession(supabase, userData.user_id, req);
            if (!session) {
              return new Response(
                JSON.stringify({ error: "Erro ao criar sessão" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }

            const permissao = userData.tb_permissao as unknown as { nome: string; descricao: string } | null;

            return new Response(
              JSON.stringify({
                success: true,
                message: "Login realizado com sucesso",
                user: {
                  id: userData.user_id,
                  nome: userData.nome,
                  email: email,
                  permissao: permissao?.nome || "VIEWER",
                  permissao_descricao: permissao?.descricao,
                },
                session,
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // 2FA required
      return new Response(
        JSON.stringify({
          success: false,
          requires2FA: true,
          user: {
            id: userData.user_id,
            nome: userData.nome,
          },
          message: "Digite o código do seu autenticador.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create server-side session
    const session = await createSession(supabase, userData.user_id, req);
    if (!session) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar sessão" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract permission data (it's an object due to !inner join)
    const permissao = userData.tb_permissao as unknown as { nome: string; descricao: string } | null;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login realizado com sucesso",
        user: {
          id: userData.user_id,
          nome: userData.nome,
          email: normalizedEmail,
          permissao: permissao?.nome || "VIEWER",
          permissao_descricao: permissao?.descricao,
        },
        session,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Login error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
