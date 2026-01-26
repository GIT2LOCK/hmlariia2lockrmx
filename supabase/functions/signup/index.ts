import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple hash function using Web Crypto API (bcrypt not available in Deno Deploy)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + Deno.env.get("PASSWORD_SALT") || "webcontador_salt_2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nome, email, cpf, senha } = await req.json();

    // Validate required fields
    if (!nome || !email || !cpf || !senha) {
      return new Response(
        JSON.stringify({ error: "Todos os campos são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove CPF mask and validate
    const cpfNumeros = cpf.replace(/\D/g, "");
    
    // Validate CPF with digit verification algorithm
    const isValidCpf = (cpfDigits: string): boolean => {
      if (cpfDigits.length !== 11) return false;
      if (/^(\d)\1+$/.test(cpfDigits)) return false;
      
      let sum = 0;
      for (let i = 0; i < 9; i++) {
        sum += parseInt(cpfDigits[i]) * (10 - i);
      }
      let remainder = (sum * 10) % 11;
      if (remainder === 10 || remainder === 11) remainder = 0;
      if (remainder !== parseInt(cpfDigits[9])) return false;
      
      sum = 0;
      for (let i = 0; i < 10; i++) {
        sum += parseInt(cpfDigits[i]) * (11 - i);
      }
      remainder = (sum * 10) % 11;
      if (remainder === 10 || remainder === 11) remainder = 0;
      if (remainder !== parseInt(cpfDigits[10])) return false;
      
      return true;
    };
    
    if (!isValidCpf(cpfNumeros)) {
      return new Response(
        JSON.stringify({ error: "CPF inválido. Verifique os dígitos informados." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if email already exists
    const { data: existingEmail } = await supabase
      .from("tb_email")
      .select("email_id")
      .eq("email_principal", email)
      .maybeSingle();

    if (existingEmail) {
      return new Response(
        JSON.stringify({ error: "E-mail já cadastrado" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if CPF already exists
    const { data: existingCpf } = await supabase
      .from("tb_cpf")
      .select("cpf_id")
      .eq("cpf_numero", cpfNumeros)
      .maybeSingle();

    if (existingCpf) {
      return new Response(
        JSON.stringify({ error: "CPF já cadastrado" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash password
    const senhaHash = await hashPassword(senha);

    // 1. Create email record
    const { data: emailData, error: emailError } = await supabase
      .from("tb_email")
      .insert({ email_principal: email })
      .select("email_id")
      .single();

    if (emailError) {
      console.error("Error creating email:", emailError);
      return new Response(
        JSON.stringify({ error: "Erro ao criar registro de e-mail" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create CPF record
    const { data: cpfData, error: cpfError } = await supabase
      .from("tb_cpf")
      .insert({ cpf_numero: cpfNumeros, nome: nome })
      .select("cpf_id")
      .single();

    if (cpfError) {
      console.error("Error creating CPF:", cpfError);
      // Rollback email
      await supabase.from("tb_email").delete().eq("email_id", emailData.email_id);
      return new Response(
        JSON.stringify({ error: "Erro ao criar registro de CPF" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Create user with VIEWER permission (permissao_id = 4) - email auto-verified, 2FA required
    const { data: userData, error: userError } = await supabase
      .from("tb_usuario")
      .insert({
        nome: nome,
        senha: senhaHash,
        email_id: emailData.email_id,
        cpf_id: cpfData.cpf_id,
        permissao_id: 4, // VIEWER
        ativo: true,
        email_verificado: true, // Auto-verified
        totp_enabled: false, // Will be enabled after setup
      })
      .select("user_id, nome, permissao_id")
      .single();

    if (userError) {
      console.error("Error creating user:", userError);
      // Rollback email and CPF
      await supabase.from("tb_email").delete().eq("email_id", emailData.email_id);
      await supabase.from("tb_cpf").delete().eq("cpf_id", cpfData.cpf_id);
      return new Response(
        JSON.stringify({ error: "Erro ao criar usuário" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Usuário criado com sucesso. Configure a autenticação de dois fatores.",
        user: {
          id: userData.user_id,
          nome: userData.nome,
          email: email,
          permissao: "VIEWER",
        },
        requires2FASetup: true,
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
