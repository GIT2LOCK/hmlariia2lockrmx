import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSession, hashPassword } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const userId = await validateSession(req, supabase);

    const body = await req.json();
    const { action } = body;

    if (action === "update-info") {
      const { nome, email, telefone, avatar_url, assinatura_email } = body;
      const updates: Record<string, any> = {};
      if (nome !== undefined) updates.nome = nome;
      if (email !== undefined) updates.email = email;
      if (telefone !== undefined) updates.telefone = telefone;
      if (avatar_url !== undefined) updates.avatar_url = avatar_url;
      if (assinatura_email !== undefined) updates.assinatura_email = assinatura_email;

      if (Object.keys(updates).length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum campo para atualizar" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error } = await supabase.from("usuarios").update(updates).eq("id", userId);
      if (error) throw error;

      const { data: user } = await supabase.from("usuarios")
        .select("id, nome, email, permissao, telefone, avatar_url, totp_enabled")
        .eq("id", userId).single();

      return new Response(JSON.stringify({ success: true, user }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "change-password") {
      const { current_password, new_password } = body;
      const { data: userData } = await supabase.from("usuarios")
        .select("senha_hash").eq("id", userId).single();

      if (!userData) throw new Error("Usuário não encontrado");

      const { verifyPassword } = await import("../_shared/auth.ts");
      const isValid = await verifyPassword(current_password, userData.senha_hash);
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Senha atual incorreta" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const newHash = await hashPassword(new_password);
      await supabase.from("usuarios").update({ senha_hash: newHash }).eq("id", userId);

      return new Response(JSON.stringify({ success: true, message: "Senha alterada com sucesso" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get-sessions") {
      const { data: sessions } = await supabase.from("sessions")
        .select("id, ip_address, user_agent, criado_em, last_activity, expires_at")
        .eq("user_id", userId)
        .order("last_activity", { ascending: false });

      const currentToken = req.headers.get("Authorization")?.replace("Bearer ", "");
      const { data: currentSession } = await supabase.from("sessions")
        .select("id").eq("token", currentToken!).maybeSingle();

      return new Response(JSON.stringify({
        success: true,
        sessions: (sessions || []).map(s => ({
          ...s,
          is_current: s.id === currentSession?.id,
        })),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "revoke-session") {
      const { session_id } = body;
      await supabase.from("sessions").delete().eq("id", session_id).eq("user_id", userId);
      return new Response(JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "disable-2fa") {
      await supabase.from("usuarios").update({ totp_enabled: false, totp_secret: null }).eq("id", userId);
      return new Response(JSON.stringify({ success: true, message: "2FA desativado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "setup-2fa") {
      // Redirect to existing setup-2fa function logic
      return new Response(JSON.stringify({ error: "Use /setup-2fa endpoint" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get-profile") {
      const { data: user } = await supabase.from("usuarios")
        .select("id, nome, email, permissao, telefone, avatar_url, totp_enabled")
        .eq("id", userId).single();

      return new Response(JSON.stringify({ success: true, user }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    console.error("Profile update error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = message.includes("Token") || message.includes("Sessão") ? 401 : 500;
    return new Response(JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
