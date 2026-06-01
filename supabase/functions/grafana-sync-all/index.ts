import { corsHeaders, assertAdmin, serviceClient, syncUserToGrafana, logSync } from "../_shared/grafana.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const actor = await assertAdmin(req);
    const svc = serviceClient();
    const { data: users } = await svc.from("usuarios").select("id").eq("ativo", true);

    const results: any[] = [];
    for (const u of users || []) {
      try {
        const perms = await syncUserToGrafana(u.id, actor.id);
        results.push({ usuario_id: u.id, ok: true, perms });
      } catch (err) {
        results.push({ usuario_id: u.id, ok: false, error: (err as Error).message });
      }
    }

    await logSync({ actor_usuario_id: actor.id, action: "sync_all", status: "success", response_payload: { total: results.length } });

    return new Response(JSON.stringify({ ok: true, total: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message;
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: msg === "forbidden" ? 403 : 500,
    });
  }
});
