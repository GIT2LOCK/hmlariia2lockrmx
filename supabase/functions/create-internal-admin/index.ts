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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Internal admin credentials
    const username = "web2lock";
    const password = "Sup*1100";

    // Check if internal user already exists
    const { data: existingEmail } = await supabase
      .from("tb_email")
      .select("email_id")
      .eq("email_principal", username)
      .maybeSingle();

    if (existingEmail) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Usuário interno já existe. Login com: " + username 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Hash password with PBKDF2
    const senhaHash = await hashPassword(password);

    // 1. Create internal email record (using username as email)
    const { data: emailData, error: emailError } = await supabase
      .from("tb_email")
      .insert({ email_principal: username })
      .select("email_id")
      .single();

    if (emailError) {
      console.error("Error creating email:", emailError);
      return new Response(
        JSON.stringify({ error: "Erro ao criar registro de e-mail interno" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Create internal CPF record (placeholder - using unique internal identifier)
    const internalCpf = "99999999999";
    
    // Check if internal CPF exists, if so reuse it
    let cpfId: number;
    const { data: existingCpf } = await supabase
      .from("tb_cpf")
      .select("cpf_id")
      .eq("cpf_numero", internalCpf)
      .maybeSingle();
    
    if (existingCpf) {
      cpfId = existingCpf.cpf_id;
    } else {
      const { data: cpfData, error: cpfError } = await supabase
        .from("tb_cpf")
        .insert({ cpf_numero: internalCpf, nome: "Sistema Interno" })
        .select("cpf_id")
        .single();

      if (cpfError) {
        console.error("Error creating CPF:", cpfError);
        // Rollback email
        await supabase.from("tb_email").delete().eq("email_id", emailData.email_id);
        return new Response(
          JSON.stringify({ error: "Erro ao criar registro de CPF interno" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      cpfId = cpfData.cpf_id;
    }

    // 3. Create superadmin user (permissao_id = 1)
    const { data: userData, error: userError } = await supabase
      .from("tb_usuario")
      .insert({
        nome: "Sistema Web2Lock",
        senha: senhaHash,
        email_id: emailData.email_id,
        cpf_id: cpfId,
        permissao_id: 1, // SUPERADMIN
        ativo: true,
        email_verificado: true,
        totp_enabled: false, // No 2FA for internal admin
      })
      .select("user_id, nome")
      .single();

    if (userError) {
      console.error("Error creating user:", userError);
      // Rollback
      await supabase.from("tb_email").delete().eq("email_id", emailData.email_id);
      return new Response(
        JSON.stringify({ error: "Erro ao criar usuário interno" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Usuário superadmin interno criado com sucesso!",
        credentials: {
          login: username,
          info: "Use este login no campo de e-mail para acessar o sistema"
        },
        user: {
          id: userData.user_id,
          nome: userData.nome,
          permissao: "SUPERADMIN"
        }
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Create internal admin error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
