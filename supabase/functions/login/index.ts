import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Same hash function as signup
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + Deno.env.get("PASSWORD_SALT") || "webcontador_salt_2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Generate a simple session token
function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, senha } = await req.json();

    if (!email || !senha) {
      return new Response(
        JSON.stringify({ error: "E-mail e senha são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find email
    const { data: emailData } = await supabase
      .from("tb_email")
      .select("email_id")
      .eq("email_principal", email)
      .maybeSingle();

    if (!emailData) {
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find user by email_id
    const { data: userData } = await supabase
      .from("tb_usuario")
      .select(`
        user_id,
        nome,
        senha,
        ativo,
        permissao_id,
        tb_permissao!inner (nome, descricao)
      `)
      .eq("email_id", emailData.email_id)
      .maybeSingle();

    if (!userData) {
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

    // Verify password
    const senhaHash = await hashPassword(senha);
    if (senhaHash !== userData.senha) {
      return new Response(
        JSON.stringify({ error: "E-mail ou senha incorretos" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    // Extract permission data (it's an object due to !inner join)
    const permissao = userData.tb_permissao as unknown as { nome: string; descricao: string } | null;

    return new Response(
      JSON.stringify({
        success: true,
        message: "Login realizado com sucesso",
        user: {
          id: userData.user_id,
          nome: userData.nome,
          permissao: permissao?.nome || "VIEWER",
          permissao_descricao: permissao?.descricao,
        },
        session: {
          token: sessionToken,
          expires_at: expiresAt,
        },
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
