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

  // Token
  const authHeader = req.headers.get("Authorization");
  const expectedToken = Deno.env.get("N8N_API_TOKEN");

  if (!expectedToken) {
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ success: false, error: "Configuração do Supabase incompleta" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { empresa_id, tipodemanda_id, via_id, titulo, descricao } = await req.json();

    if (!empresa_id || !tipodemanda_id || !via_id || !titulo || !descricao) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Campos obrigatórios: empresa_id, tipodemanda_id, via_id, titulo, descricao",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // debug flag: /functions/v1/criar-demanda?debug=1
    const url = new URL(req.url);
    const debug = url.searchParams.get("debug") === "1";

    // empresa
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

    // tipo demanda: pega prazo_id
    const { data: tipoDemanda, error: tipoErr } = await supabase
      .from("tb_tipodemanda")
      .select("id, nome, prazo_id")
      .eq("id", tipodemanda_id)
      .maybeSingle();

    if (tipoErr || !tipoDemanda) {
      return new Response(
        JSON.stringify({ success: false, error: `tipodemanda_id ${tipodemanda_id} não encontrado` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!tipoDemanda.prazo_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `tipodemanda_id ${tipodemanda_id} não possui prazo_id configurado`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // via
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

    // SLA vem do tb_prazo.prazo_minutos onde tb_prazo.id = prazo_id
    const { data: prazo, error: prazoErr } = await supabase
      .from("tb_prazo")
      .select("id, prazo_minutos")
      .eq("id", tipoDemanda.prazo_id)
      .maybeSingle();

    if (prazoErr || !prazo || prazo.prazo_minutos == null) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `prazo_id ${tipoDemanda.prazo_id} não encontrado ou sem prazo_minutos`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const slaMinutos = Number(prazo.prazo_minutos);
    if (!Number.isFinite(slaMinutos) || slaMinutos <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `prazo_minutos inválido (${prazo.prazo_minutos}) para prazo_id ${tipoDemanda.prazo_id}`,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const now = new Date();
    const prazoFim = new Date(now.getTime() + slaMinutos * 60 * 1000);

    // Debug response (não cria demanda)
    if (debug) {
      return new Response(
        JSON.stringify({
          success: true,
          debug: {
            tipodemanda_id,
            prazo_id: tipoDemanda.prazo_id,
            slaMinutos,
            now: now.toISOString(),
            prazoFim: prazoFim.toISOString(),
          },
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // cpf_cnpj relation
    let cpfCnpjId: number;

    const { data: existingRelation } = await supabase
      .from("tb_cpf_cnpj")
      .select("id")
      .eq("cnpj_id", empresa_id)
      .limit(1)
      .maybeSingle();

    if (existingRelation) {
      cpfCnpjId = existingRelation.id;
    } else {
      const cpfPlaceholder = String(empresa_id).padStart(11, "0");

      const { data: existingCpf } = await supabase
        .from("tb_cpf")
        .select("cpf_id")
        .eq("cpf_numero", cpfPlaceholder)
        .maybeSingle();

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

    // INSERT — aqui tem o pulo do gato:
    // Se você suspeita de trigger sobrescrevendo, remova prazo_inicio/prazo_fim e deixe o banco calcular.
    const { data: demanda, error: demandaErr } = await supabase
      .from("tb_demanda")
      .insert({
        titulo_demanda: titulo,
        descricao_tarefa: descricao,
        via_id,
        prioridade_id: 3,
        status_id: 1,
        cnpj_cpf_id: cpfCnpjId,
        user_id: null,
        tipodemanda_id,
        prazo_inicio: now.toISOString(),
        prazo_fim: prazoFim.toISOString(),
      })
      .select("dem_id, created_at, prazo_inicio, prazo_fim")
      .single();

    if (demandaErr) throw demandaErr;

    return new Response(
      JSON.stringify({
        success: true,
        demanda_id: demanda.dem_id,
        created_at: demanda.created_at,
        prazo_inicio: demanda.prazo_inicio,
        prazo_fim: demanda.prazo_fim,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("Erro ao criar demanda:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "Erro interno do servidor" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
