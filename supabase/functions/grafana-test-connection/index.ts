import { corsHeaders, assertAdmin, grafanaFetch, logSync } from "../_shared/grafana.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const actor = await assertAdmin(req);
    const r = await grafanaFetch("/api/orgs");
    const orgCount = Array.isArray(r.body) ? r.body.length : null;
    await logSync({
      actor_usuario_id: actor.id,
      action: "test_connection",
      status: r.ok ? "success" : "error",
      response_payload: { status: r.status, orgCount, body: r.ok ? undefined : r.body },
    });
    return new Response(
      JSON.stringify({ ok: r.ok, status: r.status, orgCount, body: r.ok ? undefined : r.body }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: r.ok ? 200 : 502,
      },
    );
  } catch (e) {
    const msg = (e as Error).message;
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: msg === "forbidden" ? 403 : 401,
    });
  }
});
