import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Método não permitido. Use POST." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Validate Bearer token
  const authHeader = req.headers.get("Authorization");
  const expectedToken = Deno.env.get("N8N_API_TOKEN");

  if (!expectedToken) {
    console.error("N8N_API_TOKEN not configured");
    return new Response(JSON.stringify({ success: false, error: "Configuração do servidor incompleta" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ success: false, error: "Token de autenticação ausente" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  if (token !== expectedToken) {
    return new Response(JSON.stringify({ success: false, error: "Token inválido" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { empresa_id, tipodemanda_id, via_id, titulo, descricao } = body;

    // Validate required fields
    if (!empresa_id || !tipodemanda_id || !via_id || !titulo || !descricao) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Campos obrigatórios: empresa_id, tipodemanda_id, via_id, titulo, descricao",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured");
      return new Response(JSON.stringify({ success: false, error: "Configuração do Supabase incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate empresa_id exists
    const { data: empresa, error: empresaErr } = await supabase
      .from("tb_cnpj")
      .select("cnpj_id, razao_social")
      .eq("cnpj_id", empresa_id)
      .maybeSingle();

    if (empresaErr || !empresa) {
      return new Response(JSON.stringify({ success: false, error: `empresa_id ${empresa_id} não encontrada` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate tipodemanda_id exists and get prazo_id (SLA is derived from prazo_id via tb_prazo)
    const { data: tipoDemanda, error: tipoErr } = await supabase
      .from("tb_tipodemanda")
      .select("id, nome, prazo_id")
      .eq("id", tipodemanda_id)
      .maybeSingle();

    if (tipoErr || !tipoDemanda) {
      return new Response(
        JSON.stringify({ success: false, error: `tipodemanda_id ${tipodemanda_id} não encontrado` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!tipoDemanda.prazo_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `tipodemanda_id ${tipodemanda_id} não possui prazo_id configurado`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Fetch SLA from tb_prazo using prazo_id
    const { data: prazo, error: prazoErr } = await supabase
      .from("tb_prazo")
      .select("prazo_id, sla_minutos")
      .eq("prazo_id", tipoDemanda.prazo_id)
      .maybeSingle();

    if (prazoErr || !prazo || prazo.sla_minutos == null) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `prazo_id ${tipoDemanda.prazo_id} não encontrado ou sem sla_minutos`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate via_id exists
    const { data: via, error: viaErr } = await supabase
      .from("tb_via")
      .select("via_id")
      .eq("via_id", via_id)
      .maybeSingle();

    if (viaErr || !via) {
      return new Response(JSON.stringify({ success: false, error: `via_id ${via_id} não encontrada` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find or create cpf_cnpj entry for the empresa
    let cpfCnpjId: number;

    const { data: existingRelation, error: existingRelErr } = await supabase
      .from("tb_cpf_cnpj")
      .select("id")
      .eq("cnpj_id", empresa_id)
      .limit(1)
      .maybeSingle();

    if (existingRelErr) {
      console.error("Erro ao buscar tb_cpf_cnpj:", existingRelErr);
      return new Response(JSON.stringify({ success: false, error: "Erro ao validar relação CPF/CNPJ" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (existingRelation) {
      cpfCnpjId = existingRelation.id;
    } else {
      // Create placeholder CPF and relation (same logic as manual form)
      const cpfPlaceholder = String(empresa_id).padStart(11, "0");

      const { data: existingCpf, error: existingCpfErr } = await supabase
        .from("tb_cpf")
        .select("cpf_id")
        .eq("cpf_numero", cpfPlaceholder)
        .maybeSingle();

      if (existingCpfErr) {
        console.error("Erro ao buscar tb_cpf:", existingCpfErr);
        return new Response(JSON.stringify({ success: false, error: "Erro ao validar CPF placeholder" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let cpfId: number;

      if (existingCpf) {
        cpfId = existingCpf.cpf_id;
      } else {
        const { data: newCpf, error: cpfErr } = await supabase
          .from("tb_cpf")
          .insert({ nome: empresa.razao_social, cpf_numero: cpfPlaceholder })
          .select("cpf_id")
          .single();

        if (cpfErr) throw cpfErr;
        cpfId = newCpf.cpf_id;
      }

      const { data: newRelation, error: relErr } = await supabase
        .from("tb_cpf_cnpj")
        .insert({ cpf_id: cpfId, cnpj_id: empresa_id })
        .select("id")
        .single();

      if (relErr) throw relErr;
      cpfCnpjId = newRelation.id;
    }

    // Calculate deadlines based on SLA from tb_prazo (same logic as manual form)
    const now = new Date();
    const slaMinutos = Number(prazo.sla_minutos);

    if (!Number.isFinite(slaMinutos) || slaMinutos <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `SLA inválido (sla_minutos=${prazo.sla_minutos}) para prazo_id ${tipoDemanda.prazo_id}`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const prazoFim = new Date(now.getTime() + slaMinutos * 60 * 1000);

    // Insert demanda
    const { data: demanda, error: demandaErr } = await supabase
      .from("tb_demanda")
      .insert({
        titulo_demanda: titulo,
        descricao_tarefa: descricao,
        via_id: via_id,
        prioridade_id: 3, // Média
        status_id: 1, // Novo
        cnpj_cpf_id: cpfCnpjId,
        user_id: null,
        prazo_inicio: now.toISOString(),
        prazo_fim: prazoFim.toISOString(),
        tipodemanda_id: tipodemanda_id,
      })
      .select("dem_id, created_at")
      .single();

    if (demandaErr) throw demandaErr;

    return new Response(
      JSON.stringify({
        success: true,
        demanda_id: demanda.dem_id,
        created_at: demanda.created_at,
      }),
      {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Erro ao criar demanda:", error);
    return new Response(JSON.stringify({ success: false, error: error?.message || "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
