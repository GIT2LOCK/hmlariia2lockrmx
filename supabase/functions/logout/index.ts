import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSession, deleteSession, deleteAllUserSessions } from "../_shared/auth.ts";

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

    // Validate current session
    let userId: number;
    try {
      userId = await validateSession(req, supabase);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro de autenticação";
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { logoutAll } = await req.json().catch(() => ({ logoutAll: false }));

    if (logoutAll) {
      // Delete all sessions for this user
      await deleteAllUserSessions(userId, supabase);
    } else {
      // Delete only current session
      const token = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (token) {
        await deleteSession(token, supabase);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Logout realizado com sucesso" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Logout error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
