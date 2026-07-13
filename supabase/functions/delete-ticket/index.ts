// Exclusão definitiva de chamados. Apenas SUPERADMIN/ADMIN. Usa service_role para
// evitar bloqueios de RLS e apagar em cascata registros dependentes.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateSession } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let usuarioId: number;
  try { usuarioId = await validateSession(req, supabase); }
  catch (e) { return json({ error: (e as Error).message }, 401); }

  const { data: user } = await supabase
    .from("usuarios").select("id, permissao, ativo").eq("id", usuarioId).maybeSingle();
  if (!user || !user.ativo) return json({ error: "usuario_invalido" }, 403);
  if (user.permissao !== "SUPERADMIN" && user.permissao !== "ADMIN") {
    return json({ error: "sem_permissao" }, 403);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const ticketId = Number(body?.ticket_id);
  if (!ticketId) return json({ error: "ticket_id_obrigatorio" }, 400);

  // Apagar anexos do storage
  const { data: atts } = await supabase.from("ticket_attachments")
    .select("storage_path").eq("ticket_id", ticketId);
  const paths = (atts || []).map((a: any) => a.storage_path).filter(Boolean);
  if (paths.length) {
    await supabase.storage.from("ticket-attachments").remove(paths).catch(() => {});
  }

  // Cascata em tabelas dependentes (que não têm ON DELETE CASCADE)
  const dependents = [
    "ticket_attachments",
    "ticket_comments",
    "ticket_history",
    "ticket_notifications",
    "ticket_sla_alerts",
    "ticket_sla_pauses",
  ];
  for (const t of dependents) {
    await supabase.from(t).delete().eq("ticket_id", ticketId);
  }

  const { error } = await supabase.from("tickets").delete().eq("id", ticketId);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, deleted_id: ticketId });
});
