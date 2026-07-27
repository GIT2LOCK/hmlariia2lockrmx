import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyPassword, createSession } from "../_shared/auth.ts";
import { syncUserToGrafana, logSync } from "../_shared/grafana.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Ensures the user has a corresponding entry in auth.users.
 * - If auth_user_id is null (legacy user), creates one with the same password.
 * - If auth_user_id exists, resets the auth.users password to match (keeps them in sync).
 * Returns the auth_user_id (uuid) or null on failure.
 */
async function ensureAuthUser(
  supabase: any,
  userId: number,
  email: string,
  password: string,
  currentAuthUserId: string | null,
): Promise<string | null> {
  try {
    if (currentAuthUserId) {
      // Keep password in sync (in case it was changed via the old flow)
      await supabase.auth.admin.updateUserById(currentAuthUserId, { password });
      return currentAuthUserId;
    }

    // Legacy migration: check if an auth.users already exists with this email
    const { data: list } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const existing = list?.users?.find(
      (u: any) => (u.email || "").toLowerCase() === email.toLowerCase(),
    );

    let authUserId: string | null = existing?.id ?? null;

    if (authUserId) {
      await supabase.auth.admin.updateUserById(authUserId, { password });
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !created?.user) {
        console.error("[login] migration createUser error:", error);
        return null;
      }
      authUserId = created.user.id;
    }

    await supabase
      .from("usuarios")
      .update({ auth_user_id: authUserId })
      .eq("id", userId);

    return authUserId;
  } catch (e) {
    console.error("[login] ensureAuthUser error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, senha } = await req.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();

    if (!normalizedEmail || !senha) {
      return new Response(
        JSON.stringify({ error: "E-mail e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userData, error: userError } = await supabase
      .from("usuarios")
      .select("id, nome, email, senha_hash, ativo, permissao, totp_enabled, auth_user_id")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (userError) console.error("[login] user lookup error", userError.message);

    if (!userData) {
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!userData.ativo) {
      return new Response(
        JSON.stringify({ error: "Usuário inativo. Entre em contato com o administrador." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate password using legacy PBKDF2 (still the source of truth for login)
    const hasLegacyHash = !!userData.senha_hash && userData.senha_hash !== "SUPABASE_AUTH";
    let isValid = false;

    if (hasLegacyHash) {
      isValid = await verifyPassword(senha, userData.senha_hash);
    }

    // If no legacy hash (already migrated to Supabase Auth only), try Supabase Auth signIn server-side
    if (!isValid && userData.auth_user_id) {
      // Use anon client to sign in (won't return tokens here, just validates)
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: signInData, error: signInErr } = await anonClient.auth.signInWithPassword({
        email: normalizedEmail,
        password: senha,
      });
      if (!signInErr && signInData?.user) {
        isValid = true;
        // Sign out immediately — frontend will sign in on its own
        await anonClient.auth.signOut();
      }
    }

    if (!isValid) {
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure auth.users entry exists & password is in sync (migration progressiva)
    await ensureAuthUser(
      supabase,
      userData.id,
      normalizedEmail,
      senha,
      userData.auth_user_id ?? null,
    );

    // Apply domain rule + sync Grafana (best-effort, never blocks login)
    try {
      await supabase.rpc("apply_domain_rule", { _usuario_id: userData.id });
    } catch (e) {
      console.warn("[login] apply_domain_rule failed:", e);
    }
    try {
      const perms = await syncUserToGrafana(userData.id, userData.id);
      console.log("[login] grafana sync ok:", JSON.stringify(perms));
    } catch (e) {
      const msg = (e as Error).message;
      console.warn("[login] grafana sync failed:", msg);
      await logSync({
        usuario_id: userData.id,
        actor_usuario_id: userData.id,
        action: "sync_user_login",
        status: "error",
        error_message: msg,
      });
    }

    // Re-read final permissao in case domain rule changed it
    const { data: refreshed } = await supabase
      .from("usuarios")
      .select("permissao")
      .eq("id", userData.id)
      .maybeSingle();
    if (refreshed?.permissao) userData.permissao = refreshed.permissao;


    // If 2FA is enabled, don't create session yet.
    // A signed short-lived challenge token proves the password step was passed.
    if (userData.totp_enabled) {
      const challengeToken = await signChallengeToken(userData.id);
      return new Response(
        JSON.stringify({
          success: true,
          requires2FA: true,
          userId: userData.id,
          challengeToken,
          message: "Verificação 2FA necessária",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    const session = await createSession(supabase, userData.id, req);
    if (!session) {
      return new Response(
        JSON.stringify({ error: "Erro ao criar sessão" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login realizado com sucesso",
        user: { id: userData.id, nome: userData.nome, email: userData.email, permissao: userData.permissao },
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
