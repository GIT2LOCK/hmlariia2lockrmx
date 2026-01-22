import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, deviceId, revokeAll } = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "userId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (revokeAll) {
      // Revoke all devices for user
      const { error } = await supabase
        .from("tb_dispositivo")
        .update({ is_active: false, remember_until: null })
        .eq("user_id", userId);

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          message: "Todos os dispositivos foram desconectados",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!deviceId) {
      return new Response(
        JSON.stringify({ error: "deviceId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Revoke specific device
    const { error } = await supabase
      .from("tb_dispositivo")
      .update({ is_active: false, remember_until: null })
      .eq("dispositivo_id", deviceId)
      .eq("user_id", userId);

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Dispositivo desconectado com sucesso",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error revoking device:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
