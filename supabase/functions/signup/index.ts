import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hashPassword } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nome, email, senha } = await req.json();

    if (!nome || !email || !senha) {
      return new Response(
        JSON.stringify({ error: "Nome, e-mail e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const normalizedEmail = String(email).trim().toLowerCase();

    // Check if email already exists in usuarios
    const { data: existing } = await supabase
      .from("usuarios")
      .select("id, auth_user_id")
      .ilike("email", normalizedEmail)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "E-mail já cadastrado" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create user in Supabase Auth (auth.users)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (authError || !authData?.user) {
      console.error("[signup] auth.admin.createUser error:", authError);
      return new Response(
        JSON.stringify({ error: authError?.message || "Erro ao criar identidade" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authUserId = authData.user.id;

    // Keep PBKDF2 hash for backwards compatibility with custom login flow
    const senhaHash = await hashPassword(senha);

    // 2. Create user in public.usuarios
    const { data: userData, error: userError } = await supabase
      .from("usuarios")
      .insert({
        nome,
        email: normalizedEmail,
        senha_hash: senhaHash,
        permissao: "VIEWER",
        ativo: true,
        auth_user_id: authUserId,
      })
      .select("id, nome, email, permissao, auth_user_id")
      .single();

    if (userError) {
      console.error("[signup] insert usuarios error:", userError);
      // Rollback auth user
      await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
      return new Response(
        JSON.stringify({ error: "Erro ao criar usuário" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Apply domain rule (may set empresa_id + override permissao to CLIENTE/etc.)
    let finalUser = userData;
    try {
      await supabase.rpc("apply_domain_rule", { _usuario_id: userData.id });
      const { data: refreshed } = await supabase
        .from("usuarios")
        .select("id, nome, email, permissao, auth_user_id, empresa_id")
        .eq("id", userData.id)
        .maybeSingle();
      if (refreshed) finalUser = refreshed as any;
    } catch (e) {
      console.warn("[signup] apply_domain_rule failed:", e);
    }

    // Trigger Grafana sync in background (don't block signup)
    try {
      await supabase.functions.invoke("grafana-sync-user", { body: { usuario_id: userData.id } });
    } catch (e) {
      console.warn("[signup] grafana sync failed:", e);
    }

    // Create a temporary setupToken (custom session) for 2FA optional setup flow
    const setupToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    await supabase.from("sessions").insert({
      token: setupToken,
      user_id: userData.id,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      user_agent: req.headers.get("user-agent") || "unknown",
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Conta criada. Configure o 2FA para continuar.",
        requiresSetup2FA: true,
        setupToken,
        user: {
          id: userData.id,
          nome: userData.nome,
          email: userData.email,
          permissao: userData.permissao,
          auth_user_id: userData.auth_user_id,
        },
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
