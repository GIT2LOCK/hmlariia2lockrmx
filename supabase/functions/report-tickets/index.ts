import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authErrorResponse, requireStaff } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TICKET_COLS = [
  "id", "codigo", "titulo", "empresa_id", "unidade_id", "operadora_id", "link_id",
  "tecnico_id", "fila_id", "assigned_group_id", "categoria_id", "subcategoria_id",
  "prioridade", "status", "origem", "tipo_chamado", "nivel_escalonamento",
  "data_abertura", "data_primeiro_atendimento", "data_solucao", "data_fechamento",
  "first_response_due_at", "first_response_sla_status",
  "resolution_due_at", "resolution_sla_status",
  "motivo_encerramento", "solicitante_nome", "solicitante_email", "ativo",
].join(", ");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireStaff(req);
  } catch (e) {
    return authErrorResponse(e, corsHeaders);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: { from?: string; till?: string } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const till = body.till ? new Date(body.till) : new Date();
  const from = body.from ? new Date(body.from) : new Date(Date.now() - 365 * 86400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(till.getTime()) || from >= till) {
    return json({ error: "periodo_invalido" }, 400);
  }

  const tickets: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let page = 0; page < 40; page++) {
    const { data, error } = await supabase
      .from("tickets")
      .select(TICKET_COLS)
      .gte("data_abertura", from.toISOString())
      .lte("data_abertura", till.toISOString())
      .order("data_abertura", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return json({ error: error.message }, 500);
    tickets.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const [empresas, unidades, operadoras, tecnicos, filas, categorias, grupos, links] = await Promise.all([
    supabase.from("empresas").select("id, nome_fantasia").order("nome_fantasia"),
    supabase.from("unidades").select("id, nome_unidade, empresa_id, cidade, estado").order("nome_unidade"),
    supabase.from("operadoras").select("id, nome").order("nome"),
    supabase.from("usuarios").select("id, nome, ativo").order("nome"),
    supabase.from("ticket_filas").select("id, nome, ativo").order("nome"),
    supabase.from("ticket_categorias").select("id, nome, parent_id, ativo").order("nome"),
    supabase.from("support_groups").select("id, nome, ativo").order("nome"),
    supabase.from("links_internet").select("id, nome_link, unidade_id, operadora_id, finalidade, tipo_link"),
  ]);

  return json({
    tickets,
    range: { from: from.toISOString(), till: till.toISOString() },
    lookups: {
      empresas: empresas.data ?? [],
      unidades: unidades.data ?? [],
      operadoras: operadoras.data ?? [],
      tecnicos: tecnicos.data ?? [],
      filas: filas.data ?? [],
      categorias: categorias.data ?? [],
      grupos: grupos.data ?? [],
      links: links.data ?? [],
    },
    generated_at: new Date().toISOString(),
  });
});
