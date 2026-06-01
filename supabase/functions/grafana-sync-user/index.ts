import { corsHeaders, getCallerUsuario, syncUserToGrafana, logSync } from "../_shared/grafana.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const caller = await getCallerUsuario(req);
    const body = await req.json().catch(() => ({}));
    let target = Number(body?.usuario_id || caller.id);

    const isAdmin = ["SUPERADMIN", "ADMIN"].includes(caller.permissao);
    if (target !== caller.id && !isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403,
      });
    }

    const perms = await syncUserToGrafana(target, caller.id);
    return new Response(JSON.stringify({ ok: true, perms }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    await logSync({ action: "sync_user", status: "error", error_message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: msg === "missing_auth" || msg === "invalid_auth" ? 401 : 500,
    });
  }
});
