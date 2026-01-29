import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function validateSessionToken(
  supabase: any,
  token: string
): Promise<number | null> {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase.from("sessions").delete().eq("token", token);
    return null;
  }

  await supabase
    .from("sessions")
    .update({ last_activity: new Date().toISOString() })
    .eq("token", token);

  return session.user_id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate session
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: "Token não fornecido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const validatedUserId = await validateSessionToken(supabase, token);

    if (!validatedUserId) {
      return new Response(
        JSON.stringify({ success: false, message: "Sessão inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, avatarUrl } = await req.json();

    // Ensure user can only update their own avatar
    if (validatedUserId !== userId) {
      return new Response(
        JSON.stringify({ success: false, message: "Não autorizado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update avatar URL in database
    const { error } = await supabase
      .from("tb_usuario")
      .update({ avatar_url: avatarUrl })
      .eq("user_id", userId);

    if (error) {
      console.error("Database error:", error);
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao atualizar avatar" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, avatarUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ success: false, message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
