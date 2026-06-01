import { corsHeaders, getCallerUsuario, serviceClient } from "../_shared/grafana.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = await getCallerUsuario(req);
    const url = new URL(req.url);
    const requested = Number(url.searchParams.get("usuario_id") || caller.id);
    const isAdmin = ["SUPERADMIN", "ADMIN"].includes(caller.permissao);
    if (requested !== caller.id && !isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403,
      });
    }
    const svc = serviceClient();
    const { data, error } = await svc.rpc("grafana_effective_permissions", { _usuario_id: requested });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, perms: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: msg === "missing_auth" || msg === "invalid_auth" ? 401 : 500,
    });
  }
});
