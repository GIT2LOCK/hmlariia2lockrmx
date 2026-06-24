import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hashPassword } from "../_shared/auth.ts";
import { syncUserToGrafana, logSync } from "../_shared/grafana.ts";

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

    // Helper: rollback completo se algo crítico falhar
    const rollback = async (reason: string) => {
      console.error("[signup] rolling back:", reason);
      await supabase.from("sessions").delete().eq("user_id", -1).catch(() => {}); // noop guard
      await supabase.from("usuarios").delete().eq("auth_user_id", authUserId).catch(() => {});
      await supabase.auth.admin.deleteUser(authUserId).catch(() => {});
    };

    // Keep PBKDF2 hash for backwards compatibility with custom login flow
    const senhaHash = await hashPassword(senha);

    // 2. Create user in public.usuarios (atomic w/ rollback)
    const { data: userData, error: userError } = await supabase
      .from("usuarios")
      .insert({
        nome,
        email: normalizedEmail,
        senha_hash: senhaHash,
        permissao: "CLIENTE",
        ativo: true,
        auth_user_id: authUserId,
      })
      .select("id, nome, email, permissao, auth_user_id")
      .single();

    if (userError || !userData) {
      await rollback(`insert usuarios: ${userError?.message}`);
      return new Response(
        JSON.stringify({ error: "Erro ao criar usuário" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Apply domain rule (may override permissao/empresa). Non-fatal.
    let finalUser: any = userData;
    try {
      await supabase.rpc("apply_domain_rule", { _usuario_id: userData.id });
      const { data: refreshed } = await supabase
        .from("usuarios")
        .select("id, nome, email, permissao, auth_user_id, empresa_id, access_scope")
        .eq("id", userData.id)
        .maybeSingle();
      if (refreshed) finalUser = refreshed as any;
    } catch (e) {
      console.warn("[signup] apply_domain_rule failed:", e);
    }

    // 3.1 Todo novo usuário recebe acesso ao Ariia + Grafana por padrão.
    // O administrador decide posteriormente restrições específicas (escopo/permissões).
    try {
      const { data: scoped } = await supabase
        .from("usuarios")
        .update({ access_scope: "ARIIA_AND_GRAFANA", atualizado_em: new Date().toISOString() })
        .eq("id", userData.id)
        .select("id, nome, email, permissao, auth_user_id, empresa_id, access_scope")
        .maybeSingle();
      if (scoped) finalUser = scoped as any;
    } catch (e) {
      console.warn("[signup] set ARIIA_AND_GRAFANA failed:", e);
    }

    // 4. Sincroniza automaticamente com o Grafana (chamada direta — sem JWT,
    //    pois functions.invoke a partir do service role não passa por getCallerUsuario).
    try {
      const perms = await syncUserToGrafana(userData.id, userData.id);
      console.log("[signup] grafana sync ok:", JSON.stringify(perms));
    } catch (e) {
      const msg = (e as Error).message;
      console.error("[signup] grafana sync failed:", msg);
      await logSync({
        usuario_id: userData.id,
        actor_usuario_id: userData.id,
        action: "sync_user_signup",
        status: "error",
        error_message: msg,
      });
    }

    // 5. Setup token p/ fluxo de 2FA. Falha aqui aborta a criação inteira.
    const setupToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");

    const { error: sessionErr } = await supabase.from("sessions").insert({
      token: setupToken,
      user_id: userData.id,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      ip_address: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown",
      user_agent: req.headers.get("user-agent") || "unknown",
    });

    if (sessionErr) {
      await rollback(`insert session: ${sessionErr.message}`);
      return new Response(
        JSON.stringify({ error: "Erro ao iniciar sessão de cadastro" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    return new Response(
      JSON.stringify({
        success: true,
        message: "Conta criada. Configure o 2FA para continuar.",
        requiresSetup2FA: true,
        setupToken,
        user: {
          id: finalUser.id,
          nome: finalUser.nome,
          email: finalUser.email,
          permissao: finalUser.permissao,
          auth_user_id: finalUser.auth_user_id,
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
